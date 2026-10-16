import { MODEL_CONTRACT, type Model } from '@uio/engine';
import type { RawModel } from 'uio-validate';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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

/** The validated raw model as the normalised `dist/model.json` model (DEC-054). */
export function normalise(raw: RawModel, modelVersion: string): Model {
  return sortKeys({
    contract: MODEL_CONTRACT,
    model_version: modelVersion,
    authorities: raw.authorities,
    jurisdictions: raw.jurisdictions,
    schemes: raw.schemes,
    sources: raw.sources,
    vocab: raw.vocab,
  }) as Model;
}
