import { describe, expect, test } from 'vitest';
import { elfproef } from './checksum/elfproef.ts';
import { iso7064Mod9710 } from './checksum/iso7064-mod97-10.ts';
import { checkValue, compileFormat, type FormatSpec } from './format.ts';

const CORE_RE = '^NL([0-9]{9})B[0-9]{2}$';
const ELFPROEF_ENTRY = { algorithm: 'elfproef', over: [{ capture: { regex: CORE_RE, group: 1 } }] };
const MOD97_ENTRY = { algorithm: 'iso7064-mod97-10' };

const VAT_NL: FormatSpec = {
  patterns: [{ regex: '^NL[0-9]{9}B[0-9]{2}$' }],
  checksum: [ELFPROEF_ENTRY, MOD97_ENTRY],
};
const VAT_NL_REVERSED: FormatSpec = { ...VAT_NL, checksum: [MOD97_ENTRY, ELFPROEF_ENTRY] };

const ELFPROEF_ONLY_VALID = 'NL001469630B01';
const MOD97_ONLY_VALID = 'NL002455799B11';
const BOTH_FAIL_A = 'NL001469631B01';
const BOTH_FAIL_B = 'NL002455799B12';
const NO_PATTERN = 'NL00146963';

const VALUES = [ELFPROEF_ONLY_VALID, MOD97_ONLY_VALID, BOTH_FAIL_A, BOTH_FAIL_B, NO_PATTERN];

