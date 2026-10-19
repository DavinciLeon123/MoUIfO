import type { Problem } from 'uio-config';
import type { Registry } from './refs.ts';
import { createAjv, messageOf, shapeErrors } from './schema.ts';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * The registry of a normalised model, built from the model's own tables: each table key is the id
 * of its kind, `authority-class` holds the authorities of kind `class`, and a vocabulary registers
 * its id and each member key (`id`, or `prefix` for the country-prefix list).
 */
function registryOf(model: unknown): Registry {
  const registry = new Map<string, Set<string>>();
  const add = (kind: string, id: string): void => {
    let ids = registry.get(kind);
    if (ids === undefined) {
      ids = new Set();
      registry.set(kind, ids);
    }
    ids.add(id);
  };
  const tables = asRecord(model) ?? {};
  const keysOf = (table: string): [string, Record<string, unknown> | undefined][] =>
    Object.entries(asRecord(tables[table]) ?? {}).map(([key, record]) => [key, asRecord(record)]);

  for (const [key] of keysOf('sources')) add('source', key);
  for (const [key] of keysOf('jurisdictions')) add('jurisdiction', key);
  for (const [key] of keysOf('schemes')) add('scheme', key);
  for (const [key, record] of keysOf('authorities')) {
    add('authority', key);
    if (record?.kind === 'class') add('authority-class', key);
  }
  for (const [key, record] of keysOf('vocab')) {
    add('vocab', key);
    const values = Array.isArray(record?.values) ? record.values : [];
    for (const value of values) {
      const member = asRecord(value);
      const memberKey = member?.id ?? member?.prefix;
      if (typeof memberKey === 'string') add(`vocab:${key}`, memberKey);
    }
  }
  return registry;
}

const escapePointer = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * Check a normalised model against the closed `model.schema.json`, references included (DEC-054).
 * One problem per failing rule, on file `dist/model.json`; the message names the instance path and
 * the rule, never the failing value (CI logs are public).
 */
export function checkModelJson(model: unknown): Problem[] {
  const ajv = createAjv({ registry: registryOf(model) });
  const validate = ajv.getSchema('model.schema.json');
  if (validate === undefined) {
    return [{ file: 'dist/model.json', message: 'schema model.schema.json is not available' }];
  }
  if (validate(model)) return [];
  return shapeErrors(validate.errors ?? []).map((error) => {
    let path = error.instancePath === '' ? '/' : error.instancePath;
    let message = messageOf(error);
    if (error.keyword === 'unevaluatedProperties') {
      const key = String((error.params as { unevaluatedProperty: string }).unevaluatedProperty);
      path = `${error.instancePath}/${escapePointer(key)}`;
      message = 'unknown property';
    }
    return { file: 'dist/model.json', message: `${path} ${message}` };
  });
}
