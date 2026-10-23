import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { checkValue } from './format.ts';
import { specificity } from './specificity.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);
// The one public, allow-listed value of the acceptance case (SPEC §10).
const EORI_VALUE = 'NL001469630';

describe('recognise tracer: the EORI acceptance value on the real model', () => {
  const result = engine.recognise(EORI_VALUE);

  test('the candidate list is eori and vat', () => {
    expect(result.data.map((candidate) => candidate.scheme)).toEqual(['eori', 'vat']);
    expect(result.warnings).toEqual([]);
  });

  test('eori is accepted and certain through its first pattern, with no checksum', () => {
    const eori = result.data[0];
    expect(eori).toBeDefined();
    expect(eori?.accepted).toBe(true);
    expect(eori?.certainty).toBe('certain');
    expect(eori?.format).toEqual({ patterns: [true, true, false], pattern: 0 });
    expect(eori?.checksum).toEqual({ outcomes: [], result: 'none', entry: null });
    expect(eori?.explanation).toHaveLength(1);
    expect(eori?.explanation[0]).toMatchObject({
      kind: 'pattern',
      ref: 'eori/patterns/0',
      certainty: 'certain',
    });
    expect(eori?.explanation[0]?.source?.id).toBe('commission-eori');
  });

  test('vat is accepted at likely', () => {
    expect(result.data[1]?.accepted).toBe(true);
    expect(result.data[1]?.certainty).toBe('likely');
  });

  test('one conclusion per candidate, graded by the weakest step, without the input', () => {
    expect(result.conclusions.map((c) => c.key)).toEqual([
      'recognise.candidate',
      'recognise.candidate',
    ]);
    expect(result.conclusions.map((c) => c.params.scheme)).toEqual(['eori', 'vat']);
    expect(result.conclusions.map((c) => c.certainty)).toEqual(['certain', 'likely']);
    for (const each of result.conclusions) {
      expect(each.statement).not.toContain(EORI_VALUE);
      expect(each.explanation.length).toBeGreaterThan(0);
    }
  });
});

// Values are built at runtime from the one public value (no other nine-digit literal is committed).
const EORI_B01 = `${EORI_VALUE}B01`;

function schemesOf(data: readonly { scheme: string }[]): string[] {
  return data.map((candidate) => candidate.scheme);
}

describe('recognise candidate rules on the real model (DEC-063, Pitfalls 3 and 12)', () => {
  test('the deciding pattern keeps assumptions out of the eori explanation', () => {
    const eori = engine.recognise(EORI_VALUE).data[0];
    expect(eori?.format.patterns[1]).toBe(true);
    expect(eori?.explanation.some((step) => step.kind === 'assumption')).toBe(false);
  });

  test('the value with a B suffix gives eori, vat and vat-nl, all accepted', () => {
    const { data } = engine.recognise(EORI_B01);
    expect([...schemesOf(data)].sort()).toEqual(['eori', 'vat', 'vat-nl']);
    expect(data.every((candidate) => candidate.accepted)).toBe(true);
  });

  test('vat-nl reports its pass and fail checksum entries apart, with an assumption at likely', () => {
    const vatNl = engine.recognise(EORI_B01).data.find((c) => c.scheme === 'vat-nl');
    expect(vatNl?.checksum).toEqual({ outcomes: ['pass', 'fail'], result: 'pass', entry: 0 });
    const refs = vatNl?.explanation.map((step) => step.ref);
    expect(refs).toContain('vat-nl/patterns/0');
    expect(refs).toContain('vat-nl/checksum/0');
    expect(vatNl?.explanation.find((step) => step.kind === 'assumption')?.condition).toEqual({
      entity_form: 'legal-person',
    });
    expect(vatNl?.certainty).toBe('likely');
  });

  test('the D-U-N-S example is accepted by duns only; the elfproef schemes follow as rejected', () => {
    const example = model.schemes.duns?.format?.examples_valid?.[0] ?? '';
    const { data, conclusions } = engine.recognise(example);
    expect(schemesOf(data)).toEqual(['duns', 'bsn', 'fi-number', 'rsin']);
    expect(data.filter((candidate) => candidate.accepted).map((c) => c.scheme)).toEqual(['duns']);
    for (const rejected of data.slice(1)) {
      expect(rejected.accepted).toBe(false);
      expect(rejected.checksum.result).toBe('fail');
      expect(rejected.certainty).toBe('possible');
    }
    expect(conclusions.map((c) => c.key)).toEqual([
      'recognise.candidate',
      'recognise.checksum-failed',
      'recognise.checksum-failed',
      'recognise.checksum-failed',
    ]);
    expect(conclusions.slice(1).map((c) => c.certainty)).toEqual([
      'possible',
      'possible',
      'possible',
    ]);
    for (const each of conclusions) expect(each.statement).not.toContain(example);
  });

  test('format and checksum flags equal the kernel for every example of the model', () => {
    let compared = 0;
    for (const id of Object.keys(model.schemes)) {
      const format = model.schemes[id]?.format;
      if (format === undefined) continue;
      const values = [...(format.examples_valid ?? []), ...(format.examples_invalid ?? [])];
      for (const value of values) {
        const kernel = checkValue(format, value);
        compared += 1;
        const candidate = engine.recognise(value).data.find((c) => c.scheme === id);
        if (!kernel.patterns.some(Boolean)) {
          expect(candidate, `${id} example without a pattern match`).toBeUndefined();
          continue;
        }
        expect(candidate?.format.patterns, `${id} pattern flags`).toEqual(kernel.patterns);
        expect(candidate?.checksum.outcomes, `${id} checksum outcomes`).toEqual(kernel.checksums);
        expect(candidate?.accepted, `${id} accepted`).toBe(kernel.accepted);
      }
    }
    expect(compared).toBeGreaterThan(20);
  });

  test('roo has no pattern and is never a candidate', () => {
    const everyValue = Object.values(model.schemes).flatMap((scheme) => [
      ...(scheme.format?.examples_valid ?? []),
      ...(scheme.format?.examples_invalid ?? []),
      EORI_VALUE,
      EORI_B01,
    ]);
    for (const value of everyValue) {
      expect(schemesOf(engine.recognise(value).data)).not.toContain('roo');
    }
  });
});

