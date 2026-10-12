import { lstatSync, readdirSync, readFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from 'uio-config';
import { type Document, isMap, isNode, isScalar, LineCounter, parseDocument, visit } from 'yaml';

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

/** The closed set of directories directly under `model/`. */
export const MODEL_KINDS = ['vocab', 'jurisdictions', 'authorities', 'sources', 'schemes'] as const;

/** Schema `$id` per vocabulary file stem; later plans add their vocabularies here. */
export const VOCAB_SCHEMAS: Readonly<Record<string, string>> = {
  certainty: 'vocab-certainty.schema.json',
  'relation-kind': 'vocab-simple.schema.json',
};

const KIND_SCHEMAS: Readonly<Record<string, string>> = {
  jurisdictions: 'jurisdiction.schema.json',
  authorities: 'authority.schema.json',
  sources: 'source.schema.json',
  schemes: 'scheme.schema.json',
};

const MAPPING_ONLY = 'a model file must contain a mapping';
const NUMERIC_MESSAGE =
  'a bare number with a leading zero or more than 15 digits loses digits in YAML; quote it';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function lstatOrUndefined(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Every `.yaml` file under `model/` in code-unit order, plus one file-level problem for anything
 * that does not belong there. Dot-files are ignored; symbolic links are reported, never followed.
 */
export function discoverModelFiles(root: string): { files: ModelFile[]; problems: Problem[] } {
  const files: ModelFile[] = [];
  const problems: Problem[] = [];
  const kinds: readonly string[] = MODEL_KINDS;
  const problem = (file: string, message: string): void => {
    problems.push({ file, message });
  };

  const modelStat = lstatOrUndefined(join(root, 'model'));
  if (modelStat === undefined) return { files, problems };
  if (!modelStat.isDirectory()) {
    problem('model', 'model must be a real directory, not a file or a symbolic link');
    return { files, problems };
  }

  for (const name of readdirSync(join(root, 'model')).sort(compare)) {
    if (name.startsWith('.')) continue;
    const rel = `model/${name}`;
    const stat = lstatSync(join(root, rel));
    if (stat.isSymbolicLink()) {
      problem(rel, 'symbolic links are not allowed under model/');
    } else if (!stat.isDirectory()) {
      problem(rel, `a model file must live in one of the directories: ${kinds.join(', ')}`);
    } else if (!kinds.includes(name)) {
      problem(rel, `not a model directory; the allowed directories are: ${kinds.join(', ')}`);
    } else {
      for (const child of readdirSync(join(root, rel)).sort(compare)) {
        if (child.startsWith('.')) continue;
        const childRel = `${rel}/${child}`;
        const childStat = lstatSync(join(root, childRel));
        if (childStat.isSymbolicLink()) {
          problem(childRel, 'symbolic links are not allowed under model/');
        } else if (childStat.isDirectory()) {
          problem(childRel, `sub-directories are not allowed inside model/${name}/`);
        } else if (!childStat.isFile() || !child.endsWith('.yaml')) {
          problem(childRel, 'model files must be regular files with the .yaml extension');
        } else {
          files.push({ path: childRel, text: readFileSync(join(root, childRel), 'utf8') });
        }
      }
    }
  }
  return { files, problems };
}

const MODEL_PATH = /^model\/([^/]+)\/([^/]+)\.yaml$/;

/** The schema `$id` that checks the file at `path`, or undefined when none is known. */
export function schemaFileFor(path: string): string | undefined {
  const match = MODEL_PATH.exec(path);
  const kind = match?.[1];
  const stem = match?.[2];
  if (kind === undefined || stem === undefined) return undefined;
  if (kind === 'vocab') return Object.hasOwn(VOCAB_SCHEMAS, stem) ? VOCAB_SCHEMAS[stem] : undefined;
  return Object.hasOwn(KIND_SCHEMAS, kind) ? KIND_SCHEMAS[kind] : undefined;
}

/** Why `schemaFileFor` found nothing for `path`. */
export function noSchemaMessage(path: string): string {
  return MODEL_PATH.exec(path)?.[1] === 'vocab'
    ? 'not a known vocabulary file'
    : 'no schema is known for this file';
}

/** The exact first line a model file must carry (D-02), or undefined when no schema is known. */
export function expectedHeader(path: string): string | undefined {
  const schema = schemaFileFor(path);
  return schema === undefined
    ? undefined
    : `# yaml-language-server: $schema=../../tools/validate/schemas/${schema}`;
}

function unescapePointer(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Message for a YAML parse error, without the pretty-printed source line (it may hold a value). */
function parseMessage(code: string, message: string): string {
  if (code === 'DUPLICATE_KEY') return 'duplicate key: a mapping may use each key only once';
  if (code === 'MULTIPLE_DOCS') return 'a model file must contain exactly one YAML document';
  return message;
}

/**
 * Parse one model file and apply the file-level rules (header, parser errors and warnings, mapping
 * root, bare numbers, id equals file name). `usable` is false when the data cannot be trusted for
 * schema validation (a parser error or warning, or a root that is not a mapping); `coerced` lists
 * the positions of bare numbers that lost digits, where a schema type error would repeat the
 * same finding. Positions come
 * from the error offset, never from a pretty-printed message, so no source text is echoed.
 */
export function parseModelFile(file: ModelFile): {
  parsed: ParsedFile;
  problems: Problem[];
  usable: boolean;
  coerced: Position[];
} {
  const lineCounter = new LineCounter();
  const doc = parseDocument(file.text, {
    schema: 'core',
    uniqueKeys: true,
    prettyErrors: false,
    lineCounter,
  });
  const problems: Problem[] = [];
  const coerced: Position[] = [];
  const at = (offset: number, message: string): void => {
    const { line, col } = lineCounter.linePos(offset);
    problems.push({ file: file.path, line, column: col, message });
  };

  for (const error of doc.errors) at(error.pos[0], parseMessage(error.code, error.message));
  for (const warning of doc.warnings) {
    const hint = warning.code === 'TAG_RESOLVE_FAILED' ? '; quote values that start with "!"' : '';
    at(warning.pos[0], `${warning.message}${hint}`);
  }
  let usable = doc.errors.length === 0 && doc.warnings.length === 0;

  if (usable && !isMap(doc.contents)) {
    problems.push({ file: file.path, line: 1, column: 1, message: MAPPING_ONLY });
    usable = false;
  }

  const header = expectedHeader(file.path);
  if (header !== undefined && (file.text.split('\n', 1)[0] ?? '').replace(/\r$/, '') !== header) {
    problems.push({
      file: file.path,
      line: 1,
      column: 1,
      message: `the first line must be exactly: ${header}`,
    });
  }

  visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value !== 'number' && typeof node.value !== 'bigint') return;
      const source = node.source ?? '';
      if (/^[+-]?0[0-9xXoObB]/.test(source) || /^[+-]?[0-9]{16,}/.test(source)) {
        const offset = node.range?.[0];
        if (offset !== undefined) {
          at(offset, NUMERIC_MESSAGE);
          const { line, col } = lineCounter.linePos(offset);
          coerced.push({ line, column: col });
        }
      }
    },
  });

  const parsed: ParsedFile = { path: file.path, doc, lineCounter, data: doc.toJS() };

  const data = parsed.data;
  if (usable && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const id = (data as Record<string, unknown>).id;
    const stem = MODEL_PATH.exec(file.path)?.[2];
    if (typeof id === 'string' && stem !== undefined && id !== stem) {
      const { line, column } = positionOf(parsed, '/id', 'value');
      problems.push({
        file: file.path,
        line,
        column,
        message: `the id must equal the file name without .yaml: "${stem}"`,
      });
    }
  }
  return { parsed, problems, usable, coerced };
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
