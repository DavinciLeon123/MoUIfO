import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';
import { syntheticValid } from './testing/synthetic-values.ts';
import type { Result } from './types.ts';

// Result invariants over all six functions (ENG-08, DEC-070). A corpus of every model example, the
// SPEC section 10 values and malformed inputs is run through every function, and each Result must
// be traceable (a step per conclusion, the weakest-step certainty, a source on every model step),
// survive a JSON round trip, echo no value and carry only known warning codes. Violations are
// collected as function names and corpus indices, never as values, so a failure prints no value.

const model = loadDistModel();
const engine = createEngine(model);

type FunctionName = 'recognise' | 'derive' | 'describe' | 'applicability' | 'relate' | 'check';
const FUNCTIONS: FunctionName[] = [
  'recognise',
  'derive',
  'describe',
  'applicability',
  'relate',
  'check',
];

type Run = {
  fn: FunctionName;
  label: string;
  result: Result<unknown>;
  /** Value-bearing strings the result must not contain; empty for the functions that read no value. */
  needles: string[];
};

// The corpus: every example, every rule example input, the SPEC section 10 triple, the DE contrast,
// two runtime-built synthetic values and malformed inputs.
const schemes = Object.entries(model.schemes);
const synthetic = syntheticValid();
const TRIPLE = ['NL001469630', 'NL001469630B01', '001469630'];
const corpus: string[] = [
  ...new Set([
    ...schemes.flatMap(([, scheme]) => [
      ...(scheme.format?.examples_valid ?? []),
      ...(scheme.format?.examples_invalid ?? []),
      ...(scheme.rules ?? []).flatMap((rule) => (rule.examples ?? []).map((each) => each.in)),
    ]),
    ...TRIPLE,
    'DE123456789012345',
    synthetic,
    `NL${synthetic}B01`,
    '',
    '   ',
    'iso6523-actorid-upis::0106:abcdefgh',
    'x'.repeat(300),
    '__proto__',
    'constructor',
  ]),
];

const ALLOWED_CODES = new Set([
  'invalid-input',
  'empty-input',
  'input-too-long',
  'invalid-context',
  'unknown-context-key',
  'unknown-context-value',
  'context-conflict',
  'unknown-component-prefix',
  'component-not-accepted',
  'unknown-country-hint',
  'possible-personal-identifier',
  'unknown-scheme',
  'unknown-jurisdiction',
  'same-scheme',
  'no-chain',
  'value-not-accepted',
  'output-failed-validation',
  'too-many-results',
  'duplicate-value',
  'too-many-values',
]);

/** Conclusion keys whose certainty a rule lowers instead of taking the weakest step (DEC-063, DEC-065, DEC-070). */
const LOWERED_KEYS = new Set(['recognise.checksum-failed', 'recognise.component-not-accepted']);

const RANK: Record<string, number> = { certain: 3, likely: 2, possible: 1 };

/** Needles shorter than this are ordinary substrings of ids and words, so they are not searched. */
const MIN_NEEDLE = 8;

const runs: Run[] = [];

function needlesOf(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((v) => v.length >= MIN_NEEDLE))];
}

function derivedValues(input: string): string[] {
  const derived = engine.derive(input).data;
  return derived.map((each) => each.value);
}

corpus.forEach((value, index) => {
  const label = `corpus[${index}]`;
  const recognised = engine.recognise(value);
  runs.push({
    fn: 'recognise',
    label,
    result: recognised,
    needles: needlesOf([value]),
  });
  const all = engine.derive(value);
  runs.push({
    fn: 'derive',
    label,
    result: all,
    needles: needlesOf([value, ...all.data.map((each) => each.value)]),
  });
  for (const candidate of recognised.data) {
    if (!candidate.accepted) continue;
    const named = engine.derive(value, candidate.scheme);
    runs.push({
      fn: 'derive',
      label: `${label} as ${candidate.scheme}`,
      result: named,
      needles: needlesOf([value, ...named.data.map((each) => each.value)]),
    });
  }
});