describe('recognise input guards (T-05-05, T-05-07)', () => {
  test('a non-string value gives invalid-input', () => {
    const result = engine.recognise(123 as never);
    expect(result.data).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['invalid-input']);
  });

  test.for([[''], ['   ']] as const)('an empty value %j gives empty-input', ([value]) => {
    const result = engine.recognise(value);
    expect(result.data).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['empty-input']);
  });

  test('a value over 256 characters gives input-too-long and the message omits it', () => {
    const value = 'A'.repeat(257);
    const result = engine.recognise(value);
    expect(result.data).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['input-too-long']);
    expect(result.warnings[0]?.message).not.toContain(value);
  });

  test('a value of exactly 256 characters is read', () => {
    expect(engine.recognise('A'.repeat(256)).warnings).toEqual([]);
  });

  test('only surrounding whitespace is trimmed', () => {
    expect(engine.recognise(`  ${EORI_VALUE} `)).toEqual(engine.recognise(EORI_VALUE));
  });

  test('no case is folded: the lower-case form gives no candidate', () => {
    expect(engine.recognise(EORI_VALUE.toLowerCase()).data).toEqual([]);
  });
});

describe('recognise conditions on a synthetic model (D-12, DEC-063)', () => {
  const claim = { certainty: 'certain', source: 'fx-law' } as const;
  const capture = {
    capture: { regex: '^([A-Z]{2})', group: 1 },
    map: 'country-prefix',
    ...claim,
  };

  test('a conditional pattern gives likely with one assumption', () => {
    const scheme = fixtureScheme('cond', {
      format: {
        patterns: [{ regex: '^AB[0-9]{4}$', condition: { entity_form: 'legal-person' }, ...claim }],
      },
    });
    const candidate = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AB1234').data[0];
    expect(candidate?.certainty).toBe('likely');
    expect(candidate?.explanation.filter((step) => step.kind === 'assumption')).toHaveLength(1);
  });

  test('a pattern whose condition is false is removed and the scheme is no candidate', () => {
    const scheme = fixtureScheme('neg', {
      context_from: { issuing_country: capture },
      format: {
        patterns: [
          { regex: '^[A-Z]{2}[0-9]{4}$', condition: { issuing_country: '!AA' }, ...claim },
        ],
      },
    });
    const engineNeg = createEngine(fixtureModel({ schemes: [scheme] }));
    expect(engineNeg.recognise('AA1234').data).toEqual([]);
    const other = engineNeg.recognise('BB1234').data[0];
    expect(other?.certainty).toBe('certain');
    expect(other?.explanation.map((step) => step.ref)).toEqual([
      'neg/patterns/0',
      'neg/context_from/issuing_country',
      'vocab/country-prefix/BB',
    ]);
  });

  test('a checksum list whose every entry has a false condition does not apply (D-01, DEC-072)', () => {
    const scheme = fixtureScheme('allout', {
      context_from: { issuing_country: capture },
      format: {
        patterns: [{ regex: '^[A-Z]{2}[0-9]{4}$', ...claim }],
        checksum: [{ algorithm: 'elfproef', condition: { issuing_country: 'BB' }, ...claim }],
      },
    });
    const result = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AA1234');
    const candidate = result.data[0];
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.checksum).toEqual({ outcomes: ['fail'], result: 'none', entry: null });
    expect(candidate?.certainty).toBe('certain');
    expect(candidate?.explanation.some((step) => step.kind === 'checksum')).toBe(false);
    expect(result.conclusions[0]?.key).toBe('recognise.candidate');
    expect(result.warnings).toEqual([
      {
        code: 'no-applicable-checksum',
        message:
          'no checksum entry of allout applies in the given context, so the value is accepted on its format alone',
        ref: 'allout',
      },
    ]);
  });

  test('a mixed list with one entry conditioned out and one passing entry passes without a warning', () => {
    const scheme = fixtureScheme('mixpass', {
      context_from: { issuing_country: capture },
      format: {
        patterns: [{ regex: '^[A-Z]{2}[0-9]{4}$', ...claim }],
        checksum: [
          { algorithm: 'elfproef', condition: { issuing_country: 'BB' }, ...claim },
          { algorithm: 'none', ...claim },
        ],
      },
    });
    const result = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AA1234');
    const candidate = result.data[0];
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.checksum).toEqual({ outcomes: ['fail', 'pass'], result: 'pass', entry: 1 });
    expect(result.warnings).toEqual([]);
  });

  test('a mixed list with one entry conditioned out and one failing entry fails without a warning', () => {
    const scheme = fixtureScheme('mixfail', {
      context_from: { issuing_country: capture },
      format: {
        patterns: [{ regex: '^[A-Z]{2}[0-9]{4}$', ...claim }],
        checksum: [
          { algorithm: 'none', condition: { issuing_country: 'BB' }, ...claim },
          { algorithm: 'elfproef', ...claim },
        ],
      },
    });
    const result = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AA1234');
    const candidate = result.data[0];
    expect(candidate?.accepted).toBe(false);
    expect(candidate?.checksum.result).toBe('fail');
    expect(candidate?.checksum.entry).toBeNull();
    expect(candidate?.certainty).toBe('possible');
    expect(result.conclusions[0]?.key).toBe('recognise.checksum-failed');
    expect(result.warnings).toEqual([]);
  });

  test('a scheme that declares no checksum keeps result none and gets no warning', () => {
    const scheme = fixtureScheme('plain', {
      format: { patterns: [{ regex: '^[A-Z]{2}[0-9]{4}$', ...claim }] },
    });
    const result = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AA1234');
    expect(result.data[0]?.checksum).toEqual({ outcomes: [], result: 'none', entry: null });
    expect(result.data[0]?.accepted).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('the deciding pattern prefers the higher certainty, then no condition, then the lower index', () => {
    const scheme = fixtureScheme('pick', {
      format: {
        patterns: [
          { regex: '^[A-Z]{2}[0-9]{4}$', certainty: 'likely', source: 'fx-law' },
          { regex: '^AB[0-9]{4}$', ...claim, condition: { entity_form: 'legal-person' } },
          { regex: '^AB[0-9]{4}$', ...claim },
          { regex: '^AB[0-9]{4}$', ...claim },
        ],
      },
    });
    const candidate = createEngine(fixtureModel({ schemes: [scheme] })).recognise('AB1234').data[0];
    expect(candidate?.format.pattern).toBe(2);
    expect(candidate?.certainty).toBe('certain');
  });
});

