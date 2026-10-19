/** The external vocabularies the graph reuses (SPEC 5.5). */
export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export const DCT = 'http://purl.org/dc/terms/';
export const ADMS = 'http://www.w3.org/ns/adms#';
export const ORG = 'http://www.w3.org/ns/org#';
export const PROV = 'http://www.w3.org/ns/prov#';

/**
 * Every IRI of the published graph is the plain concatenation of the DEC-056 patterns onto the
 * namespace read from config.yaml; `namespace` ends in `/`.
 */
export function makeIris(namespace: string) {
  return {
    namespace,
    scheme: (id: string): string => `${namespace}scheme/${id}`,
    authority: (id: string): string => `${namespace}authority/${id}`,
    rule: (id: string): string => `${namespace}rule/${id}`,
    jurisdiction: (id: string): string => `${namespace}jurisdiction/${id}`,
    source: (id: string): string => `${namespace}source/${id}`,
    vocab: (vocabularyId: string): string => `${namespace}vocab/${vocabularyId}`,
    member: (vocabularyId: string, key: string): string =>
      `${namespace}vocab/${vocabularyId}/${key}`,
    condition: (hash: string): string => `${namespace}condition/${hash}`,
    statement: (subjectId: string, claim: string, hash: string): string =>
      `${namespace}statement/${subjectId}/${claim}-${hash}`,
    shape: (name: string): string => `${namespace}shape/${name}`,
    def: (term: string): string => `${namespace}def#${term}`,
  };
}

export type Iris = ReturnType<typeof makeIris>;

/** Characters Turtle cannot carry inside `<...>`, besides whitespace and control characters. */
const FORBIDDEN = new Set(['<', '>', '"', '{', '}', '|', '\\', '^', '`']);

/**
 * A reason an external IRI (a source `url` or `eli`) cannot be written as a Turtle IRI, or
 * undefined when it can. The n3 Writer does not escape IRIs, so this runs before `namedNode`
 * (T-04-08). The message never repeats the value.
 */
export function checkExternalIri(iri: string): string | undefined {
  if (!iri.startsWith('http://') && !iri.startsWith('https://')) {
    return 'must start with http:// or https://';
  }
  for (const char of iri) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || /\s/.test(char) || FORBIDDEN.has(char)) {
      return 'holds a character that Turtle cannot carry in an IRI';
    }
  }
  return undefined;
}
