import type { KeywordDefinition } from 'ajv/dist/2020.js';
import type { DataValidationCxt, SchemaValidateFunction } from 'ajv/dist/types/index.js';
import type { ParsedFile } from './load.ts';

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
