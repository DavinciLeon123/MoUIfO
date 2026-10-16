import type { Model } from '@uio/engine';
import type { Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { buildGraph } from './graph.ts';

const namespace = loadConfig().namespace;

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

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
