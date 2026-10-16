import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Quad } from 'n3';
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
