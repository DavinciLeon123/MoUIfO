import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);

const WRAPPER = 'iso6523-actorid-upis::';

function example(scheme: string, index = 0): string {
  const value = model.schemes[scheme]?.format?.examples_valid?.[index];
  if (value === undefined) throw new Error(`the model has no example for ${scheme}`);
  return value;
}

function peppol(value: string) {
  const result = engine.recognise(value);
  const candidate = result.data.find((each) => each.scheme === 'peppol-id');
  return { result, candidate };
}

describe('recognise: Peppol delegation to a declared component (ENG-12, DEC-065)', () => {
  test('prefix 0106 is split and the rest is recognised as a kvk-number', () => {
    const { candidate } = peppol(`${WRAPPER}0106:${example('kvk-number')}`);
    expect(candidate).toBeDefined();
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.components).toHaveLength(1);
    const component = candidate?.components?.[0];
    expect(component?.prefix).toBe('0106');
    expect(component?.scheme).toBe('kvk-number');
    expect(component?.candidates).toHaveLength(1);
    expect(component?.candidates[0]?.scheme).toBe('kvk-number');
    expect(component?.candidates[0]?.accepted).toBe(true);
  });

  test('the explanation holds a component step that cites the component statement', () => {
    const { candidate } = peppol(`${WRAPPER}0106:${example('kvk-number')}`);
    const step = candidate?.explanation.find((each) => each.kind === 'component');
    expect(step?.ref).toBe('peppol-id/components/0106');
    expect(step?.certainty).toBe('likely');
    expect(step?.source?.id).toBe('peppol-code-lists-9-7');
    // the nested pattern step of the component scheme is part of the chain
    expect(candidate?.explanation.some((each) => each.ref === 'kvk-number/patterns/0')).toBe(true);
  });

  test('prefix 9944 delegates to vat-nl and cites its source', () => {
    const { candidate, result } = peppol(`${WRAPPER}9944:${example('vat-nl')}`);
    expect(candidate?.components?.[0]?.scheme).toBe('vat-nl');
    expect(candidate?.components?.[0]?.candidates[0]?.accepted).toBe(true);
    const step = candidate?.explanation.find((each) => each.ref === 'peppol-id/components/9944');
    expect(step?.source?.id).toBe('peppol-code-lists-9-7');
    expect(result.warnings.filter((w) => w.code === 'component-not-accepted')).toEqual([]);
    expect(candidate?.certainty).toBe('likely');
  });

  test('the delegation is read after the last :: and only the declared prefix is used', () => {
    const { candidate } = peppol(`${WRAPPER}0190:${example('oin')}`);
    expect(candidate?.components?.[0]).toMatchObject({ prefix: '0190', scheme: 'oin' });
    expect(candidate?.components?.[0]?.candidates[0]?.accepted).toBe(true);
  });
});

describe('recognise: Peppol prefixes the model does not delegate', () => {
  test('the model example (prefix 9918) has no components and one unknown-component-prefix warning', () => {
    const { candidate, result } = peppol(example('peppol-id'));
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.components).toEqual([]);
    const warnings = result.warnings.filter((w) => w.code === 'unknown-component-prefix');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('9918');
    expect(warnings[0]?.message).not.toContain('nl23rabo0137300425');
    expect(warnings[0]?.ref).toBe('peppol-id');
  });

  test('the composite certainty is not lowered when the prefix is unknown', () => {
    const { candidate } = peppol(example('peppol-id'));
    expect(candidate?.certainty).toBe('likely');
  });
});

describe('recognise: a declared prefix whose rest its scheme does not accept', () => {
  test('a seven-digit rest under 0106 gives possible and component-not-accepted', () => {
    const rest = '1234567'.slice(0, 7);
    const { candidate, result } = peppol(`${WRAPPER}0106:${rest}`);
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.certainty).toBe('possible');
    expect(candidate?.components?.[0]?.candidates).toEqual([]);
    const warnings = result.warnings.filter((w) => w.code === 'component-not-accepted');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.ref).toBe('peppol-id/components/0106');
    expect(warnings[0]?.message).not.toContain(rest);
    const conclusion = result.conclusions.find((c) => c.params.scheme === 'peppol-id');
    expect(conclusion?.key).toBe('recognise.component-not-accepted');
    expect(conclusion?.certainty).toBe('possible');
    expect(conclusion?.statement).toContain('kvk-number');
    expect(conclusion?.statement).not.toContain(rest);
  });

  test('the lower-case form of a vat-nl example under 9944 is not accepted (no case folding)', () => {
    const lower = example('vat-nl').toLowerCase();
    expect(lower).not.toBe(example('vat-nl'));
    const { candidate } = peppol(`${WRAPPER}9944:${lower}`);
    expect(candidate?.components?.[0]?.candidates.some((each) => each.accepted)).toBe(false);
    expect(candidate?.certainty).toBe('possible');
  });

  test('a rest of another component scheme is not guessed into the declared one', () => {
    const { candidate } = peppol(`${WRAPPER}0106:${example('gln')}`);
    expect(candidate?.components?.[0]?.scheme).toBe('kvk-number');
    expect(candidate?.components?.[0]?.candidates).toEqual([]);
  });
});
