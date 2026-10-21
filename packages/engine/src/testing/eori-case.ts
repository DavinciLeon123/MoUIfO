import type { Engine } from '../engine.ts';

/**
 * Test helper (never exported from the package, ENG-10, D-15): the EORI case of SPEC section 10 run
 * through the engine and projected to plain JSON. Only model values appear here: the SPEC section 10
 * values (the public example RSIN 001469630 and values the model's rules derive from it).
 */

function isSourceRef(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/**
 * A deep copy in which every property named `source` whose value is an object with a string `id` is
 * replaced by that id, so a title or URL edit in the model does not churn the golden (RESEARCH
 * Pitfall 9). Arrays and nested objects are walked and the key order is kept.
 */
export function projectSources(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => projectSources(item));
  }
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = key === 'source' && isSourceRef(item) ? item.id : projectSources(item);
    }
    return copy;
  }
  return value;
}

/** The EORI case object, with its fixed key order, projected through `projectSources`. */
export function runEoriCase(engine: Engine): unknown {
  return projectSources({
    recognise: [
      engine.recognise('NL001469630'),
      engine.recognise('NL001469630B01'),
      engine.recognise('001469630'),
    ],
    derive: [engine.derive('NL001469630', 'eori'), engine.derive('DE123456789012345', 'eori')],
    check: engine.check(['NL001469630', 'NL001469630B01', '001469630']),
    relate: [engine.relate('rsin', 'eori'), engine.relate('vat-nl', 'eori')],
    applicability: [engine.applicability('eori', 'NL'), engine.applicability('eori', 'XI')],
  });
}
