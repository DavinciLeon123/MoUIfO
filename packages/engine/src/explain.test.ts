import { describe, expect, test } from 'vitest';
import { weakest } from './certainty.ts';
import { compileModel } from './compile.ts';
import {
  type ConditionKey,
  evaluateCondition,
  type Known,
  mergeKnown,
  resolveContext,
  valueContext,
} from './conditions.ts';
import { createEngine } from './engine.ts';
import { assumptionStep, conclusion, ctxStep, dedupeSteps } from './explain.ts';
import { fixtureModel, fixtureVocabulary } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';
import type { Certainty, Step } from './types.ts';

const fixture = compileModel(fixtureModel());
const real = compileModel(loadDistModel());

/** A known context built by hand: each key with a value and a fact step. */
function known(entries: Partial<Record<ConditionKey, string>>): Known {
  const map = new Map<ConditionKey, { value: string; steps: Step[]; origin: 'value' | 'ctx' }>();
  for (const [key, value] of Object.entries(entries) as [ConditionKey, string][]) {
    map.set(key, { value, origin: 'ctx', steps: [ctxStep(key, value)] });
  }
  return map;
}

function step(certainty: Certainty): Step {
  return { kind: 'fact', ref: `t/${certainty}`, certainty, source: null };
}

describe('evaluateCondition: issuing_country', () => {
  const owner = 'x/patterns/0';

  test('a known matching country is true and adds the known fact steps', () => {
    const result = evaluateCondition(
      { issuing_country: 'AA' },
      known({ issuing_country: 'AA' }),
      owner,
    );
    expect(result.state).toBe('true');
    expect(result.steps.map((s) => s.ref)).toEqual(['ctx/issuing_country']);
  });

  test('a known different country is false', () => {
    const result = evaluateCondition(
      { issuing_country: 'AA' },
      known({ issuing_country: 'BB' }),
      owner,
    );
    expect(result.state).toBe('false');
  });

  test('an unknown country is unknown with exactly one assumption step at likely', () => {
    const result = evaluateCondition({ issuing_country: 'AA' }, known({}), owner);
    expect(result.state).toBe('unknown');
    expect(result.steps).toEqual([
      {
        kind: 'assumption',
        ref: 'x/patterns/0/condition/issuing_country',
        certainty: 'likely',
        condition: { issuing_country: 'AA' },
        source: null,
      },
    ]);
  });

  test.for([
    ['BB', 'true'],
    ['AA', 'false'],
    [undefined, 'unknown'],
  ] as const)('a negated country with known %s is %s', ([country, expected]) => {
    const context = country === undefined ? known({}) : known({ issuing_country: country });
    expect(evaluateCondition({ issuing_country: '!AA' }, context, owner).state).toBe(expected);
  });
});

describe('evaluateCondition: several keys', () => {
  const owner = 'x/checksum/1';

  test('one true and one unknown key is unknown, with the fact steps and one assumption', () => {
    const result = evaluateCondition(
      { issuing_country: 'AA', entity_form: 'legal-person' },
      known({ issuing_country: 'AA' }),
      owner,
    );
    expect(result.state).toBe('unknown');
    expect(result.steps.map((s) => `${s.kind}:${s.ref}`)).toEqual([
      'fact:ctx/issuing_country',
      'assumption:x/checksum/1/condition/entity_form',
    ]);
  });

  test('any false key makes the condition false, even next to an unknown key', () => {
    const result = evaluateCondition(
      { issuing_country: 'AA', entity_form: 'legal-person' },
      known({ issuing_country: 'BB' }),
      owner,
    );
    expect(result.state).toBe('false');
  });

  test('an absent condition is true with no steps', () => {
    expect(evaluateCondition(undefined, known({}), owner)).toEqual({ state: 'true', steps: [] });
  });
});

describe('weakest link and conclusions', () => {
  test('the weakest of certain and likely is likely', () => {
    expect(weakest([step('certain'), step('likely')], fixture.rank)).toBe('likely');
  });

  test('an assumption never raises a possible step', () => {
    const assumption = assumptionStep('x/patterns/0', 'entity_form', 'legal-person');
    expect(weakest([step('possible'), assumption], fixture.rank)).toBe('possible');
  });

  test('weakest of no step throws', () => {
    expect(() => weakest([], fixture.rank)).toThrow('a conclusion needs at least one step');
  });

  test('a conclusion without a step throws', () => {
    expect(() => conclusion(fixture, 'k', {}, 'A sentence.', [])).toThrow(
      'a conclusion needs at least one step',
    );
  });

  test('a conclusion has the certainty of its weakest step', () => {
    const steps = [step('certain'), step('likely'), step('certain')];
    const result = conclusion(fixture, 'k', { scheme: 'x' }, 'A sentence.', steps);
    expect(result.certainty).toBe(weakest(result.explanation, fixture.rank));
    expect(result.certainty).toBe('likely');
  });

  test('dedupeSteps keeps the first step of each kind and ref', () => {
    const first = step('certain');
    expect(dedupeSteps([first, { ...first, certainty: 'possible' }, step('likely')])).toEqual([
      first,
      step('likely'),
    ]);
  });

  test('the rank map is read from the certainty vocabulary, not from the order of its members', () => {
    const reversed = fixtureVocabulary('certainty', [
      { id: 'possible', label: { en: 'possible' }, rank: 1 },
      { id: 'likely', label: { en: 'likely' }, rank: 2 },
      { id: 'certain', label: { en: 'certain' }, rank: 3 },
    ]);
    const compiled = compileModel(fixtureModel({ vocab: { certainty: reversed } }));
    expect(weakest([step('certain'), step('likely')], compiled.rank)).toBe('likely');
    expect(weakest([step('possible'), step('certain')], compiled.rank)).toBe('possible');
  });

  test('a certainty vocabulary with other ids makes createEngine throw', () => {
    const other = fixtureVocabulary('certainty', [
      { id: 'high', label: { en: 'high' }, rank: 3 },
      { id: 'low', label: { en: 'low' }, rank: 1 },
    ]);
    expect(() => createEngine(fixtureModel({ vocab: { certainty: other } }))).toThrow(
      /vocab\/certainty/,
    );
  });
});

