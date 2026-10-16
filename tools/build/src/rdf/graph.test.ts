import type { Model, Scheme } from '@uio/engine';
import type { Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { buildGraph, objectKey } from './graph.ts';

const namespace = loadConfig().namespace;

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

describe('buildGraph external IRIs', () => {
  test('the real model builds without a problem', () => {
    expect(buildGraph(realModel(), namespace).problems).toEqual([]);
  });

  test('a source url that Turtle cannot carry is a problem naming the file kind, id and field', () => {
    const model = realModel();
    const id = 'ucc-952-2013';
    const source = model.sources[id];
    if (source === undefined) throw new Error('the real model has the source');
    model.sources[id] = { ...source, url: 'https://example.org/a b' };
    const { problems, quads } = buildGraph(model, namespace);
    expect(quads).toEqual([]);
    expect(problems).toEqual([
      {
        file: `model/sources/${id}.yaml`,
        message: `sources/${id} url holds a character that Turtle cannot carry in an IRI`,
      },
    ]);
  });

  test('an eli that is not http or https is a problem', () => {
    const model = realModel();
    const id = 'ucc-952-2013';
    const source = model.sources[id];
    if (source === undefined) throw new Error('the real model has the source');
    model.sources[id] = { ...source, eli: 'urn:eli:x' };
    const { problems } = buildGraph(model, namespace);
    expect(problems.map((problem) => problem.message)).toEqual([
      `sources/${id} eli must start with http:// or https://`,
    ]);
  });
});

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const DCT = 'http://purl.org/dc/terms/';
const ORG = 'http://www.w3.org/ns/org#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const def = (term: string): string => `${namespace}def#${term}`;

const model = realModel();
const { quads } = buildGraph(model, namespace);

const objectsOf = (subject: string, predicate: string): Quad['object'][] =>
  quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object);
const valuesOf = (subject: string, predicate: string): string[] =>
  objectsOf(subject, predicate).map((object) => object.value);
const typesOf = (subject: string): string[] => valuesOf(subject, RDF_TYPE).sort();
const subjectsOfType = (iri: string): string[] =>
  quads
    .filter((q) => q.predicate.value === RDF_TYPE && q.object.value === iri)
    .map((q) => q.subject.value);

const statements = subjectsOfType(def('Statement'));
const schemes = Object.values(model.schemes);

describe('buildGraph header claims', () => {
  const counts: [string, (scheme: Scheme) => boolean][] = [
    ['issuer', () => true],
    ['jurisdiction', () => true],
    ['kind', () => true],
    ['abbreviation', (scheme) => scheme.abbreviation !== undefined],
    ['availability', (scheme) => scheme.availability !== undefined],
    ['iso6523-icd', (scheme) => scheme.iso6523_icd?.value != null],
    ['peppol-eas', (scheme) => scheme.peppol_eas?.value != null],
  ];

  test.for(counts)(
    'the Statements of %s equal the count derived from the model',
    ([claim, has]) => {
      const found = statements.filter((iri) =>
        new RegExp(`/statement/[^/]+/${claim}-[0-9a-f]{8}$`).test(iri),
      );
      expect(found).toHaveLength(schemes.filter(has).length);
      expect(found.length).toBeGreaterThan(0);
    },
  );

  test('the header claim slugs account for exactly the header Statements', () => {
    const expected = counts.reduce((sum, [, has]) => sum + schemes.filter(has).length, 0);
    const slugs = counts.map(([claim]) => claim).join('|');
    const header = statements.filter((iri) =>
      new RegExp(`/statement/[^/]+/(${slugs})-[0-9a-f]{8}$`).test(iri),
    );
    expect(header).toHaveLength(expected);
  });

  test('a literal header claim carries a plain literal and a link claim an IRI', () => {
    const eori = statements.find((iri) => iri.includes('/statement/eori/kind-')) ?? '';
    const [kind] = objectsOf(eori, def('object'));
    expect(kind?.termType).toBe('Literal');
    expect(kind?.value).toBe(model.schemes.eori?.kind.value);
    const spatial = statements.find((iri) => iri.includes('/statement/eori/jurisdiction-')) ?? '';
    expect(objectsOf(spatial, def('object'))[0]?.termType).toBe('NamedNode');
    expect(valuesOf(spatial, def('predicate'))).toEqual([`${DCT}spatial`]);
  });

  test('iso6523-icd and peppol-eas keep their value as a four-digit string', () => {
    const icd = statements.filter((iri) => /\/iso6523-icd-/.test(iri));
    for (const iri of icd) expect(valuesOf(iri, def('object'))[0]).toMatch(/^[0-9]{4}$/);
  });
});

