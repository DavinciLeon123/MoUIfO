import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Quad } from 'n3';
import type { Problem } from 'uio-config';
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
