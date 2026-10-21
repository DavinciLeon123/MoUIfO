import { describe, expect, test } from 'vitest';
import type { Derivation } from './derive.ts';
import { createEngine } from './engine.ts';
import type { Rule, Scheme } from './model-types.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';
import { syntheticInvalid, syntheticValid } from './testing/synthetic-values.ts';

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

  test('the derivation conclusions, built from labels and ids, never from a value', () => {
    const derivations = result.conclusions.filter((each) => each.key === 'derive.derivation');
    expect(derivations).toHaveLength(2);
    expect(derivations[0]?.params).toEqual({
      from: 'eori',
      scheme: 'rsin',
      rules: 'rsin-from-eori-nl',
    });
    expect(derivations[1]?.params).toEqual({
      from: 'eori',
      scheme: 'oin',
      rules: 'rsin-from-eori-nl,oin-from-rsin',
    });
    for (const each of result.conclusions) {
      expect(each.statement.includes('001469630')).toBe(false);
      expect(each.explanation.length).toBeGreaterThan(0);
    }
    expect(result.warnings).toEqual([]);
  });
});

/** The output scheme of every rule of the real model, so a derivation's path can be read back. */
const outputOf = new Map<string, string>();
for (const scheme of Object.values(model.schemes)) {
  for (const rule of scheme.rules ?? []) outputOf.set(rule.id, rule.output);
}

function pathOf(derivation: Derivation): string[] {
  return [derivation.from, ...derivation.rules.map((rule) => outputOf.get(rule) ?? '?')];
}

function codes(result: { warnings: { code: string }[] }): string[] {
  return result.warnings.map((warning) => warning.code);
}

describe('derive: chaining over the real model', () => {
  const result = engine.derive('NL001469630B01', 'vat-nl');

  test('a VAT number gives the RSIN, then the EORI and the OIN through it', () => {
    const byScheme = new Map(result.data.map((each) => [each.scheme, each.rules]));
    expect([...byScheme.keys()].sort()).toEqual(['eori', 'oin', 'rsin']);
    expect(byScheme.get('rsin')).toEqual(['rsin-from-vat-nl']);
    expect(byScheme.get('eori')).toEqual(['rsin-from-vat-nl', 'eori-nl-from-rsin']);
    expect(byScheme.get('oin')).toEqual(['rsin-from-vat-nl', 'oin-from-rsin']);
    const eori = result.data.find((each) => each.scheme === 'eori');
    expect(eori?.value).toBe('NL001469630');
  });

  test('no derivation returns to the start scheme or repeats a scheme', () => {
    for (const each of result.data) {
      const path = pathOf(each);
      expect(new Set(path).size, path.join('>')).toBe(path.length);
      expect(each.scheme).not.toBe('vat-nl');
    }
  });

  test('every derivation is at most four steps and its certainty is its weakest step', () => {
    const rank = new Map([
      ['certain', 3],
      ['likely', 2],
      ['possible', 1],
    ]);
    for (const each of result.data) {
      expect(each.hops).toBeLessThanOrEqual(4);
      expect(each.hops).toBe(each.rules.length);
      const weakest = [...each.explanation].sort(
        (a, b) => (rank.get(a.certainty) ?? 0) - (rank.get(b.certainty) ?? 0),
      )[0];
      expect(each.certainty).toBe(weakest?.certainty);
    }
  });

  test('no statement, warning or ref holds the input or a derived value (T-05-17)', () => {
    for (const call of [
      engine.derive('NL001469630', 'eori'),
      result,
      engine.derive('001469630', 'rsin'),
    ]) {
      const text = JSON.stringify([call.conclusions, call.warnings]);
      expect(text.includes('001469630')).toBe(false);
    }
  });

  test('the second argument is the scheme of the input, never a target scheme', () => {
    // The tracer call names eori, the scheme of NL001469630, and still derives the other schemes.
    expect(engine.derive('NL001469630', 'eori').data.map((each) => each.from)).toEqual([
      'eori',
      'eori',
    ]);
  });
});

