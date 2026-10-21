import { describe, expect, test } from 'vitest';
import { compileModel } from './compile.ts';
import { createEngine } from './engine.ts';
import type { Model } from './model-types.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';

// The one public, allow-listed value of the acceptance case (SPEC §10).
const EORI_VALUE = 'NL001469630';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const each of Object.values(value)) deepFreeze(each);
  }
  return value;
}

const claim = { certainty: 'certain', source: 'fx-law' } as const;

describe('createEngine on the real model', () => {
  test('works on a deep-frozen copy and gives the same result as on an unfrozen copy', () => {
    const frozen = deepFreeze(structuredClone(loadDistModel()));
    const plain = structuredClone(loadDistModel());
    expect(createEngine(frozen).recognise(EORI_VALUE)).toEqual(
      createEngine(plain).recognise(EORI_VALUE),
    );
  });

  test('does not change the model it compiles', () => {
    const model = loadDistModel();
    const before = JSON.stringify(model);
    createEngine(model).recognise(EORI_VALUE);
    expect(JSON.stringify(model)).toBe(before);
  });

  test('returns a frozen engine whose repeated calls give equal results', () => {
    const engine = createEngine(loadDistModel());
    expect(Object.isFrozen(engine)).toBe(true);
    expect(engine.recognise(EORI_VALUE)).toEqual(engine.recognise(EORI_VALUE));
  });

  test('refuses a model of another contract', () => {
    const model = { ...loadDistModel(), contract: 2 } as Model;
    expect(() => createEngine(model)).toThrow('this engine reads model contract 1');
  });

  test('the result does not depend on the insertion order of the model tables', () => {
    const model = loadDistModel();
    const reversed: Model = {
      ...model,
      schemes: Object.fromEntries(Object.entries(model.schemes).reverse()),
    };
    expect(createEngine(reversed).recognise(`${EORI_VALUE}B01`)).toEqual(
      createEngine(model).recognise(`${EORI_VALUE}B01`),
    );
  });
});

describe('createEngine compile errors', () => {
  test('one Error lists every problem with its model path and none of an input', () => {
    const bad = fixtureScheme('bad', {
      format: { patterns: [{ regex: '(', ...claim }] },
      rules: [
        {
          id: 'bad-rule',
          input: 'bad',
          output: 'bad',
          transform: [{ strip_prefix: -1 }],
          ...claim,
        },
      ],
    });
    let message = '';
    try {
      createEngine(fixtureModel({ schemes: [bad] }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.startsWith('invalid model:')).toBe(true);
    expect(message).toContain('schemes/bad/format/patterns/0/regex');
    expect(message).toContain('rules/bad-rule/transform/0');
  });

  test('a context_from capture whose group does not exist is a problem', () => {
    const scheme = fixtureScheme('cap', {
      context_from: {
        issuing_country: {
          capture: { regex: '^([A-Z]{2})', group: 3 },
          map: 'country-prefix',
          ...claim,
        },
      },
    });
    expect(() => createEngine(fixtureModel({ schemes: [scheme] }))).toThrow(
      'schemes/cap/context_from/issuing_country/capture',
    );
  });

  test('a rule id used twice is a problem', () => {
    const rule = {
      id: 'twice',
      input: 'one',
      output: 'two',
      transform: ['uppercase'],
      ...claim,
    };
    const one = fixtureScheme('one', { rules: [rule] });
    const two = fixtureScheme('two', { rules: [rule] });
    expect(() => createEngine(fixtureModel({ schemes: [one, two] }))).toThrow('rules/twice');
  });
});

describe('compileModel tables', () => {
  const compiled = compileModel(
    fixtureModel({
      schemes: [
        fixtureScheme('zz', {
          rules: [{ id: 'r-b', input: 'aa', output: 'zz', transform: ['uppercase'], ...claim }],
        }),
        fixtureScheme('aa', {
          rules: [
            { id: 'r-z', input: 'aa', output: 'zz', transform: ['uppercase'], ...claim },
            { id: 'r-a', input: 'aa', output: 'zz', transform: [{ add_prefix: 'X' }], ...claim },
          ],
        }),
      ],
    }),
  );

  test('scheme ids and rule lists are sorted by code unit', () => {
    expect(compiled.schemeIds).toEqual(['aa', 'zz']);
    expect(compiled.rulesByInput.get('aa')).toEqual(['r-a', 'r-b', 'r-z']);
    expect(compiled.rules.get('r-a')?.run('v')).toBe('Xv');
    expect(compiled.rules.get('r-b')?.owner).toBe('zz');
  });

  test('ancestors are nearest first with the part_of hops, and no ancestor twice', () => {
    expect(compiled.ancestors.get('AA')).toEqual([
      { jurisdiction: 'BB', depth: 1, chain: [{ jurisdiction: 'AA', index: 0 }] },
      {
        jurisdiction: 'CC',
        depth: 2,
        chain: [
          { jurisdiction: 'AA', index: 0 },
          { jurisdiction: 'BB', index: 0 },
        ],
      },
    ]);
    expect(compiled.ancestors.get('DD')).toEqual([
      { jurisdiction: 'BB', depth: 1, chain: [{ jurisdiction: 'DD', index: 0 }] },
      { jurisdiction: 'CC', depth: 1, chain: [{ jurisdiction: 'DD', index: 1 }] },
    ]);
    expect(compiled.ancestors.get('CC')).toEqual([]);
  });

  test('prefixes, statuses and vocabularies are read from the model', () => {
    expect(compiled.prefixes.get('AA')?.jurisdiction).toBe('AA');
    expect(compiled.statuses.map((s) => [s.id, s.inherits_down])).toEqual([
      ['issued', false],
      ['recognised', true],
      ['verifiable', true],
      ['not-applicable', false],
    ]);
    expect([...compiled.entityForms].sort()).toEqual([
      'fiscal-unit',
      'legal-person',
      'sole-proprietorship',
    ]);
    expect(compiled.contextTags.size).toBe(0);
  });

  test('prototype keys are not tables', () => {
    expect(compiled.schemes.get('constructor')).toBeUndefined();
    expect(compiled.sources.get('__proto__')).toBeUndefined();
    expect(compiled.prefixes.get('toString')).toBeUndefined();
  });
});
