import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';

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