describe('derive: the declared scheme and the input', () => {
  test('without a declared scheme every accepted candidate starts, so the VAT number derives', () => {
    const result = engine.derive('NL001469630B01');
    expect(new Set(result.data.map((each) => each.from))).toEqual(new Set(['vat-nl']));
    expect(result.data.map((each) => each.scheme).sort()).toEqual(['eori', 'oin', 'rsin']);
    expect(codes(result)).not.toContain('output-failed-validation');
  });

  test('a value the declared scheme does not accept gives no data and value-not-accepted', () => {
    const result = engine.derive('NL001469630', 'rsin');
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'value-not-accepted',
        message: 'The value is not accepted by the declared scheme.',
        ref: 'schemeId',
      },
    ]);
  });

  test('an unknown scheme, a prototype id and a non-string argument give a warning each', () => {
    expect(codes(engine.derive('NL001469630', 'nope'))).toEqual(['unknown-scheme']);
    expect(codes(engine.derive('NL001469630', '__proto__'))).toEqual(['unknown-scheme']);
    expect(codes(engine.derive('NL001469630', 'constructor'))).toEqual(['unknown-scheme']);
    expect(codes(engine.derive('NL001469630', 7 as never))).toEqual(['invalid-input']);
    expect(codes(engine.derive('NL001469630', null as never))).toEqual(['invalid-input']);
    expect(codes(engine.derive(7 as never))).toEqual(['invalid-input']);
    expect(codes(engine.derive('   '))).toEqual(['empty-input']);
    expect(codes(engine.derive('N'.repeat(257)))).toEqual(['input-too-long']);
    for (const call of [engine.derive('NL001469630', 'nope'), engine.derive(7 as never)]) {
      expect(call.data).toEqual([]);
      expect(call.conclusions).toEqual([]);
    }
  });

  test('an unknown scheme id is never echoed in the message', () => {
    const result = engine.derive('NL001469630', 'zzz-unknown');
    expect(JSON.stringify(result.warnings).includes('zzz-unknown')).toBe(false);
  });

  test('surrounding whitespace is trimmed', () => {
    expect(engine.derive('  NL001469630 ', 'eori').data.map((each) => each.scheme)).toEqual([
      'rsin',
      'oin',
    ]);
  });
});

describe('derive: the personal-identifier gate (ENG-09, DEC-005, DEC-067)', () => {
  test('a declared rsin gives the eori and the oin, never an rsin, with the gate warning', () => {
    const result = engine.derive('001469630', 'rsin');
    expect(result.data.map((each) => each.scheme).sort()).toEqual(['eori', 'oin']);
    expect(codes(result)).toContain('possible-personal-identifier');
  });

  test('a declared bsn gives no derivation and the gate warning', () => {
    const result = engine.derive('001469630', 'bsn');
    expect(result.data).toEqual([]);
    expect(codes(result)).toContain('possible-personal-identifier');
  });

  test('a bare elfproef-valid value without a declared scheme starts nothing', () => {
    const value = syntheticValid();
    const result = engine.derive(value);
    expect(result.data).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(codes(result)).toEqual(['possible-personal-identifier']);
    expect(JSON.stringify(result.warnings).includes(value)).toBe(false);
  });

  test('the same value with a declared scheme derives and still carries the warning', () => {
    const value = syntheticValid();
    const result = engine.derive(value, 'rsin');
    expect(result.data.map((each) => each.scheme).sort()).toEqual(['eori', 'oin']);
    expect(result.data.find((each) => each.scheme === 'eori')?.rules).toEqual([
      'eori-nl-from-rsin',
    ]);
    expect(codes(result)).toContain('possible-personal-identifier');
    expect(JSON.stringify([result.conclusions, result.warnings]).includes(value)).toBe(false);
  });

  test('a value that fails the elfproef is not gated', () => {
    const result = engine.derive(syntheticInvalid(), 'rsin');
    expect(codes(result)).not.toContain('possible-personal-identifier');
  });
});

