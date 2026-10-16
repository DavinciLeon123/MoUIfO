import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Quad, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import type { Problem } from 'uio-config';
import { parseTurtle } from './turtle.ts';

/** The repository-relative directory of the hand-written SHACL shapes (D-10, DEC-060). */
export const SHAPES_DIR = 'shapes';

/** One shape file: its repository-relative path and its text, exactly as authored. */
export type ShapeFile = { file: string; text: string };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Read every `shapes/*.ttl` under `root` (the fixtures directory is not read) in code-unit order.
 * A problem on `shapes` when there is none, and on the file when one is not Turtle, so a typo in
 * a shape can never switch the validation off silently.
 */
export function readShapes(root: string): ShapeFile[] | { problem: Problem } {
  const directory = join(root, SHAPES_DIR);
  const names = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ttl'))
        .map((entry) => entry.name)
        .sort(compare)
    : [];
  if (names.length === 0) {
    return { problem: { file: SHAPES_DIR, message: 'no shapes/*.ttl file was found (D-10)' } };
  }
  const files: ShapeFile[] = [];
  for (const name of names) {
    const file = `${SHAPES_DIR}/${name}`;
    const text = readFileSync(join(directory, name), 'utf8');
    try {
      parseTurtle(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { problem: { file, message: `the shape file cannot be parsed as Turtle: ${reason}` } };
    }
    files.push({ file, text });
  }
  return files;
}

/** One SHACL result, reduced to the text a person needs to find and fix the violation. */
export type ShapeResult = {
  focusNode: string;
  /** The property path, or undefined for a result of a node shape. */
  path: string | undefined;
  sourceShape: string;
  component: string;
  message: string;
};

export type ShapeReport = { conforms: boolean; results: ShapeResult[] };

/** An IRI as `<iri>`; any other term (a blank node of a path expression) by its value. */
const show = (term: { termType: string; value: string }): string =>
  term.termType === 'NamedNode' ? `<${term.value}>` : term.value;

/** A property path: an IRI as `<iri>`, a path expression (an inverse path) as a fixed label. */
const showPath = (term: { termType: string; value: string }): string =>
  term.termType === 'NamedNode' ? `<${term.value}>` : '(path expression)';

/** The IRI of every named subject in a shape file: the shapes the file declares. */
export function declaredShapes(text: string): Set<string> {
  return new Set(
    parseTurtle(text)
      .map((q) => q.subject)
      .filter((subject) => subject.termType === 'NamedNode')
      .map((subject) => subject.value),
  );
}

/**
 * Validate the quads against the shapes of every given shape text (SHACL Core only,
 * rdf-validate-shacl). Results come back in a fixed order so a failing build prints the same
 * lines every time. `sourceShape` is the bare IRI, so a test can match it to a declared shape.
 */
export async function validateShapes(
  shapeTexts: readonly string[],
  dataQuads: readonly Quad[],
): Promise<ShapeReport> {
  const shapes = new Store(shapeTexts.flatMap((text) => parseTurtle(text)));
  const report = await new SHACLValidator(shapes).validate(new Store([...dataQuads]));
  const results = report.results.map(
    (result): ShapeResult => ({
      focusNode: show(result.focusNode),
      // rdf-validate-shacl types `path` as a Term but returns null for a node shape.
      path: (result.path as unknown) === null ? undefined : showPath(result.path),
      sourceShape: result.sourceShape.value,
      component: result.sourceConstraintComponent.value,
      message: result.message.map((term) => term.value).join(' '),
    }),
  );
  results.sort(
    (a, b) =>
      compare(a.focusNode, b.focusNode) ||
      compare(a.sourceShape, b.sourceShape) ||
      compare(a.path ?? '', b.path ?? '') ||
      compare(a.component, b.component) ||
      compare(a.message, b.message),
  );
  return { conforms: report.conforms, results };
}

/** The build problem for one result: `<focus node> <path> violates <shape>: <message>`. */
export function resultProblem(result: ShapeResult): Problem {
  const where = result.path === undefined ? '' : ` ${result.path}`;
  return {
    file: 'dist/uio.ttl',
    message: `${result.focusNode}${where} violates <${result.sourceShape}>: ${result.message}`,
  };
}
