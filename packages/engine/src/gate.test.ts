import { describe, expect, test } from 'vitest';
import { elfproef } from './checksum/elfproef.ts';
import { createEngine } from './engine.ts';
import { isPossiblePersonalIdentifier, personalIdentifierWarning } from './gate.ts';
import { loadDistModel } from './testing/load-model.ts';
import { syntheticInvalid, syntheticValid } from './testing/synthetic-values.ts';

const model = loadDistModel();
const engine = createEngine(model);
// The one public, allow-listed value; every other nine-digit value is built at runtime.
const PUBLIC_VALUE = '001469630';
const CODE = 'possible-personal-identifier';

function gateWarnings(value: string) {
  return engine.recognise(value).warnings.filter((w) => w.code === CODE);
}

describe('synthetic values (test helper)', () => {
  test('the valid values pass the kernel elfproef and differ from each other', () => {
    const values = [0, 1, 2].map((index) => syntheticValid(index));
    expect(values.every((value) => elfproef(value))).toBe(true);
    expect(new Set(values).size).toBe(3);
  });

  test('the invalid values fail the kernel elfproef', () => {
    expect([0, 1, 2].every((index) => !elfproef(syntheticInvalid(index)))).toBe(true);
  });
});

describe('isPossiblePersonalIdentifier (ENG-09, D-08)', () => {
  test('is true for the public value, three synthetic values and the all-zero value', () => {
    expect(isPossiblePersonalIdentifier(PUBLIC_VALUE)).toBe(true);
    for (const index of [0, 1, 2]) {
      expect(isPossiblePersonalIdentifier(syntheticValid(index))).toBe(true);
    }
    expect(isPossiblePersonalIdentifier('0'.repeat(9))).toBe(true);
  });

  test('is false for a synthetic value with its last digit changed', () => {
    expect(isPossiblePersonalIdentifier(syntheticInvalid())).toBe(false);
  });

  test('is false for eight and ten digits', () => {
    expect(isPossiblePersonalIdentifier('1'.repeat(8))).toBe(false);
    expect(isPossiblePersonalIdentifier('1'.repeat(10))).toBe(false);
  });

  test('is false with a prefix or a letter', () => {
    expect(isPossiblePersonalIdentifier(`NL${PUBLIC_VALUE}`)).toBe(false);
    expect(isPossiblePersonalIdentifier(`${syntheticValid().slice(0, 8)}X`)).toBe(false);
  });
});

describe('the possible-personal-identifier warning on recognise', () => {
  test('the public value returns the full ambiguity set and one warning', () => {
    const result = engine.recognise(PUBLIC_VALUE);
    expect(result.data.map((c) => c.scheme)).toEqual(['bsn', 'duns', 'fi-number', 'rsin']);
    expect(new Set(result.data.map((c) => c.rank_group)).size).toBe(1);
    const warnings = gateWarnings(PUBLIC_VALUE);
    expect(warnings).toHaveLength(1);
    const message = warnings[0]?.message ?? '';
    for (const scheme of ['bsn', 'duns', 'fi-number', 'rsin']) expect(message).toContain(scheme);
    expect(/[0-9]/.test(message)).toBe(false);
    expect(message.includes(PUBLIC_VALUE)).toBe(false);
    expect(warnings[0]?.ref).toBeUndefined();
  });

  test('a synthetic valid value gives the same four candidates and one warning without its digits', () => {
    for (const index of [0, 1]) {
      const value = syntheticValid(index);
      const result = engine.recognise(value);
      expect(result.data.map((c) => c.scheme)).toEqual(['bsn', 'duns', 'fi-number', 'rsin']);
      const warnings = result.warnings.filter((w) => w.code === CODE);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message.includes(value)).toBe(false);
      expect(/[0-9]/.test(warnings[0]?.message ?? '')).toBe(false);
    }
  });

  test('the all-zero value is gated like any other', () => {
    expect(gateWarnings('0'.repeat(9))).toHaveLength(1);
  });

  test('surrounding whitespace is trimmed before the gate', () => {
    expect(gateWarnings(` ${PUBLIC_VALUE} `)).toHaveLength(1);
    expect(gateWarnings(`\t${syntheticValid()}\n`)).toHaveLength(1);
  });

  test('an ungated value has no such warning: duns example, kvk-number example, failing checksum', () => {
    const duns = model.schemes.duns?.format?.examples_valid?.[0] ?? '';
    const kvk = model.schemes['kvk-number']?.format?.examples_valid?.[0] ?? '';
    expect(duns).toHaveLength(9);
    expect(gateWarnings(duns)).toEqual([]);
    expect(gateWarnings(kvk)).toEqual([]);
    expect(gateWarnings(syntheticInvalid())).toEqual([]);
    expect(gateWarnings('1'.repeat(10))).toEqual([]);
  });

  test('a prefixed value is not gated', () => {
    expect(gateWarnings(`NL${PUBLIC_VALUE}`)).toEqual([]);
  });
});

describe('personalIdentifierWarning', () => {
  test('names the schemes and carries a ref only when given', () => {
    const plain = personalIdentifierWarning(['a', 'b']);
    expect(plain.code).toBe(CODE);
    expect(plain.message).toContain('a, b');
    expect('ref' in plain).toBe(false);
    expect(personalIdentifierWarning(['a'], 'x/y').ref).toBe('x/y');
  });
});
