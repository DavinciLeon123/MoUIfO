/**
 * The fixed transform interpreter (SPEC §5.3, MOD-11). A transform is a list of steps held as model
 * data; each step is either the bare string `uppercase` or an object with exactly one key from
 * TRANSFORM_OPERATIONS. Nothing outside that set compiles, no code is evaluated, and results depend
 * only on the input and the model (SPEC §6.2).
 *
 * The reading of SPEC §5.3 used here (which fixes the operation names only):
 * - `{value}` in a template is the current value, the output of the previous step.
 * - `capture: { regex, group }` runs the regex on the current value and gives group `group`
 *   (0 is the whole match). No match, or a group that did not take part, gives no result (null).
 * - `{capture:n}` in a template is group n of the most recent preceding `capture` step.
 * - Every pattern and capture regex compiles with the single flag `u` (REGEX_FLAGS).
 * - A step that gives null makes the whole transform give null (SPEC: no conclusion).
 */

/** The only regex flag: Unicode mode. Caller-chosen flags do not exist. */
export const REGEX_FLAGS = 'u';

/** The nine SPEC §5.3 operations, in SPEC order. */
export const TRANSFORM_OPERATIONS = [
  'strip_prefix',
  'strip_suffix',
  'add_prefix',
  'add_suffix',
  'pad_left',
  'uppercase',
  'remove',
  'capture',
  'template',
] as const;

export type TransformOperation = (typeof TRANSFORM_OPERATIONS)[number];

export type PatternResult =
  | { ok: true; regex: RegExp; groups: number }
  | { ok: false; message: string };

/** Compile a model regex with REGEX_FLAGS and report its capture-group count. */
export function compilePattern(source: string): PatternResult {
  try {
    const regex = new RegExp(source, REGEX_FLAGS);
    // Appending an empty alternative matches the empty string, so exec('') lists every group slot.
    const probe = new RegExp(`${source}|`, REGEX_FLAGS).exec('');
    const groups = probe === null ? 0 : probe.length - 1;
    return { ok: true, regex, groups };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export type TransformError = { step: number; message: string };

export type TransformResult =
  | { ok: true; run(value: string): string | null }
  | { ok: false; errors: TransformError[] };

/** State shared between the steps of one run: the match of the most recent `capture` step. */
type RunState = { match: RegExpExecArray | null };
type CompiledStep = (value: string, state: RunState) => string | null;
type StepResult = { ok: true; apply: CompiledStep } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compileCapture(argument: unknown): StepResult {
  if (!isRecord(argument)) {
    return { ok: false, message: 'capture needs an object with regex and group' };
  }
  const keys = Object.keys(argument);
  if (keys.some((key) => key !== 'regex' && key !== 'group')) {
    return { ok: false, message: 'capture accepts only regex and group' };
  }
  const { regex, group } = argument;
  if (typeof regex !== 'string') return { ok: false, message: 'capture regex must be a string' };
  if (typeof group !== 'number' || !Number.isInteger(group) || group < 0) {
    return { ok: false, message: 'capture group must be an integer of at least 0' };
  }
  const pattern = compilePattern(regex);
  if (!pattern.ok) return { ok: false, message: `capture regex is invalid: ${pattern.message}` };
  if (group > pattern.groups) {
    return {
      ok: false,
      message: `capture group ${group} is above the ${pattern.groups} groups of the regex`,
    };
  }
  const compiled = pattern.regex;
  return {
    ok: true,
    apply(value, state) {
      // The regex has no g or y flag, so exec keeps no state between runs.
      const match = compiled.exec(value);
      state.match = match;
      if (match === null) return null;
      return match[group] ?? null;
    },
  };
}

function compileStep(step: unknown): StepResult {
  let operation: string;
  let argument: unknown;
  if (typeof step === 'string') {
    operation = step;
    argument = undefined;
    if (operation !== 'uppercase') {
      return TRANSFORM_OPERATIONS.includes(operation as TransformOperation)
        ? { ok: false, message: `operation "${operation}" needs an argument` }
        : { ok: false, message: `unknown transform operation "${operation}"` };
    }
  } else if (isRecord(step)) {
    const keys = Object.keys(step);
    if (keys.length !== 1) return { ok: false, message: 'a step must have exactly one operation' };
    operation = keys[0] as string;
    argument = step[operation];
    if (!TRANSFORM_OPERATIONS.includes(operation as TransformOperation)) {
      return { ok: false, message: `unknown transform operation "${operation}"` };
    }
  } else {
    return { ok: false, message: 'a step must have exactly one operation' };
  }

  if (operation === 'capture') return compileCapture(argument);
  return { ok: false, message: `operation "${operation}" is not implemented yet` };
}

/**
 * Compile a list of steps. All compile errors of the list are reported, each with its step index.
 * `run` applies the steps in list order and stops at the first null.
 */
export function compileTransform(steps: readonly unknown[]): TransformResult {
  if (steps.length === 0) {
    return { ok: false, errors: [{ step: 0, message: 'a transform needs at least one step' }] };
  }
  const errors: TransformError[] = [];
  const compiled: CompiledStep[] = [];
  steps.forEach((step, index) => {
    const result = compileStep(step);
    if (result.ok) compiled.push(result.apply);
    else errors.push({ step: index, message: result.message });
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    run(value) {
      const state: RunState = { match: null };
      let current: string | null = value;
      for (const apply of compiled) {
        current = apply(current, state);
        if (current === null) return null;
      }
      return current;
    },
  };
}