for (const [id] of schemes) {
  runs.push({ fn: 'describe', label: id, result: engine.describe(id), needles: [] });
  for (const jurisdiction of Object.keys(model.jurisdictions)) {
    runs.push({
      fn: 'applicability',
      label: `${id} in ${jurisdiction}`,
      result: engine.applicability(id, jurisdiction),
      needles: [],
    });
  }
  for (const [other] of schemes) {
    runs.push({
      fn: 'relate',
      label: `${id} to ${other}`,
      result: engine.relate(id, other),
      needles: [],
    });
  }
}

function addCheck(label: string, values: string[]): void {
  runs.push({
    fn: 'check',
    label,
    result: engine.check(values),
    needles: needlesOf([...values, ...values.flatMap(derivedValues)]),
  });
}

addCheck('the SPEC section 10 triple', TRIPLE);
for (const [id, scheme] of schemes) {
  const examples = [...(scheme.format?.examples_valid ?? [])];
  if (examples.length >= 2) addCheck(`valid examples of ${id}`, examples);
}
addCheck(
  'valid examples of every scheme',
  schemes.flatMap(([, scheme]) => [...(scheme.format?.examples_valid ?? [])]),
);

type Json = Record<string, unknown>;

/** Every object anywhere in a result that looks like an explanation step. */
function stepsIn(node: unknown, found: Json[] = []): Json[] {
  if (Array.isArray(node)) {
    for (const each of node) stepsIn(each, found);
  } else if (typeof node === 'object' && node !== null) {
    const object = node as Json;
    if (
      typeof object.kind === 'string' &&
      typeof object.ref === 'string' &&
      'source' in object &&
      'certainty' in object
    ) {
      found.push(object);
    }
    for (const each of Object.values(object)) stepsIn(each, found);
  }
  return found;
}

/** Every string the prose and refs of a result hold: statements, warning messages, step refs, param values. */
function proseOf(result: Result<unknown>): string[] {
  const texts: string[] = [];
  for (const each of result.conclusions) {
    texts.push(each.statement, ...Object.values(each.params));
  }
  for (const each of result.warnings) texts.push(each.message);
  for (const step of stepsIn(result)) texts.push(String(step.ref));
  return texts;
}

const runsOf = (fn: FunctionName): Run[] => runs.filter((each) => each.fn === fn);

describe('invariants: the corpus reaches every function', () => {
  test('the corpus holds the model examples, the acceptance values and malformed inputs', () => {
    expect(corpus.length).toBeGreaterThan(40);
    expect(corpus.includes('')).toBe(true);
    expect(new Set(runs.map((each) => each.fn)).size).toBe(FUNCTIONS.length);
  });
});

describe('invariants: every conclusion has a step and the weakest-step certainty', () => {
  test.for(FUNCTIONS)('%s', (fn) => {
    const violations: string[] = [];
    let seen = 0;
    for (const run of runsOf(fn)) {
      run.result.conclusions.forEach((each, index) => {
        seen += 1;
        const where = `${run.label} conclusion[${index}] ${each.key}`;
        if (each.explanation.length === 0) violations.push(`${where}: no step`);
        if (LOWERED_KEYS.has(each.key)) {
          if (each.certainty !== 'possible') violations.push(`${where}: not lowered to possible`);
          return;
        }
        const weakest = Math.min(...each.explanation.map((step) => RANK[step.certainty] ?? 0));
        if (RANK[each.certainty] !== weakest) violations.push(`${where}: not the weakest step`);
      });
    }
    expect(violations).toEqual([]);
    // The lowered keys are exercised by the corpus: a wrong checksum and a Peppol component.
    if (fn === 'recognise') expect(seen).toBeGreaterThan(0);
  });

  test('the two lowered keys occur in the corpus, so the exception is exercised', () => {
    const keys = new Set(runs.flatMap((run) => run.result.conclusions.map((each) => each.key)));
    expect(keys.has('recognise.checksum-failed')).toBe(true);
    expect(keys.has('recognise.component-not-accepted')).toBe(true);
  });
});

