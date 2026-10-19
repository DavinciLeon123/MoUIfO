import type { Model } from '@uio/engine';
import { DataFactory, type Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { buildGraph } from './graph.ts';
import { OWL, PROV, RDF, RDFS, SKOS } from './iris.ts';
import {
  definedTerms,
  emittedTerms,
  ONTOLOGY_FILE,
  ontologyProblems,
  readOntology,
} from './ontology.ts';

const { namedNode, quad } = DataFactory;
const namespace = loadConfig().namespace;
const def = (term: string): string => `${namespace}def#${term}`;
const ORG = 'http://www.w3.org/ns/org#';

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

function ontologyQuads(): Quad[] {
  const read = readOntology(REPO_ROOT);
  if ('problem' in read) throw new Error(read.problem.message);
  return read.quads;
}

const graphQuads = buildGraph(realModel(), namespace).quads;

const objectsOf = (quads: readonly Quad[], subject: string, predicate: string): string[] =>
  quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object.value);

describe('the ontology and the generated graph agree (D-08)', () => {
  test('the real graph emits a def: term set and the ontology defines exactly that set', () => {
    const emitted = emittedTerms(graphQuads, namespace);
    const defined = definedTerms(ontologyQuads(), namespace);
    expect(emitted.length).toBeGreaterThan(30);
    expect(defined).toEqual(emitted);
    expect(emitted).toEqual([...emitted].sort());
  });

  test('emittedTerms counts class, predicate and def:predicate value positions', () => {
    const emitted = emittedTerms(graphQuads, namespace);
    for (const term of ['Statement', 'Authority', 'subject', 'trustLifecycle', 'inheritsDown']) {
      expect(emitted).toContain(def(term));
    }
  });

  test('the real ontology and graph give no problem', () => {
    expect(ontologyProblems(ontologyQuads(), graphQuads, namespace)).toEqual([]);
  });

  test('a copy without def:Rule reports def:Rule as emitted but not defined', () => {
    const without = ontologyQuads().filter((q) => q.subject.value !== def('Rule'));
    expect(ontologyProblems(without, graphQuads, namespace)).toEqual([
      { file: ONTOLOGY_FILE, message: 'def:Rule is emitted but not defined' },
    ]);
  });

  test('an unused definition is reported as defined but not emitted', () => {
    const extra = quad(namedNode(def('Unused')), namedNode(`${RDF}type`), namedNode(`${OWL}Class`));
    expect(ontologyProblems([...ontologyQuads(), extra], graphQuads, namespace)).toEqual([
      { file: ONTOLOGY_FILE, message: 'def:Unused is defined but not emitted (D-08)' },
    ]);
  });
});

describe('every defined term is documented and aligned', () => {
  const quads = ontologyQuads();
  const terms = definedTerms(quads, namespace);

  test('each term has exactly one English label and one English comment', () => {
    for (const term of terms) {
      const english = (predicate: string): number =>
        quads.filter(
          (q) =>
            q.subject.value === term &&
            q.predicate.value === predicate &&
            q.object.termType === 'Literal' &&
            q.object.language === 'en',
        ).length;
      expect([term, english(`${RDFS}label`)]).toEqual([term, 1]);
      expect([term, english(`${RDFS}comment`)]).toEqual([term, 1]);
    }
  });

  test('the classes align with PROV, SKOS and ORG', () => {
    const parents = (term: string): string[] => objectsOf(quads, def(term), `${RDFS}subClassOf`);
    expect(parents('Statement')).toContain(`${PROV}Entity`);
    expect(parents('Scheme')).toContain(`${SKOS}ConceptScheme`);
    expect(parents('Vocabulary')).toContain(`${SKOS}ConceptScheme`);
    expect(parents('VocabularyMember')).toContain(`${SKOS}Concept`);
    expect(parents('Authority')).toContain(`${ORG}Organization`);
    expect(parents('AuthorityClass')).toContain(`${ORG}Organization`);
  });

  test('dct:source is a sub-property of prov:wasDerivedFrom (W3C PROV-DC)', () => {
    expect(objectsOf(quads, 'http://purl.org/dc/terms/source', `${RDFS}subPropertyOf`)).toEqual([
      `${PROV}wasDerivedFrom`,
    ]);
  });

  test('the ported classes carry a skos:historyNote naming their v0.9 concept', () => {
    const note = (term: string): string =>
      objectsOf(quads, def(term), `${SKOS}historyNote`).join(' ');
    expect(note('Scheme')).toContain(':IdentifierType');
    expect(note('Authority')).toContain(':IssuingBody');
    expect(note('AuthorityClass')).toContain(':IssuingBody');
    expect(note('Condition')).toContain(':Context');
    expect(note('issuingCountry')).toContain(':Country');
    expect(note('level')).toContain(':identifiesActor');
    expect(note('role')).toContain(':identifiesRole');
    expect(note('relation')).toContain(':derivedFrom');
  });

  test('no subject of the ontology is named after a deferred v0.9 concept', () => {
    const deferred = [
      'Actor',
      'NaturalPerson',
      'LegalEntity',
      'Enterprise',
      'Branch',
      'Role',
      'TaxableEntityRole',
      'EconomicOperatorRole',
      'IdentifierInstance',
    ];
    const subjects = new Set(quads.map((q) => q.subject.value));
    for (const name of deferred) {
      expect(subjects.has(def(name))).toBe(false);
      expect(subjects.has(`${namespace}${name}`)).toBe(false);
      expect(subjects.has(`http://example.org/id-ontology#${name}`)).toBe(false);
    }
  });

  test('def:predicate value properties say they are not asserted as direct triples (D-05)', () => {
    const emittedAsTriplePredicate = new Set(graphQuads.map((q) => q.predicate.value));
    const valueOnly = terms.filter(
      (term) =>
        !emittedAsTriplePredicate.has(term) &&
        !objectsOf(graphQuads, term, `${RDF}type`).length &&
        graphQuads.some((q) => q.predicate.value === def('predicate') && q.object.value === term),
    );
    expect(valueOnly.length).toBeGreaterThanOrEqual(20);
    for (const term of valueOnly) {
      const comment = objectsOf(quads, term, `${RDFS}comment`).join(' ');
      expect([term, /value of def:predicate/.test(comment)]).toEqual([term, true]);
    }
  });
});
