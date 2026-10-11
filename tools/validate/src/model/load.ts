import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from 'uio-config';
import { type Document, isMap, isNode, isScalar, LineCounter, parseDocument } from 'yaml';

/** A model file as the validator sees it: repo-relative path with `/` separators, and its text. */
export type ModelFile = { path: string; text: string };

/** A parsed model file: the YAML document, its line counter and the plain data. */
export type ParsedFile = {
  path: string;
  doc: Document.Parsed;
  lineCounter: LineCounter;
  data: unknown;
};

export type Position = { line: number; column: number };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every `.yaml` file under `model/`, sorted in code-unit order; dot-files and dot-directories are skipped. */
export function discoverModelFiles(root: string): ModelFile[] {
  const files: ModelFile[] = [];
  const walk = (rel: string): void => {
    const dir = join(root, rel);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort(compare)) {
      if (name.startsWith('.')) continue;
      const childRel = `${rel}/${name}`;
      const stat = lstatSync(join(root, childRel));
      if (stat.isDirectory()) walk(childRel);
      else if (stat.isFile() && name.endsWith('.yaml')) {
        files.push({ path: childRel, text: readFileSync(join(root, childRel), 'utf8') });
      }
    }
  };
  walk('model');
  return files;
}

/** The schema `$id` that checks the file at `path`, or undefined when none is known. */
export function schemaFileFor(path: string): string | undefined {
  return path === 'model/vocab/certainty.yaml' ? 'vocab-certainty.schema.json' : undefined;
}

function unescapePointer(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Message for a YAML parse error, without the pretty-printed source line (it may hold a value). */
function parseMessage(code: string, message: string): string {
  return code === 'DUPLICATE_KEY' ? 'duplicate key: a mapping may use each key only once' : message;
}

/**
 * Parse one model file. Parse errors become positioned problems; the plain data is only
 * meaningful when there are none. Positions come from the error offset, never from a
 * pretty-printed message, so no source text is echoed.
 */
export function parseModelFile(file: ModelFile): { parsed: ParsedFile; problems: Problem[] } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(file.text, {
    schema: 'core',
    uniqueKeys: true,
    prettyErrors: false,
    lineCounter,
  });
  const problems: Problem[] = [];
  for (const error of doc.errors) {
    const { line, col } = lineCounter.linePos(error.pos[0]);
    problems.push({
      file: file.path,
      line,
      column: col,
      message: parseMessage(error.code, error.message),
    });
  }
  const parsed: ParsedFile = { path: file.path, doc, lineCounter, data: doc.toJS() };
  return { parsed, problems };
}

function locate(
  parsed: ParsedFile,
  segments: string[],
  target: 'value' | 'key',
): Position | undefined {
  if (segments.length === 0) return { line: 1, column: 1 };
  let node: unknown;
  if (target === 'key') {
    const parent = parsed.doc.getIn(segments.slice(0, -1), true);
    if (isMap(parent)) {
      const last = segments.at(-1);
      node = parent.items.find(
        (pair) => isScalar(pair.key) && String(pair.key.value) === last,
      )?.key;
    }
  }
  node ??= parsed.doc.getIn(segments, true);
  if (!isNode(node) || node.range == null) return undefined;
  const { line, col } = parsed.lineCounter.linePos(node.range[0]);
  return { line, column: col };
}

/**
 * Map a JSON pointer to the 1-based position of the value (`target` `value`) or of the key that
 * holds it (`key`, falling back to the value for a sequence item). A pointer that does not
 * resolve falls back to its nearest existing ancestor and finally to 1:1; the file root is 1:1.
 */
export function positionOf(parsed: ParsedFile, pointer: string, target: 'value' | 'key'): Position {
  const segments = pointer === '' ? [] : pointer.slice(1).split('/').map(unescapePointer);
  for (let length = segments.length; length >= 0; length--) {
    const found = locate(
      parsed,
      segments.slice(0, length),
      length === segments.length ? target : 'value',
    );
    if (found !== undefined) return found;
  }
  return { line: 1, column: 1 };
}
