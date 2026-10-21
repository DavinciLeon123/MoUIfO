import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
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
