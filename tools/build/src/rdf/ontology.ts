import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, type Quad } from 'n3';
import type { Problem } from 'uio-config';
import { OWL, RDF } from './iris.ts';
import { parseTurtle } from './turtle.ts';

/** The repository-relative path of the hand-written ontology (D-09, DEC-058). */
export const ONTOLOGY_FILE = 'ontology/uio-def.ttl';

/** The ontology text, exactly as authored, and the quads parsed from it. */
export type Ontology = { text: string; quads: Quad[] };

/**
 * Read `ontology/uio-def.ttl` under `root`: its text and quads, or a problem on that file when it
 * is missing or is not Turtle. The text is kept unchanged so the build can copy it byte for byte.
 */
export function readOntology(root: string): Ontology | { problem: Problem } {
  const path = join(root, ONTOLOGY_FILE);
  if (!existsSync(path)) {
    return { problem: { file: ONTOLOGY_FILE, message: 'the ontology file is missing (D-09)' } };
  }
  const text = readFileSync(path, 'utf8');
  try {
    return { text, quads: parseTurtle(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      problem: {
        file: ONTOLOGY_FILE,
        message: `the ontology cannot be parsed as Turtle: ${reason}`,
      },
    };
  }
}

const DEFINING_TYPES = new Set([
  `${OWL}Class`,
  `${OWL}ObjectProperty`,
  `${OWL}DatatypeProperty`,
  `${RDF}Property`,
]);

const sorted = (terms: Set<string>): string[] => [...terms].sort();

/** Every IRI of the `def:` namespace that the ontology defines as a class or a property. */
export function definedTerms(quads: readonly Quad[], namespace: string): string[] {
  const prefix = `${namespace}def#`;
  const terms = new Set<string>();
  for (const q of quads) {
    if (
      q.predicate.value === `${RDF}type` &&
      q.subject.termType === 'NamedNode' &&
      q.subject.value.startsWith(prefix) &&
      DEFINING_TYPES.has(q.object.value)
    ) {
      terms.add(q.subject.value);
    }
  }
  return sorted(terms);
}

/**
 * Every IRI of the `def:` namespace that the generated graph uses: as an `rdf:type` object, as a
 * triple predicate (which covers the qualifiers) and as the value of `def:predicate`.
 */
export function emittedTerms(quads: readonly Quad[], namespace: string): string[] {
  const prefix = `${namespace}def#`;
  const statementPredicate = `${prefix}predicate`;
  const terms = new Set<string>();
  for (const q of quads) {
    if (q.predicate.value.startsWith(prefix)) terms.add(q.predicate.value);
    if (
      (q.predicate.value === `${RDF}type` || q.predicate.value === statementPredicate) &&
      q.object.termType === 'NamedNode' &&
      q.object.value.startsWith(prefix)
    ) {
      terms.add(q.object.value);
    }
  }
  return sorted(terms);
}

/**
 * The D-08 check in both directions: a problem on the ontology file for each emitted term it does
 * not define and for each term it defines that the graph never emits.
 */
export function ontologyProblems(
  ontology: readonly Quad[],
  graph: readonly Quad[],
  namespace: string,
): Problem[] {
  const prefix = `${namespace}def#`;
  const defined = new Set(definedTerms(ontology, namespace));
  const emitted = new Set(emittedTerms(graph, namespace));
  const name = (term: string): string => `def:${term.slice(prefix.length)}`;
  const problems: Problem[] = [];
  for (const term of sorted(emitted)) {
    if (!defined.has(term)) {
      problems.push({ file: ONTOLOGY_FILE, message: `${name(term)} is emitted but not defined` });
    }
  }
  for (const term of sorted(defined)) {
    if (!emitted.has(term)) {
      problems.push({
        file: ONTOLOGY_FILE,
        message: `${name(term)} is defined but not emitted (D-08)`,
      });
    }
  }
  return problems;
}

/** The prefixes whose IRI is fixed by the namespace (DEC-058): the declared name and its value. */
const OWN_PREFIXES = (namespace: string): Record<string, string> => ({
  uio: namespace,
  def: `${namespace}def#`,
  shape: `${namespace}shape/`,
});

/**
 * Findings for hand-written Turtle (`ontology/` and `shapes/`) whose literal IRIs have drifted from
 * the `namespace` of config.yaml (DEC-058): a `uio`, `def` or `shape` prefix with another value,
 * and any IRI on the namespace host that does not start with the namespace. Rejects on text that is
 * not Turtle. An empty list means no drift.
 */
export async function namespaceDrift(text: string, namespace: string): Promise<string[]> {
  const findings: string[] = [];
  const origin = `${new URL(namespace).origin}/`;
  const expected: Record<string, string | undefined> = OWN_PREFIXES(namespace);
  const iris = new Set<string>();
  const declared: [string, string][] = [];

  // The n3 Parser reports quads and prefixes through callbacks that fire after parse() returns.
  await new Promise<void>((resolve, reject) => {
    new Parser({ format: 'Turtle' }).parse(
      text,
      (error, parsed) => {
        if (error) return reject(error);
        if (parsed === null) return resolve();
        for (const term of [parsed.subject, parsed.predicate, parsed.object, parsed.graph]) {
          if (term.termType === 'NamedNode') iris.add(term.value);
          if (term.termType === 'Literal') iris.add(term.datatype.value);
        }
      },
      (prefix, iri) => {
        declared.push([prefix, iri.value]);
      },
    );
  });

  for (const [prefix, iri] of declared) {
    const want = expected[prefix];
    if (want !== undefined && iri !== want) {
      findings.push(`prefix ${prefix}: is <${iri}> and must be <${want}>`);
    }
    iris.add(iri);
  }
  for (const iri of [...iris].sort()) {
    if (iri.startsWith(origin) && !iri.startsWith(namespace)) {
      findings.push(`<${iri}> is on the namespace host but does not start with the namespace`);
    }
  }
  return findings;
}
