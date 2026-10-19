import { DataFactory, type Literal } from 'n3';
import { canon } from './hash.ts';
import { RDF } from './iris.ts';

const { literal, namedNode } = DataFactory;

/**
 * A canonical `rdf:JSON` literal: the lexical form is the same `canon` text the Statement hash
 * reads (RESEARCH Pitfall 7), so Turtle and JSON-LD carry one form and the key order of the
 * authored value never shows.
 */
export function jsonLiteral(value: unknown): Literal {
  return literal(canon(value), namedNode(`${RDF}JSON`));
}
