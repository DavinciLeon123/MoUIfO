import type { KeywordDefinition } from 'ajv/dist/2020.js';
import type { DataValidationCxt, SchemaValidateFunction } from 'ajv/dist/types/index.js';
import type { Problem } from 'uio-config';
import { type ParsedFile, positionOf, VOCAB_SCHEMAS } from './load.ts';

/**
 * Every id a reference may name, by kind: `source`, `jurisdiction`, `authority`, `authority-class`,
 * `scheme`, `vocab` (vocabulary ids) and `vocab:<id>` (the member keys of one vocabulary).
 */
export type Registry = ReadonlyMap<string, ReadonlySet<string>>;

const MODEL_PATH = /^model\/([^/]+)\/([^/]+)\.yaml$/;

/** Directories under `model/` whose files are registered, with the registry kind of their ids. */
const KIND_OF_DIRECTORY: Readonly<Record<string, string>> = {
  sources: 'source',
  jurisdictions: 'jurisdiction',
  authorities: 'authority',
  schemes: 'scheme',
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Collect the ids of the given files by kind. Callers pass only files without a parse or schema
 * problem, so a broken file never vouches for a reference to it. A file is registered under its
 * `id`; a vocabulary also registers each member key (`id`, or `prefix` for a prefix-valued list).
 */
export function buildRegistry(files: readonly { parsed: ParsedFile }[]): Registry {
  const registry = new Map<string, Set<string>>();
  const add = (kind: string, id: string): void => {
    let ids = registry.get(kind);
    if (ids === undefined) {
      ids = new Set();
      registry.set(kind, ids);
    }
    ids.add(id);
  };

  for (const { parsed } of files) {
    const directory = MODEL_PATH.exec(parsed.path)?.[1];
    const data = asRecord(parsed.data);
    const id = data?.id;
    if (directory === undefined || data === undefined || typeof id !== 'string') continue;

    if (directory === 'vocab') {
      add('vocab', id);
      const values = Array.isArray(data.values) ? data.values : [];
      for (const value of values) {
        const member = asRecord(value);
        const key = member?.id ?? member?.prefix;
        if (typeof key === 'string') add(`vocab:${id}`, key);
      }
      continue;
    }
    const kind = KIND_OF_DIRECTORY[directory];
    if (kind === undefined) continue;
    add(kind, id);
    if (directory === 'authorities' && data.kind === 'class') add('authority-class', id);
  }
  return registry;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  source: 'source',
  jurisdiction: 'jurisdiction',
  'jurisdiction-negatable': 'jurisdiction',
  authority: 'authority',
  'authority-class': 'authority class',
  scheme: 'scheme',
  vocab: 'vocabulary',
};

function kindLabel(kind: string): string {
  if (kind.startsWith('vocab:')) return `member of vocabulary ${kind.slice('vocab:'.length)}`;
  return KIND_LABELS[kind] ?? kind;
}

/** Values that look like an id (or a negated id) are safe to echo; anything else may be an identifier. */
const ID_SHAPED = /^!?[A-Za-z][A-Za-z0-9-]*$/;

/**
 * The Ajv keyword `uioRef`: its schema value names the registry kind a string must belong to
 * (`source`, `jurisdiction`, `jurisdiction-negatable`, `authority`, `authority-class`, `scheme`,
 * `vocab` or `vocab:<id>`). With no registry every value passes; with one, every `source` value
 * is recorded in `cited` and a miss is an error at the referring value. A leading `!` is stripped
 * only for `jurisdiction-negatable` (conditions negate a jurisdiction, SPEC 5.3). A value that is
 * not id-shaped is never echoed in the message.
 */
export function refKeyword(registry: Registry | undefined, cited: Set<string>): KeywordDefinition {
  const check: SchemaValidateFunction = (
    kind: string,
    value: string,
    _parentSchema?: unknown,
    context?: DataValidationCxt,
  ) => {
    if (registry === undefined) return true;
    if (kind === 'source') cited.add(value);
    const negatable = kind === 'jurisdiction-negatable';
    const key = negatable ? 'jurisdiction' : kind;
    const bare = negatable && value.startsWith('!') ? value.slice(1) : value;
    if (registry.get(key)?.has(bare) === true) return true;
    const subject = ID_SHAPED.test(value) ? `"${value}"` : 'the value';
    check.errors = [
      {
        keyword: 'uioRef',
        message: `${subject} is not a known ${kindLabel(kind)}`,
        params: { ref: kind },
        instancePath: context?.instancePath ?? '',
      },
    ];
    return false;
  };
  return { keyword: 'uioRef', type: 'string', schemaType: 'string', errors: true, validate: check };
}

/**
 * Vocabularies that may have `values: []`. Every other SPEC 5.1 list comes with a starter set;
 * no source names a context tag yet, so `condition-context` is seeded empty (DEC-019).
 */
export const EMPTY_VOCABS_ALLOWED = ['condition-context'] as const;

/**
 * Integrity of one vocabulary's closed list: each member key (`id`, or `prefix` for a
 * prefix-valued list) and each `rank` appears once (error at the second occurrence), and the list
 * is not empty unless the vocabulary is in `EMPTY_VOCABS_ALLOWED`. Messages never echo a value.
 */
export function checkVocabMembers(parsed: ParsedFile): Problem[] {
  const data = asRecord(parsed.data);
  const values = data?.values;
  if (data === undefined || !Array.isArray(values)) return [];
  const problems: Problem[] = [];
  const at = (pointer: string, target: 'value' | 'key', message: string): void => {
    const { line, column } = positionOf(parsed, pointer, target);
    problems.push({ file: parsed.path, line, column, message });
  };

  const allowed: readonly string[] = EMPTY_VOCABS_ALLOWED;
  if (values.length === 0 && !(typeof data.id === 'string' && allowed.includes(data.id))) {
    at('/values', 'key', 'a vocabulary needs at least one value');
  }

  const keys = new Set<string>();
  const ranks = new Set<number>();
  values.forEach((value, index) => {
    const member = asRecord(value);
    if (member === undefined) return;
    const field = typeof member.id === 'string' ? 'id' : 'prefix';
    const key = member[field];
    if (typeof key === 'string') {
      if (keys.has(key)) {
        at(
          `/values/${index}/${field}`,
          'value',
          'duplicate member: each member may appear only once',
        );
      }
      keys.add(key);
    }
    const rank = member.rank;
    if (typeof rank === 'number') {
      if (ranks.has(rank)) {
        at(`/values/${index}/rank`, 'value', 'duplicate rank: each rank may be used only once');
      }
      ranks.add(rank);
    }
  });
  return problems;
}

/**
 * One file-level problem for each known vocabulary (key of `VOCAB_SCHEMAS`) whose file is not among
 * `paths`, in sorted order. The required list is the known list: a vocabulary is added by adding
 * its file and its `VOCAB_SCHEMAS` entry together.
 */
export function checkRequiredVocabs(paths: readonly string[]): Problem[] {
  const present = new Set(paths);
  return Object.keys(VOCAB_SCHEMAS)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id) => `model/vocab/${id}.yaml`)
    .filter((path) => !present.has(path))
    .map((file) => ({ file, message: 'required vocabulary file is missing' }));
}
