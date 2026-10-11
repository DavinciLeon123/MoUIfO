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
 * - `strip_prefix: n` and `strip_suffix: n` (integer, 0 or more) drop n characters from the start or
 *   the end; n equal to the length gives the empty string, n above the length gives null, n = 0
 *   changes nothing.
 * - `add_prefix: s` and `add_suffix: s` (non-empty string) concatenate s at the start or the end.
 * - `pad_left: { length, char }` pads on the left with exactly one `char` (one UTF-16 code unit)
 *   until the value has `length` characters (integer, 1 or more); a longer value is left unchanged.
 * - `uppercase` is the bare string step (no argument) and upper-cases in a locale-independent way.
 * - `remove: chars` (non-empty string) deletes every character of `chars` from the value, wherever
 *   it occurs (SPEC example: `remove: " .-"`).
 * - `template: text` builds a new value from `text`; the only placeholders are `{value}` and
 *   `{capture:n}`, and any other brace content or an unmatched brace is a compile error.
 * - Steps run in list order; `{capture:n}` needs an earlier `capture` step with at least n groups.
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
type StepResult =
  | { ok: true; apply: CompiledStep; groups?: number }
  | { ok: false; message: string };

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
    groups: pattern.groups,
    apply(value, state) {
      // The regex has no g or y flag, so exec keeps no state between runs.
      const match = compiled.exec(value);
      state.match = match;
      if (match === null) return null;
      return match[group] ?? null;
    },
  };
}

/** Compile-time knowledge of the preceding steps: the group count of the latest `capture`. */
type CompileContext = { groups: number | null; captureFailed: boolean };

function fail(message: string): StepResult {
  return { ok: false, message };
}

function compileCount(operation: 'strip_prefix' | 'strip_suffix', argument: unknown): StepResult {
  if (typeof argument !== 'number' || !Number.isInteger(argument) || argument < 0) {
    return fail(`${operation} needs an integer of at least 0`);
  }
  const n = argument;
  if (operation === 'strip_prefix') {
    return { ok: true, apply: (value) => (value.length < n ? null : value.slice(n)) };
  }
  // An explicit end index: slice(0, -n) would be wrong for n = 0.
  return {
    ok: true,
    apply: (value) => (value.length < n ? null : value.slice(0, value.length - n)),
  };
}

function compileAdd(operation: 'add_prefix' | 'add_suffix', argument: unknown): StepResult {
  if (typeof argument !== 'string' || argument.length === 0) {
    return fail(`${operation} needs a non-empty string`);
  }
  const text = argument;
  return operation === 'add_prefix'
    ? { ok: true, apply: (value) => text + value }
    : { ok: true, apply: (value) => value + text };
}

function compilePadLeft(argument: unknown): StepResult {
  if (!isRecord(argument)) return fail('pad_left needs an object with length and char');
  if (Object.keys(argument).some((key) => key !== 'length' && key !== 'char')) {
    return fail('pad_left accepts only length and char');
  }
  const { length, char } = argument;
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 1) {
    return fail('pad_left length must be an integer of at least 1');
  }
  if (typeof char !== 'string' || char.length !== 1) {
    return fail('pad_left char must be exactly one character');
  }
  return { ok: true, apply: (value) => value.padStart(length, char) };
}

function compileRemove(argument: unknown): StepResult {
  if (typeof argument !== 'string' || argument.length === 0) {
    return fail('remove needs a non-empty string');
  }
  const unwanted = new Set([...argument]);
  return { ok: true, apply: (value) => [...value].filter((c) => !unwanted.has(c)).join('') };
}

type TemplatePart = string | { value: true } | { capture: number };

/** Split a template into literal text and placeholders; only {value} and {capture:n} are allowed. */
function parseTemplate(text: string): TemplatePart[] | string {
  const parts: TemplatePart[] = [];
  let literal = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    if (c === '}') return 'invalid template placeholder: unmatched }';
    if (c !== '{') {
      literal += c;
      i += 1;
      continue;
    }
    const close = text.indexOf('}', i);
    if (close === -1) return 'invalid template placeholder: unmatched {';
    const inner = text.slice(i + 1, close);
    if (literal !== '') parts.push(literal);
    literal = '';
    if (inner === 'value') {
      parts.push({ value: true });
    } else if (/^capture:[0-9]+$/.test(inner)) {
      parts.push({ capture: Number(inner.slice('capture:'.length)) });
    } else {
      return `invalid template placeholder: {${inner}}`;
    }
    i = close + 1;
  }
  if (literal !== '') parts.push(literal);
  return parts;
}

function compileTemplate(argument: unknown, context: CompileContext): StepResult {
  if (typeof argument !== 'string') return fail('template needs a string');
  const parts = parseTemplate(argument);
  if (typeof parts === 'string') return fail(parts);
  for (const part of parts) {
    if (typeof part === 'string' || !('capture' in part) || context.captureFailed) continue;
    if (context.groups === null) {
      return fail('invalid template placeholder: {capture:n} needs an earlier capture step');
    }
    if (part.capture > context.groups) {
      return fail(
        `invalid template placeholder: {capture:${part.capture}} is above the ${context.groups} groups of the latest capture`,
      );
    }
  }
  return {
    ok: true,
    apply(value, state) {
      let out = '';
      for (const part of parts) {
        if (typeof part === 'string') {
          out += part;
        } else if ('value' in part) {
          out += value;
        } else {
          const group = state.match?.[part.capture];
          if (group === undefined) return null;
          out += group;
        }
      }
      return out;
    },
  };
}

function compileStep(step: unknown, context: CompileContext): StepResult {
  if (typeof step === 'string') {
    if (step === 'uppercase') return { ok: true, apply: (value) => value.toUpperCase() };
    return TRANSFORM_OPERATIONS.includes(step as TransformOperation)
      ? fail(`operation "${step}" needs an argument`)
      : fail(`unknown transform operation "${step}"`);
  }
  if (!isRecord(step)) return fail('a step must have exactly one operation');
  const keys = Object.keys(step);
  if (keys.length !== 1) return fail('a step must have exactly one operation');
  const operation = keys[0] as string;
  const argument = step[operation];
  switch (operation as TransformOperation) {
    case 'strip_prefix':
    case 'strip_suffix':
      return compileCount(operation as 'strip_prefix' | 'strip_suffix', argument);
    case 'add_prefix':
    case 'add_suffix':
      return compileAdd(operation as 'add_prefix' | 'add_suffix', argument);
    case 'pad_left':
      return compilePadLeft(argument);
    case 'uppercase':
      return fail('uppercase is the bare string step and takes no argument');
    case 'remove':
      return compileRemove(argument);
    case 'capture': {
      const result = compileCapture(argument);
      context.captureFailed = !result.ok;
      if (result.ok) context.groups = result.groups ?? null;
      return result;
    }
    case 'template':
      return compileTemplate(argument, context);
    default:
      return fail(`unknown transform operation "${operation}"`);
  }
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
  const context: CompileContext = { groups: null, captureFailed: false };
  steps.forEach((step, index) => {
    const result = compileStep(step, context);
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