describe('derive: the context (D-12, DEC-069)', () => {
  test('entity_form legal-person is a ctx fact and no assumption; the RSIN stays likely', () => {
    const rsin = engine.derive('NL001469630', 'eori', { entity_form: 'legal-person' }).data[0];
    const refs = rsin?.explanation.map((step) => step.ref) ?? [];
    expect(refs).toContain('ctx/entity_form');
    expect(refs).not.toContain('rsin-from-eori-nl/condition/entity_form');
    expect(rsin?.explanation.some((step) => step.kind === 'assumption')).toBe(false);
    expect(rsin?.certainty).toBe('likely');
  });

  test('a contradicting entity_form drops the rule, so nothing derives', () => {
    const result = engine.derive('NL001469630', 'eori', { entity_form: 'sole-proprietorship' });
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('a different issuing country in the context keeps the value-derived one and warns', () => {
    const result = engine.derive('NL001469630', 'eori', { issuing_country: 'BE' });
    expect(result.data.map((each) => each.scheme)).toEqual(['rsin', 'oin']);
    expect(codes(result)).toContain('context-conflict');
    const refs = result.data[0]?.explanation.map((step) => step.ref) ?? [];
    expect(refs).toContain('vocab/country-prefix/NL');
  });

  test('an unknown context key or value is ignored with a warning', () => {
    const result = engine.derive('NL001469630', 'eori', { nope: 'x', entity_form: 'zzz' } as never);
    expect(codes(result)).toEqual(['unknown-context-value', 'unknown-context-key']);
    expect(result.data.map((each) => each.scheme)).toEqual(['rsin', 'oin']);
  });
});

describe('derive: a DE-prefixed EORI (DEC-071 option-a, DEC-035)', () => {
  test('the long DE example gives no RSIN and no Dutch VAT number', () => {
    const result = engine.derive('DE123456789012345', 'eori');
    expect(result.data.some((each) => each.scheme === 'rsin' || each.scheme === 'vat-nl')).toBe(
      false,
    );
    expect(result.data).toEqual([]);
    expect(codes(result)).not.toContain('output-failed-validation');
  });

  test('DE plus nine elfproef-valid digits gives no RSIN and no conclusion about one', () => {
    const value = `DE${syntheticValid()}`;
    const result = engine.derive(value, 'eori');
    expect(result.data.some((each) => each.scheme === 'rsin')).toBe(false);
    expect(result.conclusions.some((each) => each.params.scheme === 'rsin')).toBe(false);
    expect(codes(result)).not.toContain('possible-personal-identifier');
  });

  test('the sole-proprietor form NL plus ten digits gives no RSIN', () => {
    const result = engine.derive(`NL${syntheticValid()}0`, 'eori');
    expect(result.data.some((each) => each.scheme === 'rsin')).toBe(false);
  });

  test('an EORI of another mapped country drops the rule on its condition', () => {
    const result = engine.derive(`BE${syntheticValid()}`, 'eori');
    expect(result.data).toEqual([]);
  });
});

/** A fixture scheme that accepts any run of capital letters and digits. */
function accepting(id: string, rules: Rule[] = [], regex = '^[A-Z0-9]+$'): Scheme {
  return fixtureScheme(id, {
    format: { patterns: [{ regex, certainty: 'certain', source: 'fx-law' }] },
    rules,
  });
}

function ruleOf(id: string, input: string, output: string, more: Partial<Rule> = {}): Rule {
  return {
    id,
    input,
    output,
    transform: [{ add_prefix: 'X' }],
    certainty: 'certain',
    source: 'fx-law',
    ...more,
  };
}

function fixtureEngine(schemes: Scheme[]) {
  return createEngine(fixtureModel({ schemes }));
}

describe('derive on fixtures: limits and ordering', () => {
  test('a five-rule chain derives up to four steps and not the sixth scheme', () => {
    const six = fixtureEngine([
      accepting('s1', [ruleOf('r12', 's1', 's2')]),
      accepting('s2', [ruleOf('r23', 's2', 's3')]),
      accepting('s3', [ruleOf('r34', 's3', 's4')]),
      accepting('s4', [ruleOf('r45', 's4', 's5')]),
      accepting('s5', [ruleOf('r56', 's5', 's6')]),
      accepting('s6'),
    ]);
    const result = six.derive('A1', 's1');
    expect(result.data.map((each) => [each.scheme, each.hops])).toEqual([
      ['s2', 1],
      ['s3', 2],
      ['s4', 3],
      ['s5', 4],
    ]);
    expect(result.data[3]?.value).toBe('XXXXA1');
    expect(result.warnings).toEqual([]);
  });

  test('a two-scheme cycle never returns to its start', () => {
    const cycle = fixtureEngine([
      accepting('c1', [ruleOf('c1-c2', 'c1', 'c2')]),
      accepting('c2', [ruleOf('c2-c1', 'c2', 'c1')]),
    ]);
    const result = cycle.derive('A1', 'c1');
    expect(result.data.map((each) => each.scheme)).toEqual(['c2']);
  });

  test('a transform that gives no value adds no derivation and no warning', () => {
    const silent = fixtureEngine([
      accepting('n1', [
        ruleOf('n1-n2', 'n1', 'n2', { transform: [{ capture: { regex: '^ZZ(.*)$', group: 1 } }] }),
      ]),
      accepting('n2'),
    ]);
    const result = silent.derive('A1', 'n1');
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('an output its scheme does not accept is dropped with output-failed-validation', () => {
    const strict = fixtureEngine([
      accepting('v1', [ruleOf('v1-v2', 'v1', 'v2')]),
      accepting('v2', [], '^[0-9]+$'),
    ]);
    const result = strict.derive('A1', 'v1');
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'output-failed-validation',
        message: 'Rule v1-v2 gave an output that v2 does not accept.',
        ref: 'v1-v2',
      },
    ]);
  });

  test('two chains to one scheme are both returned, by certainty, then steps, then rule ids', () => {
    const diamond = fixtureEngine([
      accepting('a', [
        ruleOf('r-ac', 'a', 'c', { certainty: 'likely' }),
        ruleOf('r-ab', 'a', 'b'),
        ruleOf('r-ae', 'a', 'e'),
      ]),
      accepting('b', [ruleOf('r-bd', 'b', 'd')]),
      accepting('c', [ruleOf('r-cd', 'c', 'd')]),
      accepting('d'),
      accepting('e', [ruleOf('r-ed', 'e', 'd')]),
    ]);
    const result = diamond.derive('A1', 'a');
    expect(result.data.map((each) => [each.scheme, each.rules.join(' '), each.certainty])).toEqual([
      ['b', 'r-ab', 'certain'],
      ['e', 'r-ae', 'certain'],
      ['d', 'r-ab r-bd', 'certain'],
      ['d', 'r-ae r-ed', 'certain'],
      ['c', 'r-ac', 'likely'],
      ['d', 'r-ac r-cd', 'likely'],
    ]);
  });

  test('a fan-out of more than 100 paths returns exactly 100 and too-many-results', () => {
    const middles = Array.from({ length: 11 }, (_, i) => `m${i + 1}`);
    const ends = Array.from({ length: 11 }, (_, i) => `o${i + 1}`);
    const wide = fixtureEngine([
      accepting(
        'hub',
        middles.map((id) => ruleOf(`hub-${id}`, 'hub', id)),
      ),
      ...middles.map((id) =>
        accepting(
          id,
          ends.map((end) => ruleOf(`${id}-${end}`, id, end)),
        ),
      ),
      ...ends.map((id) => accepting(id)),
    ]);
    const result = wide.derive('A1', 'hub');
    expect(result.data).toHaveLength(100);
    expect(result.conclusions.filter((each) => each.key === 'derive.derivation')).toHaveLength(100);
    expect(codes(result)).toEqual(['too-many-results']);
    expect(wide.derive('A1', 'hub').data).toEqual(result.data);
  });

  test('a condition the context does not establish is an assumption at likely', () => {
    const conditional = fixtureEngine([
      accepting('k1', [
        ruleOf('k1-k2', 'k1', 'k2', { condition: { entity_form: 'legal-person' } }),
      ]),
      accepting('k2'),
    ]);
    const open = conditional.derive('A1', 'k1').data[0];
    expect(open?.certainty).toBe('likely');
    expect(open?.explanation.some((step) => step.kind === 'assumption')).toBe(true);
    const known = conditional.derive('A1', 'k1', { entity_form: 'legal-person' }).data[0];
    expect(known?.certainty).toBe('certain');
    expect(conditional.derive('A1', 'k1', { entity_form: 'fiscal-unit' }).data).toEqual([]);
  });
});

const rank = new Map<string, number>([
  ['certain', 3],
  ['likely', 2],
  ['possible', 1],
]);

describe('derive: reference conclusions (SPEC section 10, DEC-031, DEC-045, DEC-050)', () => {
  const result = engine.derive('NL001469630', 'eori');
  const keys = result.conclusions.map((each) => each.key);

  test('reference: issued by the class instance of the issuing country, before the derivations', () => {
    expect(keys).toEqual([
      'derive.issued-by',
      'derive.verify-through',
      'derive.derivation',
      'derive.derivation',
      'derive.look-up-through',
      'derive.look-up-through',
    ]);
    const issued = result.conclusions[0];
    expect(issued?.params).toEqual({ scheme: 'eori', authority: 'douane-nl' });
    expect(issued?.certainty).toBe('certain');
    expect(issued?.explanation.map((step) => step.ref)).toEqual([
      'eori/issuer',
      'eori/context_from/issuing_country',
      'vocab/country-prefix/NL',
      'authorities/douane-nl',
    ]);
    expect(issued?.statement).toContain('(douane-nl)');
  });

  test('reference: verifiable through the start scheme validation source', () => {
    const verify = result.conclusions[1];
    expect(verify?.params).toEqual({ scheme: 'eori', source: 'eori-validation' });
    expect(verify?.certainty).toBe('certain');
    expect(verify?.explanation.map((step) => step.ref)).toEqual(['eori/validation_source']);
  });

  test('reference: each derived scheme is a look-up reference, not a lookup', () => {
    const [rsin, oin] = result.conclusions.slice(4);
    expect(rsin?.params).toEqual({ scheme: 'rsin', source: 'kvk-zoeken' });
    expect(oin?.params).toEqual({ scheme: 'oin', source: 'oin-register' });
    for (const each of [rsin, oin]) {
      expect(each?.certainty).toBe('certain');
      expect(each?.explanation.map((step) => step.ref)).toEqual([
        `${each?.params.scheme}/validation_source`,
      ]);
    }
    expect(rsin?.statement).toContain('this is a reference, not a lookup');
  });

  test('reference: a DE EORI names the authority class, with one issuer step, and verify-through', () => {
    const de = engine.derive('DE123456789012345', 'eori');
    expect(de.conclusions.map((each) => each.key)).toEqual([
      'derive.issued-by',
      'derive.verify-through',
    ]);
    expect(de.conclusions[0]?.params).toEqual({
      scheme: 'eori',
      authority: 'national-customs-authority',
    });
    expect(de.conclusions[0]?.explanation.map((step) => step.ref)).toEqual(['eori/issuer']);
  });

  test('reference: a declared rsin is issued by the instance issuer kvk and verified through kvk-zoeken', () => {
    const rsin = engine.derive(syntheticValid(), 'rsin');
    const issued = rsin.conclusions.find((each) => each.key === 'derive.issued-by');
    const verify = rsin.conclusions.find((each) => each.key === 'derive.verify-through');
    expect(issued?.params).toEqual({ scheme: 'rsin', authority: 'kvk' });
    expect(verify?.params).toEqual({ scheme: 'rsin', source: 'kvk-zoeken' });
    const derived = rsin.conclusions
      .filter((each) => each.key === 'derive.look-up-through')
      .map((each) => each.params.scheme);
    expect(derived).toEqual(['eori', 'oin']);
  });

  test('reference: a context country that agrees with the value still gives the instance', () => {
    const viaCtx = engine.derive('NL001469630', 'eori', { issuing_country: 'NL' });
    expect(viaCtx.conclusions[0]?.params.authority).toBe('douane-nl');
  });

  test('reference: no key or statement names a level or a VAT number from the EORI or RSIN', () => {
    for (const call of [result, engine.derive(syntheticValid(), 'rsin')]) {
      for (const each of call.conclusions) {
        expect(each.key).toMatch(/^derive\.(issued-by|verify-through|derivation|look-up-through)$/);
        expect(each.statement).not.toMatch(/level|VAT/i);
        expect(each.params.scheme === 'vat-nl' || each.params.scheme === 'vat').toBe(false);
      }
    }
  });

  test('reference: every conclusion has a step and the certainty of its weakest step', () => {
    for (const call of [result, engine.derive('NL001469630B01', 'vat-nl')]) {
      for (const each of call.conclusions) {
        expect(each.explanation.length).toBeGreaterThan(0);
        const weakest = Math.min(...each.explanation.map((step) => rank.get(step.certainty) ?? 0));
        expect(rank.get(each.certainty)).toBe(weakest);
      }
    }
  });
});
