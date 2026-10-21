import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);

describe('relate: the rsin-eori tracer on the real model', () => {
  test('rsin and eori give one path whose step is the inverse derived-from relation', () => {
    const result = engine.relate('rsin', 'eori');
    expect(result.warnings).toEqual([]);
    expect(result.data).toHaveLength(1);
    const path = result.data[0];
    expect(path?.schemes).toEqual(['rsin', 'eori']);
    expect(path?.hops).toHaveLength(1);
    const hop = path?.hops[0];
    expect(hop?.from).toBe('rsin');
    expect(hop?.to).toBe('eori');
    expect(hop?.step).toMatchObject({
      kind: 'fact',
      edge: 'relation',
      ref: 'eori/relations/0',
      inverse: true,
    });
  });

  test('the parallel rules are in also_via in code-unit order with their direction', () => {
    const hop = engine.relate('rsin', 'eori').data[0]?.hops[0];
    expect(hop?.also_via.map((step) => [step.kind, step.edge, step.ref, step.inverse])).toEqual([
      ['rule', 'rule', 'eori-nl-from-rsin', false],
      ['rule', 'rule', 'rsin-from-eori-nl', true],
    ]);
  });

  test('without a context the condition is an assumption, so the path is likely', () => {
    const path = engine.relate('rsin', 'eori').data[0];
    expect(path?.certainty).toBe('likely');
    const assumption = path?.explanation.find((step) => step.kind === 'assumption');
    expect(assumption?.condition).toEqual({ entity_form: 'legal-person' });
    expect(assumption?.source).toBeNull();
  });

  test('the conclusion reads the stored relation and marks it inverse', () => {
    const result = engine.relate('rsin', 'eori');
    expect(result.conclusions).toHaveLength(1);
    const conclusion = result.conclusions[0];
    expect(conclusion?.key).toBe('relate.path');
    expect(conclusion?.params).toEqual({ a: 'rsin', b: 'eori', steps: '1' });
    expect(conclusion?.statement).toContain('eori derived-from rsin (inverse)');
    expect(conclusion?.certainty).toBe('likely');
  });

  test('a context that establishes the entity form makes the path certain with the ctx fact', () => {
    const path = engine.relate('rsin', 'eori', { entity_form: 'legal-person' }).data[0];
    expect(path?.certainty).toBe('certain');
    expect(path?.explanation.map((step) => step.ref)).toContain('ctx/entity_form');
    expect(path?.explanation.some((step) => step.kind === 'assumption')).toBe(false);
  });

  test('a context that contradicts the condition drops every rsin-eori edge', () => {
    const result = engine.relate('rsin', 'eori', { entity_form: 'sole-proprietorship' });
    expect(result.data).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['no-chain']);
  });
});
