import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import type { Rule, Scheme } from './model-types.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';
import { syntheticValid } from './testing/synthetic-values.ts';

const model = loadDistModel();
const engine = createEngine(model);

// The SPEC section 10 triple: an EORI, the matching VAT number and the bare RSIN.
const TRIPLE = ['NL001469630', 'NL001469630B01', '001469630'];

describe('check: the SPEC section 10 tracer on the real model', () => {
  const result = engine.check(TRIPLE);

  test('three findings for the pairs (0,1), (0,2), (1,2), all consistent at likely', () => {
    expect(result.data.map((each) => [each.a, each.b])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    for (const each of result.data) {
      expect(each.outcome).toBe('consistent');
      expect(each.certainty).toBe('likely');
      expect(each.explanation.length).toBeGreaterThan(0);
    }
  });

  test('the EORI and the VAT number are consistent from the VAT number to the EORI through the RSIN', () => {
    const finding = result.data[0];
    expect(finding?.direction).toBe('b-to-a');
    expect(finding?.from_scheme).toBe('vat-nl');
    expect(finding?.to_scheme).toBe('eori');
    expect(finding?.rules).toEqual(['rsin-from-vat-nl', 'eori-nl-from-rsin']);
  });

  test('the EORI and the bare RSIN are consistent from the EORI to the RSIN, which joins only as rsin', () => {
    const finding = result.data[1];
    expect(finding?.direction).toBe('a-to-b');
    expect(finding?.from_scheme).toBe('eori');
    expect(finding?.to_scheme).toBe('rsin');
    expect(finding?.rules).toEqual(['rsin-from-eori-nl']);
    expect(finding?.tried.b).toEqual(['rsin']);
  });

  test('the VAT number and the bare RSIN are consistent from the VAT number to the RSIN', () => {
    const finding = result.data[2];
    expect(finding?.direction).toBe('a-to-b');
    expect(finding?.from_scheme).toBe('vat-nl');
    expect(finding?.to_scheme).toBe('rsin');
    expect(finding?.rules).toEqual(['rsin-from-vat-nl']);
  });

  test('one possible-personal-identifier warning refers to the bare value by position', () => {
    const warnings = result.warnings.filter((each) => each.code === 'possible-personal-identifier');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.ref).toBe('values/2');
  });

  test('one conclusion per consistent finding, and the result never holds an input value', () => {
    expect(result.conclusions.map((each) => each.key)).toEqual([
      'check.consistent',
      'check.consistent',
      'check.consistent',
    ]);
    expect(result.conclusions[0]?.params).toEqual({
      a: '0',
      b: '1',
      from: 'vat-nl',
      to: 'eori',
      rules: 'rsin-from-vat-nl,eori-nl-from-rsin',
    });
    const text = JSON.stringify(result);
    for (const value of TRIPLE) expect(text.includes(value)).toBe(false);
  });
});

/** The first and second valid example of a scheme, read from the model, never typed here. */
function example(schemeId: string, index: number): string {
  const value = model.schemes[schemeId]?.format?.examples_valid?.[index];
  if (value === undefined) throw new Error(`the model has no example ${index} for ${schemeId}`);
  return value;
}

const RANK: Record<string, number> = { certain: 3, likely: 2, possible: 1 };

function weakestOf(steps: readonly { certainty: string }[]): string {
  return steps.reduce(
    (low, step) => ((RANK[step.certainty] ?? 0) < (RANK[low] ?? 0) ? step.certainty : low),
    'certain',
  );
}

