import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { Problem } from 'uio-config';
import { type ParsedFile, positionOf } from './load.ts';

/** Directory of the hand-written JSON Schemas. */
export const SCHEMA_DIR = new URL('../../schemas/', import.meta.url);

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One Ajv instance with every `*.schema.json` registered under its relative `$id`. */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormatsModule.default(ajv);
  const dir = fileURLToPath(SCHEMA_DIR);
  for (const name of readdirSync(dir)
    .filter((entry) => entry.endsWith('.schema.json'))
    .sort(compare)) {
    ajv.addSchema(JSON.parse(readFileSync(`${dir}${name}`, 'utf8')) as object);
  }
  return ajv;
}

const escapePointer = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

function toProblem(parsed: ParsedFile, error: ErrorObject): Problem {
  if (error.keyword === 'unevaluatedProperties') {
    const key = String((error.params as { unevaluatedProperty: string }).unevaluatedProperty);
    const { line, column } = positionOf(
      parsed,
      `${error.instancePath}/${escapePointer(key)}`,
      'key',
    );
    return { file: parsed.path, line, column, message: `unknown property "${key}"` };
  }
  const { line, column } = positionOf(parsed, error.instancePath, 'value');
  return {
    file: parsed.path,
    line,
    column,
    message: `${error.keyword}: ${error.message ?? 'is not valid'}`,
  };
}

/** Validate the parsed data against the schema `schemaId`; one positioned problem per Ajv error. */
export function schemaProblems(ajv: Ajv2020, schemaId: string, parsed: ParsedFile): Problem[] {
  const validate = ajv.getSchema(schemaId);
  if (validate === undefined) {
    return [{ file: parsed.path, message: `schema ${schemaId} is not available` }];
  }
  if (validate(parsed.data)) return [];
  return (validate.errors ?? []).map((error) => toProblem(parsed, error));
}
