import { DataFactory, type Quad } from 'n3';
import { canon, hash8 } from './hash.ts';
import { type Iris, RDF } from './iris.ts';

const { namedNode, quad } = DataFactory;

export type ConditionNode = {
  /** The minted `<ns>condition/<8 hex>` IRI. */
  iri: string;
  quads: Quad[];
  /** An unknown key or an unknown form; a non-empty list ends the build. */
  problems: string[];
};

/**
 * A condition as a minted node (D-07, DEC-055): the IRI is the hash of the canonical authored
 * condition, so the same condition is one node; each key becomes one property whose object is a
 * jurisdiction or vocabulary-member IRI. An unknown key or form is reported, never dropped.
 */
export function conditionNode(condition: unknown, iris: Iris): ConditionNode {
  const iri = iris.condition(hash8(canon(condition)));
  const problems: string[] = [];
  const quads: Quad[] = [
    quad(namedNode(iri), namedNode(`${RDF}type`), namedNode(iris.def('Condition'))),
  ];
  const add = (predicate: string, object: string): void => {
    quads.push(quad(namedNode(iri), namedNode(iris.def(predicate)), namedNode(object)));
  };

  if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
    return { iri, quads, problems: [`condition ${canon(condition)} is not an object`] };
  }
  for (const [key, value] of Object.entries(condition)) {
    if (typeof value !== 'string' || value === '' || value === '!') {
      problems.push(`condition ${canon(condition)}: ${key} must be a non-empty string`);
      continue;
    }
    if (key === 'issuing_country') {
      if (value.startsWith('!')) add('excludesIssuingCountry', iris.jurisdiction(value.slice(1)));
      else add('issuingCountry', iris.jurisdiction(value));
    } else if (key === 'entity_form') {
      add('entityForm', iris.member('entity-form', value));
    } else if (key === 'context') {
      add('context', iris.member('condition-context', value));
    } else {
      problems.push(`condition ${canon(condition)}: unknown key ${key}`);
    }
  }
  return { iri, quads, problems };
}
