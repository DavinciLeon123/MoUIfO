import { MODEL_CONTRACT, type Model } from '@uio/engine';
import type { RawModel } from 'uio-validate';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type Loose = Record<string, unknown>;

/** The scheme header fields that DEC-029 lets a file write bare or in the long form. */
const HEADER_FIELDS = [
  'issuer',
  'jurisdiction',
  'kind',
  'abbreviation',
  'availability',
  'iso6523_icd',
  'peppol_eas',
] as const;

/** Header fields that are left out of the record when absent or null. */
const OMIT_WHEN_NULL: ReadonlySet<string> = new Set(['iso6523_icd', 'peppol_eas']);

/**
 * A deep copy with the keys of every object in codepoint order (`<` and `>` on strings, never
 * `localeCompare`); arrays keep their authored order (D-03). The input is not mutated.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compare(a, b))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One scheme as model.json holds it: each header field present in the long form `{ value, source,
 * certainty }` (a bare value takes the scheme's default source at `certain`, DEC-029), an absent or
 * null `iso6523_icd` or `peppol_eas` left out, the `sources` key dropped, everything else as authored.
 */
function normaliseScheme(record: unknown): unknown {
  if (!isObject(record)) return record;
  const defaultSource = isObject(record.sources) ? record.sources.default : undefined;
  const out: Loose = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'sources') continue;
    if (!(HEADER_FIELDS as readonly string[]).includes(key)) {
      out[key] = value;
      continue;
    }
    if (OMIT_WHEN_NULL.has(key) && (value === undefined || value === null)) continue;
    out[key] = isObject(value) ? value : { value, source: defaultSource, certainty: 'certain' };
  }
  return out;
}

/** The validated raw model as the normalised `dist/model.json` model (DEC-054). */
export function normalise(raw: RawModel, modelVersion: string): Model {
  return sortKeys({
    contract: MODEL_CONTRACT,
    model_version: modelVersion,
    authorities: raw.authorities,
    jurisdictions: raw.jurisdictions,
    schemes: Object.fromEntries(
      Object.entries(raw.schemes).map(([id, record]) => [id, normaliseScheme(record)]),
    ),
    sources: raw.sources,
    vocab: raw.vocab,
  }) as Model;
}
