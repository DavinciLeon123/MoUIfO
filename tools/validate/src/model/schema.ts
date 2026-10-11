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

/**
 * Drop `if` errors and, for each `oneOf` or `anyOf` failure, the branch errors at the same
 * instance path (their schema path lies below the group's); the group error itself stays.
 */
function shapeErrors(errors: readonly ErrorObject[]): ErrorObject[] {
  const kept = errors.filter((error) => error.keyword !== 'if');
  const groups = kept.filter((error) => error.keyword === 'oneOf' || error.keyword === 'anyOf');
  return kept.filter(
    (error) =>
      !groups.some(
        (group) =>
          group !== error &&
          group.instancePath === error.instancePath &&
          error.schemaPath.startsWith(group.schemaPath),
      ),
  );
}

/** One readable message per failing rule; it names the rule, never the failing instance value. */
function messageOf(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return `missing required property "${String(params.missingProperty)}"`;
    case 'enum':
      return `must be one of: ${(params.allowedValues as unknown[]).map(String).join(', ')}`;
    case 'const':
      return `must be "${String(params.allowedValue)}"`;
    case 'type':
      return `must be ${Array.isArray(params.type) ? params.type.join(' or ') : String(params.type)}`;
    case 'oneOf':
      return 'must match exactly one allowed form';
    case 'anyOf':
      return 'must match at least one allowed form';
    default:
      return error.message ?? 'is not valid';
  }
}

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
  const { line, column } = positionOf(
    parsed,
    error.instancePath,
    error.keyword === 'required' ? 'key' : 'value',
  );
  return { file: parsed.path, line, column, message: messageOf(error) };
}

/** Validate the parsed data against the schema `schemaId`; one positioned problem per failing rule. */
export function schemaProblems(ajv: Ajv2020, schemaId: string, parsed: ParsedFile): Problem[] {
  const validate = ajv.getSchema(schemaId);
  if (validate === undefined) {
    return [{ file: parsed.path, message: `schema ${schemaId} is not available` }];
  }
  if (validate(parsed.data)) return [];
  return shapeErrors(validate.errors ?? []).map((error) => toProblem(parsed, error));
}
