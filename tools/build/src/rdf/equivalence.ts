import jsonld from 'jsonld';
import { refuseRemoteDocument } from './jsonld.ts';
import { parseTurtle } from './turtle.ts';

/** The shape both n3 quads and jsonld's `toRDF` dataset share; all the proof reads. */
type RdfTerm = {
  termType: string;
  value: string;
  language?: string;
  datatype?: { value: string };
};
type RdfQuad = { subject: RdfTerm; predicate: RdfTerm; object: RdfTerm; graph: RdfTerm };

export type Equivalence = {
  equal: boolean;
  sizes: { ttl: number; jsonld: number };
  firstDifference?: string;
};

function termKey(term: RdfTerm): string {
  return term.termType === 'Literal'
    ? `L\u0000${term.value}\u0000${term.language ?? ''}\u0000${term.datatype?.value ?? ''}`
    : `${term.termType}\u0000${term.value}`;
}

const quadKey = (q: RdfQuad): string =>
  [q.subject, q.predicate, q.object, q.graph].map(termKey).join('\u0001');

const describeKey = (key: string): string =>
  key.replaceAll('\u0001', ' ').replaceAll('\u0000', ':');

const hasBlank = (q: RdfQuad): boolean =>
  [q.subject, q.predicate, q.object, q.graph].some((term) => term.termType === 'BlankNode');

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function failure(message: string, ttl = 0, json = 0): Equivalence {
  return { equal: false, sizes: { ttl, jsonld: json }, firstDifference: message };
}

/**
 * BLD-06: do the Turtle text and the JSON-LD text hold exactly the same triples? Both are read
 * back as datasets (never as text), reduced to term keys (literals keep value, language and
 * datatype) and compared as sets; this is exact because the graph is ground, so a blank node on
 * either side is itself a failure. jsonld is given the refusing loader, so nothing is fetched.
 */
export async function sameTriples(ttlText: string, jsonLdText: string): Promise<Equivalence> {
  let ttlQuads: RdfQuad[];
  try {
    ttlQuads = parseTurtle(ttlText);
  } catch (error) {
    return failure(
      `the Turtle cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let jsonQuads: RdfQuad[];
  try {
    const dataset = await jsonld.toRDF(JSON.parse(jsonLdText), {
      documentLoader: refuseRemoteDocument,
    });
    jsonQuads = dataset as unknown as RdfQuad[];
  } catch (error) {
    return failure(
      `the JSON-LD cannot be read as RDF: ${error instanceof Error ? error.message : String(error)}`,
      ttlQuads.length,
    );
  }

  const left = new Set(ttlQuads.map(quadKey));
  const right = new Set(jsonQuads.map(quadKey));
  const sizes = { ttl: left.size, jsonld: right.size };
  if (ttlQuads.some(hasBlank)) {
    return { equal: false, sizes, firstDifference: 'the Turtle holds a blank node' };
  }
  if (jsonQuads.some(hasBlank)) {
    return { equal: false, sizes, firstDifference: 'the JSON-LD holds a blank node' };
  }
  for (const key of [...left].sort(compare)) {
    if (!right.has(key)) {
      return { equal: false, sizes, firstDifference: `only in the Turtle: ${describeKey(key)}` };
    }
  }
  for (const key of [...right].sort(compare)) {
    if (!left.has(key)) {
      return { equal: false, sizes, firstDifference: `only in the JSON-LD: ${describeKey(key)}` };
    }
  }
  return { equal: true, sizes };
}