describe('check: outcomes on the real model', () => {
  const kvk = example('kvk-number', 1);
  const oinOfOther = `00000003${example('kvk-number', 0)}0000`;

  test('a KvK number against an OIN of another KvK number is inconsistent, a-to-b, through the OIN rule', () => {
    const result = engine.check([kvk, oinOfOther]);
    expect(result.data).toHaveLength(1);
    const finding = result.data[0];
    expect(finding?.outcome).toBe('inconsistent');
    expect(finding?.direction).toBe('a-to-b');
    expect(finding?.from_scheme).toBe('kvk-number');
    expect(finding?.to_scheme).toBe('oin');
    expect(finding?.rules).toEqual(['oin-from-kvk-number']);
    expect(finding?.tried).toEqual({ a: ['kvk-number'], b: ['oin'] });
    expect(finding?.explanation.length).toBeGreaterThan(0);
    expect(finding?.certainty).not.toBeNull();
    expect(result.conclusions.map((each) => each.key)).toEqual(['check.inconsistent']);
    expect(result.conclusions[0]?.statement.startsWith('Values 1 and 2 are inconsistent:')).toBe(
      true,
    );
  });

  test('an EORI against a VAT number of another RSIN is inconsistent, b-to-a, through the RSIN', () => {
    const result = engine.check(['NL001469630', `NL${syntheticValid()}B01`]);
    const finding = result.data[0];
    expect(finding?.outcome).toBe('inconsistent');
    expect(finding?.direction).toBe('b-to-a');
    expect(finding?.from_scheme).toBe('vat-nl');
    expect(finding?.to_scheme).toBe('eori');
    expect(finding?.rules).toEqual(['rsin-from-vat-nl', 'eori-nl-from-rsin']);
  });

  test('a relation without a rule is no-rule: an EUID and a KvK number', () => {
    const result = engine.check([example('euid', 0), example('kvk-number', 0)]);
    expect(result.data).toHaveLength(1);
    const finding = result.data[0];
    expect(finding?.outcome).toBe('no-rule');
    expect(finding?.direction).toBeNull();
    expect(finding?.from_scheme).toBeNull();
    expect(finding?.to_scheme).toBeNull();
    expect(finding?.certainty).toBeNull();
    expect(finding?.rules).toEqual([]);
    expect(finding?.explanation).toEqual([]);
    expect(finding?.tried.a).toEqual(['euid']);
    expect(finding?.tried.b).toEqual(['kvk-number']);
    expect(result.conclusions).toEqual([]);
  });

  test('every consistent or inconsistent conclusion has the certainty of its weakest step', () => {
    const results = [
      engine.check(TRIPLE),
      engine.check([kvk, oinOfOther]),
      engine.check([example('euid', 0), example('kvk-number', 0)]),
    ];
    let seen = 0;
    for (const result of results) {
      for (const each of result.conclusions) {
        seen += 1;
        expect(each.certainty).toBe(weakestOf(each.explanation));
      }
      for (const finding of result.data) {
        if (finding.outcome === 'no-rule') continue;
        expect(finding.certainty).toBe(weakestOf(finding.explanation));
      }
    }
    expect(seen).toBe(4);
  });

  test('every finding has exactly the ConsistencyFinding keys', () => {
    const keys = [
      'a',
      'b',
      'certainty',
      'direction',
      'explanation',
      'from_scheme',
      'outcome',
      'rules',
      'to_scheme',
      'tried',
    ];
    const results = [
      engine.check(TRIPLE),
      engine.check([kvk, oinOfOther]),
      engine.check([example('euid', 0), example('kvk-number', 0)]),
    ];
    let seen = 0;
    for (const result of results) {
      for (const finding of result.data) {
        seen += 1;
        expect(Object.keys(finding).sort()).toEqual(keys);
        expect(Object.keys(finding.tried).sort()).toEqual(['a', 'b']);
      }
    }
    expect(seen).toBe(5);
  });
});

/** A fixture scheme that accepts a letter followed by digits. */
function lettered(id: string, letter: string, rules: Rule[] = []): Scheme {
  return fixtureScheme(id, {
    format: { patterns: [{ regex: `^${letter}[0-9]+$`, certainty: 'certain', source: 'fx-law' }] },
    rules,
  });
}

/** A rule that swaps the leading letter of the value for another. */
function swap(
  id: string,
  input: string,
  output: string,
  letter: string,
  more: Partial<Rule> = {},
): Rule {
  return {
    id,
    input,
    output,
    transform: [{ strip_prefix: 1 }, { add_prefix: letter }],
    certainty: 'certain',
    source: 'fx-law',
    ...more,
  };
}

