import type { Model } from '@uio/engine';
import type { Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { buildGraph } from './graph.ts';
import { canon } from './hash.ts';
import { jsonLiteral } from './literals.ts';

const namespace = loadConfig().namespace;

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

const RDF_JSON = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON';
const RDFS_SEE_ALSO = 'http://www.w3.org/2000/01/rdf-schema#seeAlso';
const DCT_TITLE = 'http://purl.org/dc/terms/title';
const SKOS_NOTE = 'http://www.w3.org/2004/02/skos/core#note';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
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
const statementsOf = (subjectId: string, claim: string): string[] =>
  quads
    .filter(
      (q) =>
        q.predicate.value === RDF_TYPE &&
        q.object.value === def('Statement') &&
        new RegExp(`/statement/${subjectId}/${claim}-[0-9a-f]{8}$`).test(q.subject.value),
    )
    .map((q) => q.subject.value);

describe('conditional pattern Statements (tracer)', () => {
  test('the Dutch legal-person pattern of eori points to a minted Condition node', () => {
    const iri = statementsOf('eori', 'pattern').find((statement) =>
      valuesOf(statement, def('object')).includes('^NL[0-9]{9}$'),
    );
    expect(iri).toBeDefined();
    const statement = iri ?? '';
    expect(valuesOf(statement, def('predicate'))).toEqual([def('formatPattern')]);
    const [position] = objectsOf(statement, def('position'));
    expect(position?.value).toBe('2');
    expect(position?.termType === 'Literal' && position.datatype.value).toBe(`${XSD}integer`);
    const conditions = valuesOf(statement, def('condition'));
    expect(conditions).toHaveLength(1);
    const condition = conditions[0] ?? '';
    expect(condition).toMatch(new RegExp(`^${namespace}condition/[0-9a-f]{8}$`));
    expect(valuesOf(condition, RDF_TYPE)).toEqual([def('Condition')]);
    expect(valuesOf(condition, def('issuingCountry'))).toEqual([`${namespace}jurisdiction/NL`]);
    expect(valuesOf(condition, def('entityForm'))).toEqual([
      `${namespace}vocab/entity-form/legal-person`,
    ]);
  });

  test('a pattern without a condition has no def:condition and still has its position', () => {
    const iri = statementsOf('eori', 'pattern').find((statement) =>
      valuesOf(statement, def('object')).includes('^[A-Z]{2}[A-Z0-9]{1,15}$'),
    );
    expect(iri).toBeDefined();
    expect(valuesOf(iri ?? '', def('condition'))).toEqual([]);
    expect(valuesOf(iri ?? '', def('position'))).toEqual(['1']);
  });

  test('the same condition gives one node shared by several Statements', () => {
    const nodes = new Set(
      quads.filter((q) => q.predicate.value === def('condition')).map((q) => q.object.value),
    );
    const typed = quads.filter(
      (q) => q.predicate.value === RDF_TYPE && q.object.value === def('Condition'),
    );
    expect(typed).toHaveLength(nodes.size);
  });
});

const scheme = (id: string) => {
  const found = model.schemes[id];
  if (found === undefined) throw new Error(`the real model has the scheme ${id}`);
  return found;
};
const iriOf = (kind: string, id: string): string => `${namespace}${kind}/${id}`;
const vocabIri = (vocabulary: string, member: string): string =>
  `${namespace}vocab/${vocabulary}/${member}`;
const sorted = (values: string[]): string[] => [...values].sort();

describe('remaining scheme claim kinds', () => {
  test('eori has one applicability Statement per status', () => {
    const entries = scheme('eori').applicability ?? [];
    const expected = entries.flatMap((entry) =>
      entry.status.map((status) => `${entry.jurisdiction}|${status}|${entry.source}`),
    );
    expect(expected).toHaveLength(7);
    const found = statementsOf('eori', 'applicability').map((iri) => {
      const [object] = valuesOf(iri, def('object'));
      const [status] = valuesOf(iri, def('status'));
      const [source] = valuesOf(iri, 'http://purl.org/dc/terms/source');
      expect(valuesOf(iri, def('predicate'))).toEqual([def('applicability')]);
      return `${object?.split('/').pop()}|${status?.split('/').pop()}|${source?.split('/').pop()}`;
    });
    expect(sorted(found)).toEqual(sorted(expected));
    for (const iri of statementsOf('eori', 'applicability')) {
      expect(valuesOf(iri, def('status'))[0]).toMatch(
        new RegExp(`^${namespace}vocab/applicability-status/`),
      );
    }
  });

  test('every persistence entry is one Statement named by its event, also with equal behaviour', () => {
    const entries = scheme('eori').persistence ?? [];
    const found = statementsOf('eori', 'persistence');
    expect(found).toHaveLength(entries.length);
    expect(new Set(found).size).toBe(entries.length);
    expect(sorted(found.flatMap((iri) => valuesOf(iri, def('event'))))).toEqual(
      sorted(entries.map((entry) => vocabIri('persistence-event', entry.event))),
    );
    const unchanged = entries.filter((entry) => entry.behaviour === 'Unchanged');
    expect(unchanged.length).toBeGreaterThan(1);
  });

  test('vat-nl checksum Statements carry the algorithm, the position and the over literal', () => {
    const entries = scheme('vat-nl').format?.checksum ?? [];
    const found = statementsOf('vat-nl', 'checksum');
    expect(found).toHaveLength(entries.length);
    const first = found.find((iri) =>
      valuesOf(iri, def('object')).includes(vocabIri('checksum', 'elfproef')),
    );
    expect(first).toBeDefined();
    expect(valuesOf(first ?? '', def('position'))).toEqual(['1']);
    const [over] = objectsOf(first ?? '', def('over'));
    expect(over?.termType === 'Literal' && over.datatype.value).toBe(RDF_JSON);
    expect(over?.value).toBe(canon(entries[0]?.over));
    expect(over?.value).toContain('"regex":"^NL([0-9]{9})B[0-9]{2}$"');
    const second = found.find((iri) =>
      valuesOf(iri, def('object')).includes(vocabIri('checksum', 'iso7064-mod97-10')),
    );
    expect(valuesOf(second ?? '', def('position'))).toEqual(['2']);
    expect(valuesOf(second ?? '', def('over'))).toEqual([canon(entries[1]?.over)]);
  });

  test('lei legal basis has the ELI as object, a title and the url as rdfs:seeAlso; the url is not hashed', () => {
    const basis = scheme('lei').legal_basis?.[0];
    const [iri] = statementsOf('lei', 'legal-basis');
    expect(valuesOf(iri ?? '', def('object'))).toEqual([basis?.eli]);
    expect(valuesOf(iri ?? '', DCT_TITLE)).toEqual([basis?.title]);
    expect(valuesOf(iri ?? '', RDFS_SEE_ALSO)).toEqual([basis?.url]);
    const changed = structuredClone(model);
    const target = changed.schemes.lei?.legal_basis?.[0];
    if (target === undefined) throw new Error('lei has a legal basis');
    changed.schemes.lei = {
      ...scheme('lei'),
      legal_basis: [{ ...target, url: 'https://example.org/another-url' }],
    };
    const other = buildGraph(changed, namespace).quads;
    const seeAlso = other.filter(
      (q) => q.subject.value === iri && q.predicate.value === RDFS_SEE_ALSO,
    );
    expect(seeAlso.map((q) => q.object.value)).toEqual(['https://example.org/another-url']);
  });

  test('every legal basis object is an http IRI, the eli when authored', () => {
    const authored = scheme('eori').legal_basis ?? [];
    const objects = statementsOf('eori', 'legal-basis').flatMap((iri) =>
      valuesOf(iri, def('object')),
    );
    expect(sorted(objects)).toEqual(sorted(authored.map((basis) => basis.eli ?? '')));
    const ids = Object.values(model.schemes).filter((entry) =>
      (entry.legal_basis ?? []).some((item) => item.eli === undefined && item.url !== undefined),
    );
    for (const entry of ids) {
      for (const statement of statementsOf(entry.id, 'legal-basis')) {
        expect(valuesOf(statement, def('object'))[0]).toMatch(/^https?:\/\//);
      }
    }
  });

  test('bsn and fi-number have no trust Statement; eori has five integer ones at likely', () => {
    for (const id of ['bsn', 'fi-number']) {
      expect(statementsOf(id, 'trust-[a-z-]+')).toEqual([]);
    }
    const trust = statementsOf('eori', 'trust-[a-z-]+');
    expect(trust).toHaveLength(5);
    for (const iri of trust) {
      const [object] = objectsOf(iri, def('object'));
      expect(object?.termType === 'Literal' && object.datatype.value).toBe(`${XSD}integer`);
      expect(valuesOf(iri, def('certainty'))).toEqual([vocabIri('certainty', 'likely')]);
      expect(valuesOf(iri, 'http://purl.org/dc/terms/source')).toEqual([
        iriOf('source', 'landscape-v1-2'),
      ]);
    }
    expect(sorted(trust.flatMap((iri) => valuesOf(iri, def('predicate'))))).toEqual(
      sorted(
        ['Crosswalks', 'LegalBasis', 'Lifecycle', 'RegistrationQuality', 'Verifiability'].map(
          (name) => def(`trust${name}`),
        ),
      ),
    );
  });

  test('peppol-id has five component Statements with their prefixes at likely', () => {
    const found = statementsOf('peppol-id', 'component');
    expect(sorted(found.flatMap((iri) => valuesOf(iri, def('prefix'))))).toEqual([
      '0088',
      '0106',
      '0190',
      '0208',
      '9944',
    ]);
    for (const iri of found) {
      expect(valuesOf(iri, def('certainty'))).toEqual([vocabIri('certainty', 'likely')]);
      expect(valuesOf(iri, def('object'))[0]).toMatch(new RegExp(`^${namespace}scheme/`));
    }
  });

  test('eori has an issuing-country-context Statement with a capture literal', () => {
    const [iri] = statementsOf('eori', 'issuing-country-context');
    expect(valuesOf(iri ?? '', def('object'))).toEqual([iriOf('vocab', 'country-prefix')]);
    const [capture] = objectsOf(iri ?? '', def('capture'));
    expect(capture?.termType === 'Literal' && capture.datatype.value).toBe(RDF_JSON);
    expect(capture?.value).toBe(canon({ regex: '^([A-Z]{2})', group: 1 }));
  });

  test('the rule eori-nl-from-rsin is a Statement and a Rule node with JSON literals', () => {
    const [iri] = statementsOf('eori', 'rule');
    const rule = iriOf('rule', 'eori-nl-from-rsin');
    expect(valuesOf(iri ?? '', def('object'))).toEqual([rule]);
    expect(valuesOf(iri ?? '', def('condition'))).toHaveLength(1);
    expect(valuesOf(rule, RDF_TYPE)).toEqual([def('Rule')]);
    expect(valuesOf(rule, def('input'))).toEqual([iriOf('scheme', 'rsin')]);
    expect(valuesOf(rule, def('output'))).toEqual([iriOf('scheme', 'eori')]);
    const authored = scheme('eori').rules?.[0];
    expect(valuesOf(rule, def('transform'))).toEqual([canon(authored?.transform)]);
    expect(sorted(valuesOf(rule, def('example')))).toEqual(
      sorted((authored?.examples ?? []).map((example) => canon(example))),
    );
  });

  test('relations, level, role, mandatory and validation-source are Statements', () => {
    const relation = statementsOf('eori', 'relation');
    expect(relation).toHaveLength(scheme('eori').relations?.length ?? -1);
    expect(valuesOf(relation[0] ?? '', def('relationKind'))).toEqual([
      vocabIri('relation-kind', 'derived-from'),
    ]);
    expect(valuesOf(relation[0] ?? '', def('object'))).toEqual([iriOf('scheme', 'rsin')]);
    expect(statementsOf('eori', 'role')).toHaveLength(1);
    expect(statementsOf('eori', 'mandatory')).toHaveLength(1);
    const [validation] = statementsOf('eori', 'validation-source');
    expect(valuesOf(validation ?? '', DCT_TITLE)).toEqual([
      scheme('eori').validation_source?.label,
    ]);
    expect(valuesOf(validation ?? '', def('object'))).toEqual([
      scheme('eori').validation_source?.url,
    ]);
    const note = valuesOf(relation[0] ?? '', SKOS_NOTE);
    expect(note.length).toBeLessThanOrEqual(1);
  });
});

describe('jsonLiteral', () => {
  test('keys in any order give the canonical lexical form', () => {
    const reversed = { z: [{ b: 1, a: 2 }], a: 'x' };
    const ordered = { a: 'x', z: [{ a: 2, b: 1 }] };
    const left = jsonLiteral(reversed);
    const right = jsonLiteral(ordered);
    expect(left.value).toBe(right.value);
    expect(left.value).toBe(canon(ordered));
    expect(left.datatype.value).toBe(RDF_JSON);
  });
});
