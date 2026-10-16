import type { Model } from '@uio/engine';
import { DataFactory, type Literal, type NamedNode, type Quad } from 'n3';
import type { Problem } from 'uio-config';
import { type ClaimInstance, schemeClaims } from './claims.ts';
import { conditionNode } from './conditions.ts';
import { createMinter } from './hash.ts';
import { checkExternalIri, DCT, makeIris, PROV, RDF, SKOS } from './iris.ts';
import { structureQuads } from './nodes.ts';

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
  condition?: string,
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
  if (condition !== undefined) {
    quads.push(quad(node, namedNode(iris.def('condition')), namedNode(condition)));
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
 * Every external IRI the graph will carry (a source `url` or `eli`, a legal basis or validation
 * source `url`) must be writable as a Turtle IRI; a failure names the file kind, id and field.
 */
function externalIriProblems(model: Model): Problem[] {
  const problems: Problem[] = [];
  const check = (kind: 'sources' | 'schemes', id: string, field: string, value?: string): void => {
    if (value === undefined) return;
    const reason = checkExternalIri(value);
    if (reason === undefined) return;
    problems.push({
      file: `model/${kind}/${id}.yaml`,
      message: `${kind}/${id} ${field} ${reason}`,
    });
  };
  for (const source of Object.values(model.sources)) {
    check('sources', source.id, 'url', source.url);
    check('sources', source.id, 'eli', source.eli);
  }
  for (const scheme of Object.values(model.schemes)) {
    for (const basis of scheme.legal_basis ?? []) {
      check('schemes', scheme.id, 'legal_basis url', basis.url);
      check('schemes', scheme.id, 'legal_basis eli', basis.eli);
    }
    check('schemes', scheme.id, 'validation_source url', scheme.validation_source?.url);
  }
  return problems;
}

/**
 * The published graph of a normalised model as sorted, deduplicated quads. Problems (a hash
 * collision, a duplicate claim) end the build; the quads are then not to be written.
 */
export function buildGraph(model: Model, namespace: string): Graph {
  const iris = makeIris(namespace);
  const iriProblems = externalIriProblems(model);
  if (iriProblems.length > 0) return { quads: [], problems: iriProblems };
  const minter = createMinter(iris);
  const quads: Quad[] = [];
  const conditionProblems: string[] = [];

  const addClaim = (claim: ClaimInstance): void => {
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
    let condition: string | undefined;
    if (claim.condition !== null) {
      const node = conditionNode(claim.condition, iris);
      conditionProblems.push(...node.problems);
      quads.push(...node.quads);
      condition = node.iri;
    }
    quads.push(...statementQuads(claim, iri, iris, condition));
  };

  for (const scheme of Object.values(model.schemes)) {
    for (const claim of schemeClaims(scheme, iris)) addClaim(claim);
  }

  quads.push(...structureQuads(model, iris));

  const problems: Problem[] = [...minter.problems(), ...conditionProblems].map((message) => ({
    file: GRAPH_FILE,
    message,
  }));
  return { quads: sortedUnique(quads), problems };
}