describe('check on fixtures: direction and scheme choice', () => {
  test('a pair connected both ways at the same length chooses a-to-b, in either order', () => {
    const both = createEngine(
      fixtureModel({
        schemes: [
          lettered('p', 'P', [swap('p-q', 'p', 'q', 'Q')]),
          lettered('q', 'Q', [swap('q-p', 'q', 'p', 'P')]),
        ],
      }),
    );
    const forward = both.check(['P1', 'Q1']).data[0];
    expect([forward?.outcome, forward?.direction, forward?.rules]).toEqual([
      'consistent',
      'a-to-b',
      ['p-q'],
    ]);
    const backward = both.check(['Q1', 'P1']).data[0];
    expect([backward?.outcome, backward?.direction, backward?.rules]).toEqual([
      'consistent',
      'a-to-b',
      ['q-p'],
    ]);
  });

  test('a shorter b-to-a chain wins over a longer a-to-b chain', () => {
    const uneven = createEngine(
      fixtureModel({
        schemes: [
          lettered('x', 'X', [swap('x-y', 'x', 'y', 'Y')]),
          lettered('y', 'Y', [swap('y-z', 'y', 'z', 'Z')]),
          lettered('z', 'Z', [swap('z-x', 'z', 'x', 'X')]),
        ],
      }),
    );
    const finding = uneven.check(['X1', 'Z1']).data[0];
    expect(finding?.outcome).toBe('consistent');
    expect(finding?.direction).toBe('b-to-a');
    expect(finding?.from_scheme).toBe('z');
    expect(finding?.to_scheme).toBe('x');
    expect(finding?.rules).toEqual(['z-x']);
  });

  test('a consistent chain from one tried scheme wins over an inconsistent one from another', () => {
    const mixed = createEngine(
      fixtureModel({
        schemes: [
          lettered('m1', 'M', [swap('m1-t', 'm1', 't', 'T')]),
          lettered('m2', 'M', [
            swap('m2-t', 'm2', 't', 'T', {
              transform: [{ strip_prefix: 1 }, { add_prefix: 'T' }, { add_suffix: '9' }],
            }),
          ]),
          lettered('t', 'T'),
        ],
      }),
    );
    const finding = mixed.check(['M1', 'T1']).data[0];
    expect(finding?.tried).toEqual({ a: ['m1', 'm2'], b: ['t'] });
    expect(finding?.outcome).toBe('consistent');
    expect(finding?.from_scheme).toBe('m1');
    expect(finding?.rules).toEqual(['m1-t']);
  });
});

function codesOf(result: { warnings: { code: string }[] }): string[] {
  return result.warnings.map((warning) => warning.code);
}

describe('check: the gate joins a bare value only through a deriving partner', () => {
  test('a possible BSN beside an unrelated EORI stays out: no-rule, no tried scheme, one warning', () => {
    const bare = syntheticValid();
    const result = engine.check(['NL001469630', bare]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.outcome).toBe('no-rule');
    expect(result.data[0]?.tried.b).toEqual([]);
    expect(result.warnings.filter((each) => each.code === 'possible-personal-identifier')).toEqual([
      expect.objectContaining({ ref: 'values/1' }),
    ]);
    expect(JSON.stringify(result).includes(bare)).toBe(false);
  });

  test('a possible BSN beside the EORI that derives it joins, as the RSIN only', () => {
    const result = engine.check(['NL001469630', '001469630']);
    expect(result.data[0]?.outcome).toBe('consistent');
    expect(result.data[0]?.tried.b).toEqual(['rsin']);
  });
});

describe('check: input handling', () => {
  test('an exact duplicate is compared once, with a warning at its own position', () => {
    const result = engine.check(['NL001469630', 'NL001469630']);
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'duplicate-value',
        message: 'Value 2 repeats value 1; it is compared once.',
        ref: 'values/1',
      },
    ]);
  });

  test('a trimmed duplicate counts and positions stay the original input positions', () => {
    const result = engine.check(['NL001469630', 'x', ' NL001469630 ']);
    expect(result.data.map((each) => [each.a, each.b])).toEqual([[0, 1]]);
    expect(
      result.warnings.filter((each) => each.code === 'duplicate-value').map((each) => each.ref),
    ).toEqual(['values/2']);
  });

  test('one value or no value gives no finding and no warning', () => {
    for (const values of [['NL001469630'], []]) {
      const result = engine.check(values);
      expect(result).toEqual({ data: [], conclusions: [], warnings: [] });
    }
  });

  test('something that is not an array gives invalid-input and no finding', () => {
    const result = engine.check('NL001469630' as never);
    expect(result.data).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(codesOf(result)).toEqual(['invalid-input']);
    expect(JSON.stringify(result).includes('NL001469630')).toBe(false);
  });

  test('an entry that is not a string gives invalid-input at its position and is left out', () => {
    const result = engine.check(['NL001469630', 7 as never, 'NL001469630B01']);
    expect(result.warnings.filter((each) => each.code === 'invalid-input')).toEqual([
      expect.objectContaining({ ref: 'values/1' }),
    ]);
    expect(result.data.map((each) => [each.a, each.b])).toEqual([[0, 2]]);
  });

  test('an empty or over-long entry is left out with its own warning', () => {
    const result = engine.check(['NL001469630', '   ', 'N'.repeat(300), 'NL001469630B01']);
    expect(result.warnings.map((each) => [each.code, each.ref])).toEqual([
      ['empty-input', 'values/1'],
      ['input-too-long', 'values/2'],
    ]);
    expect(result.data.map((each) => [each.a, each.b])).toEqual([[0, 3]]);
  });

  test('51 values give empty data and too-many-values; 50 are compared', () => {
    const many = Array.from({ length: 51 }, (_, i) => `NL${i}`);
    const refused = engine.check(many);
    expect(refused.data).toEqual([]);
    expect(refused.conclusions).toEqual([]);
    expect(refused.warnings).toEqual([
      { code: 'too-many-values', message: 'check compares at most 50 values.', ref: 'values' },
    ]);
    const allowed = engine.check(many.slice(0, 50));
    expect(allowed.data).toHaveLength((50 * 49) / 2);
    expect(codesOf(allowed)).not.toContain('too-many-values');
  });
});

