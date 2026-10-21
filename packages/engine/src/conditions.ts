import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { assumptionStep, ctxStep, factStep } from './explain.ts';
import type { Condition } from './model-types.ts';
import type { Step, Warning } from './types.ts';

/** The closed condition keys of SPEC §5.3, in evaluation order. */
export const CONDITION_KEYS = ['issuing_country', 'entity_form', 'context'] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];

/** A condition key established by the value itself (sourced) or by the caller's context. */
export type KnownFact = { value: string; steps: Step[]; origin: 'value' | 'ctx' };
export type Known = ReadonlyMap<ConditionKey, KnownFact>;

export type ConditionState = { state: 'true' | 'false' | 'unknown'; steps: Step[] };

function isKey(key: string): key is ConditionKey {
  return (CONDITION_KEYS as readonly string[]).includes(key);
}

/** One key against the known fact; `issuing_country` may be negated with a leading `!`. */
function matches(key: ConditionKey, wanted: string, known: string): boolean {
  if (key === 'issuing_country' && wanted.startsWith('!')) return wanted.slice(1) !== known;
  return wanted === known;
}

/**
 * Evaluate a condition against the known context (SPEC §5.3, DEC-069). Every key must hold: a key
 * the context contradicts makes the condition false (the statement drops), a key nobody established
 * makes it unknown and adds one assumption step at `likely`, otherwise it is true. An established
 * key adds the steps of the fact that established it.
 */
export function evaluateCondition(
  condition: Condition | undefined,
  known: Known,
  ownerRef: string,
): ConditionState {
  if (condition === undefined) return { state: 'true', steps: [] };
  const steps: Step[] = [];
  let falseKey = false;
  let unknownKey = false;
  for (const key of CONDITION_KEYS) {
    const wanted = Object.hasOwn(condition, key) ? condition[key] : undefined;
    if (wanted === undefined) continue;
    const fact = known.get(key);
    if (fact === undefined) {
      unknownKey = true;
      steps.push(assumptionStep(ownerRef, key, wanted));
      continue;
    }
    steps.push(...fact.steps);
    if (!matches(key, wanted, fact.value)) falseKey = true;
  }
  return { state: falseKey ? 'false' : unknownKey ? 'unknown' : 'true', steps };
}

/**
 * The issuing country a value carries (DEC-035): the scheme's `context_from` capture, mapped through
 * the country-prefix vocabulary. A prefix the vocabulary does not map, or no match, gives nothing.
 */
export function valueContext(compiled: CompiledModel, schemeId: string, value: string): Known {
  const known = new Map<ConditionKey, KnownFact>();
  const capture = compiled.schemes.get(schemeId)?.capture;
  if (capture === undefined || capture === null) return known;
  const prefix = capture.run(value);
  if (prefix === null) return known;
  const entry = compiled.prefixes.get(prefix);
  if (entry === undefined) return known;
  known.set('issuing_country', {
    value: entry.jurisdiction,
    origin: 'value',
    steps: [
      factStep(compiled, `${schemeId}/context_from/issuing_country`, capture.statement),
      factStep(compiled, `vocab/country-prefix/${entry.prefix}`, entry),
    ],
  });
  return known;
}

/**
 * Read the caller's context (DEC-069). Only own keys are read; an unknown key or value is ignored
 * with a warning that names the kind of the problem and never the caller's text.
 */
export function resolveContext(
  compiled: CompiledModel,
  ctx: unknown,
): { known: Known; warnings: Warning[] } {
  const known = new Map<ConditionKey, KnownFact>();
  const warnings: Warning[] = [];
  if (ctx === undefined) return { known, warnings };
  if (typeof ctx !== 'object' || ctx === null || Array.isArray(ctx)) {
    warnings.push({ code: 'invalid-context', message: 'the context must be an object' });
    return { known, warnings };
  }
  const record = ctx as Record<string, unknown>;
  for (const key of Object.keys(record).sort(byCodeUnit)) {
    if (!isKey(key)) {
      warnings.push({
        code: 'unknown-context-key',
        message: 'the context has a key that is not a condition key and it is ignored',
      });
      continue;
    }
    const raw = record[key];
    let resolved: string | undefined;
    if (typeof raw === 'string') {
      if (key === 'issuing_country') {
        resolved = compiled.prefixes.get(raw)?.jurisdiction;
        if (resolved === undefined && compiled.jurisdictions.has(raw)) resolved = raw;
      } else if (key === 'entity_form') {
        resolved = compiled.entityForms.has(raw) ? raw : undefined;
      } else {
        resolved = compiled.contextTags.has(raw) ? raw : undefined;
      }
    }
    if (resolved === undefined) {
      warnings.push({
        code: 'unknown-context-value',
        message: `the value of the context key ${key} is not known to the model and it is ignored`,
      });
      continue;
    }
    known.set(key, { value: resolved, origin: 'ctx', steps: [ctxStep(key, resolved)] });
  }
  return { known, warnings };
}

/**
 * Combine the caller's context with the value-derived one. The sourced, value-derived issuing
 * country wins; a different caller country only adds the warning `context-conflict` (DEC-069).
 */
export function mergeKnown(
  ctxKnown: Known,
  valueKnown: Known,
  ref: string,
): { known: Known; warnings: Warning[] } {
  const known = new Map<ConditionKey, KnownFact>(ctxKnown);
  const warnings: Warning[] = [];
  for (const [key, fact] of valueKnown) {
    const given = ctxKnown.get(key);
    if (given !== undefined && given.value !== fact.value) {
      warnings.push({
        code: 'context-conflict',
        message: `the context ${key} differs from the one the value carries; the value's is used`,
        ref,
      });
    }
    known.set(key, fact);
  }
  return { known, warnings };
}