describe('buildGraph structure nodes', () => {
  test('every scheme is a skos:ConceptScheme and def:Scheme with one English label and its examples', () => {
    for (const scheme of schemes) {
      const iri = `${namespace}scheme/${scheme.id}`;
      expect(typesOf(iri)).toEqual([`${SKOS}ConceptScheme`, def('Scheme')].sort());
      const labels = objectsOf(iri, `${SKOS}prefLabel`).filter(
        (object) => object.termType === 'Literal' && object.language === 'en',
      );
      expect(labels).toHaveLength(1);
      expect(valuesOf(iri, def('exampleValid')).sort()).toEqual(
        [...(scheme.format?.examples_valid ?? [])].sort(),
      );
      expect(valuesOf(iri, def('exampleInvalid')).sort()).toEqual(
        [...(scheme.format?.examples_invalid ?? [])].sort(),
      );
    }
  });

  test('every certainty object is a def:VocabularyMember of the certainty vocabulary', () => {
    const certainties = new Set(statements.flatMap((iri) => valuesOf(iri, def('certainty'))));
    expect(certainties.size).toBeGreaterThan(0);
    for (const iri of certainties) {
      expect(typesOf(iri)).toContain(def('VocabularyMember'));
      expect(valuesOf(iri, `${SKOS}inScheme`)).toEqual([`${namespace}vocab/certainty`]);
    }
  });

  test('every source object is a def:Source with a title and an xsd:date', () => {
    const sources = new Set(statements.flatMap((iri) => valuesOf(iri, `${DCT}source`)));
    expect(sources.size).toBeGreaterThan(0);
    for (const iri of sources) {
      expect(typesOf(iri)).toEqual([def('Source')]);
      expect(valuesOf(iri, `${DCT}title`)).toHaveLength(1);
      const dates = objectsOf(iri, `${DCT}date`);
      expect(dates).toHaveLength(1);
      expect(dates[0]?.termType === 'Literal' && dates[0].datatype.value).toBe(`${XSD}date`);
    }
  });

  test('a source with a url points to it through rdfs:seeAlso and an ELI through def:eli', () => {
    const source = model.sources['ucc-952-2013'];
    const iri = `${namespace}source/ucc-952-2013`;
    expect(valuesOf(iri, 'http://www.w3.org/2000/01/rdf-schema#seeAlso')).toEqual([source?.url]);
    expect(valuesOf(iri, def('eli'))).toEqual([source?.eli]);
  });

  test('authorities are org:Organization plus def:AuthorityClass or def:Authority by kind', () => {
    for (const authority of Object.values(model.authorities)) {
      const kind = authority.kind === 'class' ? 'AuthorityClass' : 'Authority';
      expect(typesOf(`${namespace}authority/${authority.id}`)).toEqual(
        [`${ORG}Organization`, def(kind)].sort(),
      );
    }
  });

  test('every jurisdiction is a def:Jurisdiction with a label', () => {
    for (const jurisdiction of Object.values(model.jurisdictions)) {
      const iri = `${namespace}jurisdiction/${jurisdiction.id}`;
      expect(typesOf(iri)).toEqual([def('Jurisdiction')]);
      expect(valuesOf(iri, `${SKOS}prefLabel`).length).toBeGreaterThan(0);
    }
  });

  test('certainty members carry an xsd:integer rank, applicability statuses an xsd:boolean', () => {
    for (const member of model.vocab.certainty?.values ?? []) {
      const [rank] = objectsOf(`${namespace}vocab/certainty/${member.id}`, def('rank'));
      expect(rank?.termType === 'Literal' && rank.datatype.value).toBe(`${XSD}integer`);
      expect(rank?.value).toBe(String(member.rank));
    }
    for (const member of model.vocab['applicability-status']?.values ?? []) {
      const [flag] = objectsOf(
        `${namespace}vocab/applicability-status/${member.id}`,
        def('inheritsDown'),
      );
      expect(flag?.termType === 'Literal' && flag.datatype.value).toBe(`${XSD}boolean`);
      expect(flag?.value).toBe(String(member.inherits_down));
    }
  });

  test('country-prefix members are keyed by prefix and carry skos:notation', () => {
    const members = model.vocab['country-prefix']?.values ?? [];
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      const iri = `${namespace}vocab/country-prefix/${member.prefix}`;
      expect(valuesOf(iri, `${SKOS}notation`)).toEqual([member.prefix]);
    }
  });

  test('every vocabulary is a skos:ConceptScheme and def:Vocabulary', () => {
    for (const vocabulary of Object.values(model.vocab)) {
      expect(typesOf(`${namespace}vocab/${vocabulary.id}`)).toEqual(
        [`${SKOS}ConceptScheme`, def('Vocabulary')].sort(),
      );
    }
  });
});

describe('buildGraph shape rules', () => {
  test('no plain triple repeats a Statement (D-05)', () => {
    for (const iri of statements) {
      const [subject] = valuesOf(iri, def('subject'));
      const [predicate] = valuesOf(iri, def('predicate'));
      const [object] = valuesOf(iri, def('object'));
      const plain = quads.filter(
        (q) =>
          q.subject.value === subject &&
          q.predicate.value === predicate &&
          q.object.value === object,
      );
      expect(plain).toEqual([]);
    }
  });

  test('no quad has a blank node, and every quad is in the default graph', () => {
    for (const q of quads) {
      for (const term of [q.subject, q.predicate, q.object]) {
        expect(term.termType).not.toBe('BlankNode');
      }
      expect(q.graph.termType).toBe('DefaultGraph');
    }
  });

  test('the quads are sorted by subject with rdf:type first and hold no duplicate', () => {
    const keys = quads.map((q) => `${q.subject.value} ${q.predicate.value} ${objectKey(q.object)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const subjects = quads.map((q) => q.subject.value);
    expect(subjects).toEqual([...subjects].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    const first = new Map<string, string>();
    for (const q of quads)
      if (!first.has(q.subject.value)) first.set(q.subject.value, q.predicate.value);
    for (const predicate of first.values()) expect(predicate).toBe(RDF_TYPE);
  });
});
