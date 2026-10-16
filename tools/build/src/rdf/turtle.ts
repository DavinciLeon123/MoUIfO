import { Parser, type Quad, type Term, Writer } from 'n3';
import { ADMS, DCT, ORG, PROV, RDF, RDFS, SKOS, XSD } from './iris.ts';

/**
 * The fixed prefix table; the insertion order is the `@prefix` order of the output. `def` comes
 * before `uio` because the def namespace begins with the base namespace.
 */
export function prefixesFor(namespace: string): Record<string, string> {
  return {
    rdf: RDF,
    rdfs: RDFS,
    xsd: XSD,
    skos: SKOS,
    dct: DCT,
    adms: ADMS,
    org: ORG,
    prov: PROV,
    def: `${namespace}def#`,
    uio: namespace,
  };
}

/** Write the quads once, in the order given, and return the text with one trailing LF. */
export function toTurtle(quads: readonly Quad[], prefixes: Record<string, string>): string {
  const writer = new Writer({ prefixes });
  writer.addQuads([...quads]);
  let out = '';
  let failure: Error | null = null;
  writer.end((error, result) => {
    failure = error;
    out = result;
  });
  if (failure) throw failure;
  return `${out.replace(/\n*$/, '')}\n`;
}

/** Parse Turtle text into quads; throws on a syntax error. */
export function parseTurtle(text: string): Quad[] {
  return new Parser({ format: 'Turtle' }).parse(text);
}

function termKey(term: Term): string {
  if (term.termType === 'Literal') {
    return `L\u0000${term.value}\u0000${term.datatype.value}\u0000${term.language}`;
  }
  return `${term.termType}\u0000${term.value}`;
}

const quadKey = (q: Quad): string =>
  [q.subject, q.predicate, q.object, q.graph].map(termKey).join('\u0001');

const describeKey = (key: string): string =>
  key.replaceAll('\u0001', ' ').replaceAll('\u0000', ':');

/** Compare two quad sets by term keys; the first difference as text, or undefined when equal. */
export function sameQuads(a: readonly Quad[], b: readonly Quad[]): string | undefined {
  const left = new Set(a.map(quadKey));
  const right = new Set(b.map(quadKey));
  for (const key of [...left].sort()) {
    if (!right.has(key)) return `only in the first set: ${describeKey(key)}`;
  }
  for (const key of [...right].sort()) {
    if (!left.has(key)) return `only in the second set: ${describeKey(key)}`;
  }
  return undefined;
}