describe('invariants: a step has a source unless it is an assumption or a context fact', () => {
  test.for(FUNCTIONS)('%s', (fn) => {
    const violations: string[] = [];
    for (const run of runsOf(fn)) {
      stepsIn(run.result).forEach((step, index) => {
        const where = `${run.label} step[${index}]`;
        const source = step.source as { id?: unknown } | null;
        const nullAllowed = step.kind === 'assumption' || String(step.ref).startsWith('ctx/');
        if (source === null) {
          if (!nullAllowed) violations.push(`${where}: null source on a model step`);
        } else if (typeof source?.id !== 'string' || !Object.hasOwn(model.sources, source.id)) {
          violations.push(`${where}: source is not a source of the model`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('invariants: results survive a JSON round trip unchanged', () => {
  test.for(['describe', 'applicability', 'relate'] as FunctionName[])('%s', (fn) => {
    // These results hold no input value, so a full diff is safe to print.
    for (const run of runsOf(fn)) {
      expect(JSON.parse(JSON.stringify(run.result))).toStrictEqual(run.result);
    }
  });

  test.for(['recognise', 'derive', 'check'] as FunctionName[])('%s', (fn) => {
    // These results can hold a value, so the comparison is a boolean and a failure names the run.
    const changed = runsOf(fn)
      .filter((run) => !isDeepStrictEqual(JSON.parse(JSON.stringify(run.result)), run.result))
      .map((run) => run.label);
    expect(changed).toEqual([]);
  });
});

describe('invariants: no prose or ref contains an input or derived value', () => {
  test.for(FUNCTIONS)('%s', (fn) => {
    const echoes: string[] = [];
    let searched = 0;
    for (const run of runsOf(fn)) {
      if (run.needles.length > 0) searched += 1;
      const texts = proseOf(run.result);
      const leaked = run.needles.some((needle) => texts.some((text) => text.includes(needle)));
      if (leaked) echoes.push(run.label);
    }
    expect(echoes).toEqual([]);
    if (fn === 'recognise' || fn === 'derive' || fn === 'check') {
      expect(searched).toBeGreaterThan(0);
    }
  });
});

describe('invariants: warnings use the known codes and carry no run of digits', () => {
  test.for(FUNCTIONS)('%s', (fn) => {
    const violations: string[] = [];
    for (const run of runsOf(fn)) {
      run.result.warnings.forEach((warning, index) => {
        const where = `${run.label} warning[${index}]`;
        if (!ALLOWED_CODES.has(warning.code)) violations.push(`${where}: unknown code`);
        if (/\d{5,}/.test(warning.message)) violations.push(`${where}: five or more digits`);
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('invariants: no function throws for a value of the wrong type', () => {
  const BAD: unknown[] = [null, 42, {}, [], undefined];
  const bad = (value: unknown): never => value as never;

  test.for(BAD.map((value, index) => ({ value, name: `bad[${index}]` })))(
    '$name: every function returns a Result',
    ({ value }) => {
      const results: Result<unknown>[] = [
        engine.recognise(bad(value)),
        engine.recognise('NL001469630', bad(value)),
        engine.recognise('NL001469630', { country: bad(value) }),
        engine.describe(bad(value)),
        engine.applicability(bad(value), 'NL'),
        engine.applicability('eori', bad(value)),
        engine.relate(bad(value), 'eori'),
        engine.relate('eori', bad(value)),
        engine.relate('eori', 'rsin', bad(value)),
        engine.derive(bad(value)),
        engine.derive('NL001469630', bad(value)),
        engine.derive('NL001469630', 'eori', bad(value)),
        engine.check(bad(value)),
        engine.check([bad(value)]),
        engine.check(['NL001469630', 'NL001469630B01'], bad(value)),
      ];
      for (const result of results) {
        expect(Array.isArray(result.data) || result.data === null).toBe(true);
        expect(Array.isArray(result.conclusions)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        for (const warning of result.warnings) expect(ALLOWED_CODES.has(warning.code)).toBe(true);
      }
    },
  );

  test('a context with a wrong-typed key does not throw either', () => {
    const contexts: unknown[] = [{ issuing_country: 42 }, { entity_form: null }, { context: [] }];
    for (const ctx of contexts) {
      expect(() => engine.derive('NL001469630', 'eori', bad(ctx))).not.toThrow();
      expect(() => engine.relate('eori', 'rsin', bad(ctx))).not.toThrow();
      expect(() => engine.check(['NL001469630', 'NL001469630B01'], bad(ctx))).not.toThrow();
    }
  });
});