describe('check: context', () => {
  test('entity_form legal-person keeps the triple consistent and replaces every assumption', () => {
    const result = engine.check(TRIPLE, { entity_form: 'legal-person' });
    expect(result.data.map((each) => each.outcome)).toEqual([
      'consistent',
      'consistent',
      'consistent',
    ]);
    for (const finding of result.data) {
      const refs = finding.explanation.map((step) => step.ref);
      expect(refs).toContain('ctx/entity_form');
      expect(
        finding.explanation.some(
          (step) => step.kind === 'assumption' && step.condition?.entity_form !== undefined,
        ),
      ).toBe(false);
    }
  });

  test('entity_form sole-proprietorship makes every pair no-rule', () => {
    const result = engine.check(TRIPLE, { entity_form: 'sole-proprietorship' });
    expect(result.data.map((each) => each.outcome)).toEqual(['no-rule', 'no-rule', 'no-rule']);
    expect(result.data[0]?.tried.b).toEqual(['eori', 'vat']);
    expect(result.data[2]?.tried.b).toEqual([]);
    expect(result.conclusions).toEqual([]);
  });

  test('entity_form fiscal-unit conditions out the vat-nl checksum: one warning, no value in it (D-01, DEC-072)', () => {
    const result = engine.check(TRIPLE, { entity_form: 'fiscal-unit' });
    expect(result.data.map((each) => each.outcome)).toEqual(['no-rule', 'no-rule', 'no-rule']);
    expect(result.data[0]?.tried.b).toEqual(['eori', 'vat', 'vat-nl']);
    const applicability = result.warnings.filter((each) => each.code === 'no-applicable-checksum');
    expect(applicability).toHaveLength(1);
    expect(applicability[0]?.ref).toBe('vat-nl');
    for (const warning of result.warnings) {
      for (const value of TRIPLE) expect(warning.message.includes(value)).toBe(false);
    }
  });

  test('an unknown context key is ignored with a warning that names no input', () => {
    const result = engine.check(TRIPLE, { colour: 'red' } as never);
    expect(codesOf(result)).toContain('unknown-context-key');
    expect(result.data.map((each) => each.outcome)).toEqual([
      'consistent',
      'consistent',
      'consistent',
    ]);
  });
});

describe('check: privacy and determinism', () => {
  const bare = syntheticValid();
  const cases: [string, string[], Record<string, string> | undefined][] = [
    ['the triple', TRIPLE, undefined],
    ['the triple with context', TRIPLE, { entity_form: 'legal-person' }],
    ['a possible BSN with no partner', ['NL001469630', bare], undefined],
    ['a duplicate', ['NL001469630', ' NL001469630', 'NL001469630B01'], undefined],
    ['a VAT number of another RSIN', ['NL001469630', `NL${bare}B01`], undefined],
  ];

  for (const [name, values, ctx] of cases) {
    test(`${name}: no input value is repeated and a second call gives the same result`, () => {
      const result = engine.check(values, ctx);
      const text = JSON.stringify(result);
      for (const value of values) expect(text.includes(value.trim())).toBe(false);
      for (const warning of result.warnings) expect(/[0-9]{4,}/.test(warning.message)).toBe(false);
      expect(engine.check(values, ctx)).toEqual(result);
    });
  }
});