function compiled(spec: FormatSpec) {
  const result = compileFormat(spec);
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.errors)}`);
  return result;
}

describe('the vat-nl vectors, re-derived with the kernel functions', () => {
  const core = (v: string) => v.slice(2, 11);

  test('elfproef-only value: core passes elfproef, whole value fails mod 97', () => {
    expect(elfproef(core(ELFPROEF_ONLY_VALID))).toBe(true);
    expect(iso7064Mod9710(ELFPROEF_ONLY_VALID)).toBe(false);
  });
  test('mod-97-only value: whole value passes mod 97, core fails elfproef', () => {
    expect(iso7064Mod9710(MOD97_ONLY_VALID)).toBe(true);
    expect(elfproef(core(MOD97_ONLY_VALID))).toBe(false);
  });
  test.for([BOTH_FAIL_A, BOTH_FAIL_B])('%s fails both regimes', (value) => {
    expect(elfproef(core(value))).toBe(false);
    expect(iso7064Mod9710(value)).toBe(false);
  });
});

describe('any-of acceptance (DEC-004, D-21, D-23, D-24)', () => {
  const format = compiled(VAT_NL);

  test('core elfproef pass, mod 97 fail: accepted', () => {
    expect(format.check(ELFPROEF_ONLY_VALID)).toEqual({
      patterns: [true],
      checksums: ['pass', 'fail'],
      accepted: true,
    });
  });
  test('mod 97 pass, core elfproef fail: accepted', () => {
    expect(format.check(MOD97_ONLY_VALID)).toEqual({
      patterns: [true],
      checksums: ['fail', 'pass'],
      accepted: true,
    });
  });
  test.for([BOTH_FAIL_A, BOTH_FAIL_B])(
    '%s: pattern matches, both entries fail, not accepted',
    (value) => {
      expect(format.check(value)).toEqual({
        patterns: [true],
        checksums: ['fail', 'fail'],
        accepted: false,
      });
    },
  );
  test('no pattern matches: elfproef is not-applicable, not accepted', () => {
    const result = format.check(NO_PATTERN);
    expect(result.patterns).toEqual([false]);
    expect(result.checksums[0]).toBe('not-applicable');
    expect(result.accepted).toBe(false);
  });
});

describe('ordering edge', () => {
  const forward = compiled(VAT_NL);
  const reversed = compiled(VAT_NL_REVERSED);

  test.for(VALUES)('reversing the entries keeps accepted and reverses checksums: %s', (value) => {
    const a = forward.check(value);
    const b = reversed.check(value);
    expect(b.accepted).toBe(a.accepted);
    expect(b.checksums).toEqual([...a.checksums].reverse());
  });
});

describe('empty edge', () => {
  const patterns = [{ regex: '^NL[0-9]{9}B[0-9]{2}$' }];

  test.for([
    ['checksum absent', { patterns }],
    ['checksum empty', { patterns, checksum: [] }],
    ['a single none entry', { patterns, checksum: [{ algorithm: 'none' }] }],
  ] as const)('%s: accepted equals pattern match', ([, spec]) => {
    const format = compiled(spec as FormatSpec);
    expect(format.check(BOTH_FAIL_A).accepted).toBe(true);
    expect(format.check(NO_PATTERN).accepted).toBe(false);
  });

  test('no patterns: nothing is accepted', () => {
    const format = compiled({ patterns: [], checksum: [{ algorithm: 'none' }] });
    expect(format.check(ELFPROEF_ONLY_VALID).accepted).toBe(false);
    expect(compiled({}).check(ELFPROEF_ONLY_VALID).accepted).toBe(false);
  });
});

describe('whole-value matching (WR-05, DEC-039): a pattern matches the whole value, not a part of it', () => {
  const acceptsOnly = (regex: string, accepted: readonly string[], rejected: readonly string[]) => {
    const format = compiled({ patterns: [{ regex }] });
    for (const value of accepted) expect(format.check(value).accepted).toBe(true);
    for (const value of rejected) expect(format.check(value).accepted).toBe(false);
  };

  test.for([
    ['an unanchored class', '[0-9]{3}', ['123'], ['abc123xyz', '1234', '12', '']],
    ['an alternation is grouped before anchoring', 'a|bc', ['a', 'bc'], ['ab', 'abc', 'xbc', 'ca']],
    ['the end is the end of the input, not of a line', 'abc', ['abc'], ['abc\n', '\nabc']],
    ['an anchored pattern behaves as before', '^[0-9]{3}$', ['123'], ['1234', 'x123']],
    ['the empty regex accepts only the empty value', '', [''], ['a', ' ']],
    ['a slash in the source still matches', 'a/b', ['a/b'], ['xa/b', 'a/bx']],
  ] as const)('%s', ([, regex, accepted, rejected]) => {
    acceptsOnly(regex, accepted, rejected);
  });

  test('the pattern flags follow the whole-value reading', () => {
    const format = compiled({ patterns: [{ regex: '[0-9]{3}' }] });
    expect(format.check('123').patterns).toEqual([true]);
    expect(format.check('abc123xyz').patterns).toEqual([false]);
  });

  test('a source that is invalid on its own is not made valid by the wrapper', () => {
    for (const regex of ['(', 'a)|(b']) {
      const result = compileFormat({ patterns: [{ regex }] });
      expect(result.ok).toBe(false);
      expect(result.ok ? [] : result.errors.map((error) => error.path)).toEqual([
        '/patterns/0/regex',
      ]);
    }
  });
});

describe('compile errors carry a pointer path relative to the format', () => {
  function errorsOf(spec: FormatSpec) {
    const result = compileFormat(spec);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors;
  }

  test('unknown algorithm', () => {
    const errors = errorsOf({ checksum: [{ algorithm: 'luhn' }] });
    expect(errors[0]?.path).toBe('/checksum/0/algorithm');
    expect(errors[0]?.message).toContain('luhn');
  });
  test('invalid pattern', () => {
    expect(errorsOf({ patterns: [{ regex: '(' }] })[0]?.path).toBe('/patterns/0/regex');
  });
  test('unknown operation in over', () => {
    const errors = errorsOf({ checksum: [{ algorithm: 'elfproef', over: [{ shout: 1 }] }] });
    expect(errors[0]?.path).toBe('/checksum/0/over/0');
  });
});

describe('checkValue', () => {
  test('compiles and checks in one call', () => {
    expect(checkValue(VAT_NL, ELFPROEF_ONLY_VALID).accepted).toBe(true);
  });
  test('throws listing the compile errors when the spec is invalid', () => {
    expect(() => checkValue({ checksum: [{ algorithm: 'luhn' }] }, 'x')).toThrow(/luhn/);
  });
});
