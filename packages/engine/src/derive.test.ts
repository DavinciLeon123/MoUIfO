import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);

describe('derive: the SPEC section 10 tracer on the real model', () => {
  const result = engine.derive('NL001469630', 'eori');

  test('the RSIN and the OIN are derived, in that order, and nothing else', () => {
    expect(result.data.map((each) => each.scheme)).toEqual(['rsin', 'oin']);
  });

  test('the RSIN comes through rsin-from-eori-nl in one step at likely', () => {
    const rsin = result.data[0];
    expect(rsin?.from).toBe('eori');
    expect(rsin?.value).toBe('001469630');
    expect(rsin?.rules).toEqual(['rsin-from-eori-nl']);
    expect(rsin?.hops).toBe(1);
    expect(rsin?.certainty).toBe('likely');
  });

  test('the explanation holds the pattern, the country facts, the assumption, the rule and the output checks', () => {
    const refs = result.data[0]?.explanation.map((step) => step.ref) ?? [];
    for (const expected of [
      'eori/patterns/0',
      'eori/context_from/issuing_country',
      'vocab/country-prefix/NL',
      'rsin-from-eori-nl/condition/entity_form',
      'rsin-from-eori-nl',
      'rsin/patterns/0',
      'rsin/checksum/0',
    ]) {
      expect(refs, `explanation lacks ${expected}`).toContain(expected);
    }
    expect(refs).not.toContain('rsin-from-eori-nl/condition/issuing_country');
    const assumption = result.data[0]?.explanation.find(
      (step) => step.ref === 'rsin-from-eori-nl/condition/entity_form',
    );
    expect(assumption?.kind).toBe('assumption');
    const rule = result.data[0]?.explanation.find((step) => step.ref === 'rsin-from-eori-nl');
    expect(rule?.kind).toBe('rule');
  });

  test('the OIN comes at two steps through the RSIN', () => {
    const oin = result.data[1];
    expect(oin?.from).toBe('eori');
    expect(oin?.rules).toEqual(['rsin-from-eori-nl', 'oin-from-rsin']);
    expect(oin?.hops).toBe(2);
    expect(oin?.value).toBe('00000001001469630000');
    expect(oin?.certainty).toBe('likely');
  });

  test('no derivation outputs a VAT number (DEC-050)', () => {
    expect(result.data.some((each) => each.scheme === 'vat-nl')).toBe(false);
    expect(result.data.some((each) => each.scheme === 'vat')).toBe(false);
  });

  test('one conclusion per derivation, built from labels and ids, never from a value', () => {
    expect(result.conclusions.map((each) => each.key)).toEqual([
      'derive.derivation',
      'derive.derivation',
    ]);
    expect(result.conclusions[0]?.params).toEqual({
      from: 'eori',
      scheme: 'rsin',
      rules: 'rsin-from-eori-nl',
    });
    for (const each of result.conclusions) {
      expect(each.statement.includes('001469630')).toBe(false);
      expect(each.explanation.length).toBeGreaterThan(0);
    }
    expect(result.warnings).toEqual([]);
  });
});
