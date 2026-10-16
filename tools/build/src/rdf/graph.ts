import type { Model } from '@uio/engine';
import { DataFactory, type Literal, type NamedNode, type Quad } from 'n3';
import type { Problem } from 'uio-config';
import { type ClaimInstance, schemeClaims } from './claims.ts';
import { createMinter } from './hash.ts';
import { DCT, makeIris, PROV, RDF, SKOS } from './iris.ts';

const { namedNode, quad } = DataFactory;

export type Graph = { quads: Quad[]; problems: Problem[] };

const GRAPH_FILE = 'dist/uio.ttl';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A key for an object term: term type, value, datatype and language. */
export function objectKey(term: Quad['object']): string {
  if (term.termType === 'Literal') {
    return `${term.termType}\u0000${term.value}\u0000${term.datatype.value}\u0000${term.language}`;
  }
  return `${term.termType}\u0000${term.value}\u0000\u0000`;
}

function statementQuads(
  claim: ClaimInstance,
  iri: string,
  iris: ReturnType<typeof makeIris>,
): Quad[] {
  const node = namedNode(iri);
  const source = namedNode(iris.source(claim.source));
  const quads: Quad[] = [
    quad(node, namedNode(`${RDF}type`), namedNode(iris.def('Statement'))),
    quad(node, namedNode(iris.def('subject')), namedNode(claim.subjectIri)),
    quad(node, namedNode(iris.def('predicate')), namedNode(claim.predicate)),
    quad(node, namedNode(iris.def('object')), claim.object),
    quad(
      node,
      namedNode(iris.def('certainty')),
      namedNode(iris.member('certainty', claim.certainty)),
    ),
    quad(node, namedNode(`${DCT}source`), source),
    quad(node, namedNode(`${PROV}wasDerivedFrom`), source),
  ];
  for (const { predicate, object } of [...claim.qualifierTriples, ...claim.extra]) {
    quads.push(quad(node, namedNode(predicate), object as NamedNode | Literal));
  }
  if (claim.note !== undefined) {
    quads.push(quad(node, namedNode(`${SKOS}note`), DataFactory.literal(claim.note)));
  }
  return quads;
}

/** Deduplicate by subject, predicate and object, then order for the Turtle writer. */
function sortedUnique(quads: Quad[]): Quad[] {
  const unique = new Map<string, Quad>();
  for (const q of quads) {
    unique.set(`${q.subject.value}\u0001${q.predicate.value}\u0001${objectKey(q.object)}`, q);
  }
  const type = `${RDF}type`;
  return [...unique.values()].sort(
    (a, b) =>
      compare(a.subject.value, b.subject.value) ||
      Number(b.predicate.value === type) - Number(a.predicate.value === type) ||
      compare(a.predicate.value, b.predicate.value) ||
      compare(objectKey(a.object), objectKey(b.object)),
  );
}

/**
 * The published graph of a normalised model as sorted, deduplicated quads. Problems (a hash
 * collision, a duplicate claim) end the build; the quads are then not to be written.
 */
export function buildGraph(model: Model, namespace: string): Graph {
  const iris = makeIris(namespace);
  const minter = createMinter(iris);
  const quads: Quad[] = [];

  for (const scheme of Object.values(model.schemes)) {
    for (const claim of schemeClaims(scheme, iris)) {
      const iri = minter.mint({
        subjectId: claim.subjectId,
        claim: claim.claim,
        subjectIri: claim.subjectIri,
        predicate: claim.predicate,
        object: claim.payload,
        qualifiers: claim.qualifiers,
        condition: claim.condition,
        sourceId: claim.source,
      });
      quads.push(...statementQuads(claim, iri, iris));
    }
  }

  const problems: Problem[] = minter.problems().map((message) => ({ file: GRAPH_FILE, message }));
  return { quads: sortedUnique(quads), problems };
}