describe('specificity of a regex source (DEC-064)', () => {
  test.for([
    ['^NL[0-9]{9}B[0-9]{2}$', 3],
    ['^[A-Z]{2}[A-Z0-9]{1,15}$', 0],
    ['^NL\\.KVK\\.[0-9]{8}$', 7],
    ['^iso6523-actorid-upis::[0-9]{4}:[A-Za-z0-9]+$', 23],
    ['^NL[0-9]{9}$', 2],
    ['^(?:ab|cd)$', 4],
    ['^a\\d+$', 1],
    ['^a{2,}b?.$', 2],
    ['^[\\]a]x$', 1],
  ] as const)('specificity of %s is %i', ([source, expected]) => {
    expect(specificity(source)).toBe(expected);
  });

  test('a brace that is not a quantifier counts one, and a trailing backslash counts zero', () => {
    expect(specificity('a{b')).toBe(3);
    expect(specificity('a\\')).toBe(1);
  });
});

describe('recognise ordering, hint grade and rank groups (D-05, D-06, DEC-063)', () => {
  // The one public allow-listed value; the ambiguity set is the four nine-digit schemes.
  const AMBIGUOUS = '001469630';

  test('without a hint the four nine-digit candidates share one rank group', () => {
    const { data } = engine.recognise(AMBIGUOUS);
    expect(schemesOf(data)).toEqual(['bsn', 'duns', 'fi-number', 'rsin']);
    expect(data.map((c) => c.rank_group)).toEqual([1, 1, 1, 1]);
    expect(data.every((c) => c.accepted && c.specificity === 0 && c.hint_grade === 0)).toBe(true);
  });

  test('hint country NL ranks the Dutch schemes first and duns apart', () => {
    const { data, warnings } = engine.recognise(AMBIGUOUS, { country: 'NL' });
    expect(schemesOf(data)).toEqual(['bsn', 'fi-number', 'rsin', 'duns']);
    expect(data.map((c) => c.hint_grade)).toEqual([2, 2, 2, 0]);
    expect(data.map((c) => c.rank_group)).toEqual([1, 1, 1, 2]);
    // the gate warning of plan 05-04 is the only warning: the hint itself is understood
    expect(warnings.map((w) => w.code)).toEqual(['possible-personal-identifier']);
  });

  test('the value prefix NL ranks eori, vat-nl and vat in three rank groups', () => {
    const { data } = engine.recognise(EORI_B01);
    expect(schemesOf(data)).toEqual(['eori', 'vat-nl', 'vat']);
    expect(data.map((c) => c.certainty)).toEqual(['certain', 'likely', 'likely']);
    expect(data.map((c) => c.hint_grade)).toEqual([1, 2, 1]);
    expect(data.map((c) => c.rank_group)).toEqual([1, 2, 3]);
  });

  test('every candidate carries the specificity of its deciding pattern', () => {
    const vatNl = engine.recognise(EORI_B01).data.find((c) => c.scheme === 'vat-nl');
    expect(vatNl?.specificity).toBe(3);
  });

  test('the hint EL resolves to GR through the country-prefix vocabulary and gives no warning', () => {
    const { warnings } = engine.recognise(EORI_B01, { country: 'EL' });
    expect(warnings).toEqual([]);
  });

  test.for([[{ country: 'ZZ' }], [{ country: 7 }], ['x'], [null], [[]]] as const)(
    'the hint %j gives unknown-country-hint and the unhinted order',
    ([hint]) => {
      const unhinted = engine.recognise(AMBIGUOUS);
      const result = engine.recognise(AMBIGUOUS, hint as never);
      expect(result.warnings.map((w) => w.code)).toEqual([
        'unknown-country-hint',
        'possible-personal-identifier',
      ]);
      expect(result.warnings[0]?.message).not.toContain('ZZ');
      expect(result.data).toEqual(unhinted.data);
    },
  );

  test('a hint never removes a candidate', () => {
    const plain = schemesOf(engine.recognise(AMBIGUOUS).data).sort();
    const hinted = schemesOf(engine.recognise(AMBIGUOUS, { country: 'BE' }).data).sort();
    expect(hinted).toEqual(plain);
  });

  test('rejected candidates stay after every accepted one whatever the hint', () => {
    const example = model.schemes.duns?.format?.examples_valid?.[0] ?? '';
    for (const hint of [undefined, { country: 'NL' }, { country: 'GLOBAL' }]) {
      const { data } = engine.recognise(example, hint);
      expect(data.map((c) => c.accepted)).toEqual([true, false, false, false]);
      expect(data[0]?.scheme).toBe('duns');
    }
  });

  test('the comparator is total: every model example gives identical data twice', () => {
    const everyValue = Object.values(model.schemes).flatMap((scheme) => [
      ...(scheme.format?.examples_valid ?? []),
      ...(scheme.format?.examples_invalid ?? []),
    ]);
    expect(everyValue.length).toBeGreaterThan(20);
    for (const value of everyValue) {
      expect(engine.recognise(value)).toEqual(engine.recognise(value));
    }
  });

  test('rank groups are consecutive from 1', () => {
    for (const value of [AMBIGUOUS, EORI_B01, EORI_VALUE]) {
      const groups = engine.recognise(value).data.map((c) => c.rank_group);
      expect(groups[0]).toBe(1);
      for (let i = 1; i < groups.length; i++) {
        const step = (groups[i] ?? 0) - (groups[i - 1] ?? 0);
        expect(step === 0 || step === 1).toBe(true);
      }
    }
  });
});