describe('resolveContext (DEC-069)', () => {
  test('an entity form becomes one fact step ctx/entity_form with no source', () => {
    const { known: result, warnings } = resolveContext(fixture, { entity_form: 'legal-person' });
    expect(warnings).toEqual([]);
    const fact = result.get('entity_form');
    expect(fact?.origin).toBe('ctx');
    expect(fact?.steps).toHaveLength(1);
    expect(fact?.steps[0]).toMatchObject({ kind: 'fact', ref: 'ctx/entity_form', source: null });
  });

  test('EL resolves to GR on the real model', () => {
    const { known: result, warnings } = resolveContext(real, { issuing_country: 'EL' });
    expect(warnings).toEqual([]);
    expect(result.get('issuing_country')?.value).toBe('GR');
  });

  test('a jurisdiction id is accepted as an issuing country', () => {
    expect(
      resolveContext(fixture, { issuing_country: 'DD' }).known.get('issuing_country')?.value,
    ).toBe('DD');
  });

  test('an unknown key gives unknown-context-key and no known fact', () => {
    const { known: result, warnings } = resolveContext(fixture, { colour: 'red' });
    expect(result.size).toBe(0);
    expect(warnings.map((w) => w.code)).toEqual(['unknown-context-key']);
  });

  test.for([
    ['a number', { entity_form: 7 }],
    ['a value outside the vocabulary', { entity_form: 'company' }],
    ['an unknown country', { issuing_country: 'ZZ' }],
    ['a context tag the empty vocabulary lacks', { context: 'any' }],
  ] as const)('%s gives unknown-context-value', ([, ctx]) => {
    const { known: result, warnings } = resolveContext(fixture, ctx);
    expect(result.size).toBe(0);
    expect(warnings.map((w) => w.code)).toEqual(['unknown-context-value']);
  });

  test.for([['x'], [null], [[]]] as const)(
    'a non-object context %j gives invalid-context',
    ([ctx]) => {
      const { known: result, warnings } = resolveContext(fixture, ctx);
      expect(result.size).toBe(0);
      expect(warnings.map((w) => w.code)).toEqual(['invalid-context']);
    },
  );

  test('a property inherited through the prototype is not read', () => {
    const ctx = Object.create({ entity_form: 'legal-person' });
    const { known: result, warnings } = resolveContext(fixture, ctx);
    expect(result.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  test('no warning message contains the caller text', () => {
    const { warnings } = resolveContext(fixture, {
      'caller-key-text': 'x',
      entity_form: 'caller-value-text',
    });
    expect(warnings).toHaveLength(2);
    for (const warning of warnings) {
      expect(warning.message).not.toContain('caller-key-text');
      expect(warning.message).not.toContain('caller-value-text');
    }
  });
});

describe('valueContext on the real model (DEC-035)', () => {
  test('an NL eori value gives issuing_country NL with two sourced fact steps', () => {
    const fact = valueContext(real, 'eori', 'NL001469630').get('issuing_country');
    expect(fact?.value).toBe('NL');
    expect(fact?.origin).toBe('value');
    expect(fact?.steps.map((s) => [s.ref, s.source?.id, s.certainty])).toEqual([
      ['eori/context_from/issuing_country', 'commission-eori', 'certain'],
      ['vocab/country-prefix/NL', 'vat-directive-art-215', 'certain'],
    ]);
  });

  test('an EL value gives GR through the country-prefix vocabulary', () => {
    const fact = valueContext(real, 'eori', 'ELAB1234').get('issuing_country');
    expect(fact?.value).toBe('GR');
    expect(fact?.steps[1]?.ref).toBe('vocab/country-prefix/EL');
  });

  test('a prefix the vocabulary does not map gives no context', () => {
    expect(valueContext(real, 'eori', 'DEAB1234').size).toBe(0);
  });

  test('a scheme without context_from gives no context', () => {
    expect(valueContext(real, 'rsin', 'NL001469630').size).toBe(0);
  });
});

describe('mergeKnown (DEC-069)', () => {
  test('the value-derived country wins and a different ctx country adds context-conflict', () => {
    const merged = mergeKnown(
      known({ issuing_country: 'BB' }),
      valueContext(real, 'eori', 'NL001469630'),
      'eori/context_from/issuing_country',
    );
    expect(merged.known.get('issuing_country')?.value).toBe('NL');
    expect(merged.warnings).toEqual([
      expect.objectContaining({
        code: 'context-conflict',
        ref: 'eori/context_from/issuing_country',
      }),
    ]);
  });

  test('the same country adds no warning', () => {
    const merged = mergeKnown(
      known({ issuing_country: 'NL' }),
      valueContext(real, 'eori', 'NL001469630'),
      'ref',
    );
    expect(merged.warnings).toEqual([]);
  });

  test('an entity form from the ctx passes through unchanged', () => {
    const merged = mergeKnown(
      known({ entity_form: 'legal-person' }),
      valueContext(real, 'eori', 'NL001469630'),
      'ref',
    );
    expect(merged.known.get('entity_form')?.value).toBe('legal-person');
    expect(merged.known.get('issuing_country')?.value).toBe('NL');
    expect(merged.warnings).toEqual([]);
  });
});
