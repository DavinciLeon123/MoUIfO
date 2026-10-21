import { describe, expect, test } from 'vitest';
import type { ApplicabilityStatus } from './applicability.ts';
import { createEngine } from './engine.ts';
import type { ApplicabilityEntry } from './model-types.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);

const STATUS_ORDER = ['issued', 'recognised', 'verifiable', 'not-applicable'];

function statusesOf(schemeId: string, jurisdiction: string): ApplicabilityStatus[] {
  const result = engine.applicability(schemeId, jurisdiction);
  if (result.data === null) throw new Error('the scheme and jurisdiction must resolve');
  return result.data.statuses;
}

function entry(
  jurisdiction: string,
  status: string[],
  more: Partial<ApplicabilityEntry> = {},
): ApplicabilityEntry {
  return { jurisdiction, status, certainty: 'certain', source: 'fx-law', ...more };
}

function fixtureEngine(...entries: ApplicabilityEntry[]) {
  return createEngine(fixtureModel({ schemes: [fixtureScheme('xx', { applicability: entries })] }));
}

function view(statuses: ApplicabilityStatus[]) {
  return statuses.map((each) => [each.status, each.basis, each.from, each.certainty]);
}

describe('applicability on the real model', () => {
  test('eori in NL: recognised and verifiable are inherited from the EU at likely, issued is no-data', () => {
    const statuses = statusesOf('eori', 'NL');
    expect(statuses.map((each) => each.status)).toEqual(STATUS_ORDER);
    expect(view(statuses)).toEqual([
      ['issued', 'no-data', null, null],
      ['recognised', 'inherited', 'EU', 'likely'],
      ['verifiable', 'inherited', 'EU', 'likely'],
      ['not-applicable', 'no-data', null, null],
    ]);
  });

  test('an inherited explanation is the EU fact, the part_of fact and the inherits_down assumption', () => {
    const recognised = statusesOf('eori', 'NL')[1];
    expect(recognised?.explanation.map((step) => [step.kind, step.ref, step.certainty])).toEqual([
      ['fact', 'eori/applicability/0', 'certain'],
      ['fact', 'jurisdictions/NL/part_of/0', 'certain'],
      ['assumption', 'vocab/applicability-status/recognised/inherits_down', 'likely'],
    ]);
    expect(recognised?.explanation.map((step) => step.source?.id ?? null)).toEqual([
      'commission-eori',
      'teu-art-52',
      null,
    ]);
    const verifiable = statusesOf('eori', 'NL')[2];
    expect(verifiable?.explanation[0]?.ref).toBe('eori/applicability/1');
    expect(verifiable?.explanation[0]?.source?.id).toBe('eori-validation');
  });

  test('eori in XI: issued and recognised are stated at certain, nothing flows from GB or the EU', () => {
    expect(view(statusesOf('eori', 'XI'))).toEqual([
      ['issued', 'stated', null, 'certain'],
      ['recognised', 'stated', null, 'certain'],
      ['verifiable', 'no-data', null, null],
      ['not-applicable', 'no-data', null, null],
    ]);
  });

  test('eori in the EU: issued, recognised and verifiable are stated', () => {
    expect(view(statusesOf('eori', 'EU'))).toEqual([
      ['issued', 'stated', null, 'certain'],
      ['recognised', 'stated', null, 'certain'],
      ['verifiable', 'stated', null, 'certain'],
      ['not-applicable', 'no-data', null, null],
    ]);
  });

  test('vat-nl in NL: issued is stated and verifiable is inherited from the EU', () => {
    expect(view(statusesOf('vat-nl', 'NL'))).toEqual([
      ['issued', 'stated', null, 'certain'],
      ['recognised', 'no-data', null, null],
      ['verifiable', 'inherited', 'EU', 'likely'],
      ['not-applicable', 'no-data', null, null],
    ]);
  });

  test('kvk-number in BE: every status is no-data and nothing says not applicable', () => {
    const result = engine.applicability('kvk-number', 'BE');
    expect(result.data?.statuses.map((each) => each.basis)).toEqual([
      'no-data',
      'no-data',
      'no-data',
      'no-data',
    ]);
    expect(result.conclusions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('over every scheme and jurisdiction: no inherited result is certain or issued, no-data is empty', () => {
    for (const schemeId of Object.keys(model.schemes)) {
      for (const jurisdiction of Object.keys(model.jurisdictions)) {
        const result = engine.applicability(schemeId, jurisdiction);
        const data = result.data;
        if (data === null) throw new Error('every model id must resolve');
        expect(data.statuses.map((each) => each.status)).toEqual(STATUS_ORDER);
        for (const each of data.statuses) {
          if (each.basis === 'inherited') {
            expect(each.certainty).not.toBe('certain');
            expect(each.status).not.toBe('issued');
            expect(each.status).not.toBe('not-applicable');
            expect(each.explanation.some((step) => step.kind === 'assumption')).toBe(true);
          }
          if (each.basis === 'no-data') {
            expect(each.certainty).toBeNull();
            expect(each.explanation).toEqual([]);
          }
        }
        const given = data.statuses.filter((each) => each.basis !== 'no-data');
        expect(result.conclusions).toHaveLength(given.length);
        for (const each of result.conclusions) {
          expect(['applicability.stated', 'applicability.inherited']).toContain(each.key);
          if (each.params.status === 'not-applicable')
            expect(each.key).toBe('applicability.stated');
        }
      }
    }
  });

  test('a stated and an inherited result each yield one conclusion with the right key and params', () => {
    const result = engine.applicability('vat-nl', 'NL');
    expect(result.conclusions.map((each) => each.key)).toEqual([
      'applicability.stated',
      'applicability.inherited',
    ]);
    expect(result.conclusions[1]?.params).toEqual({
      scheme: 'vat-nl',
      jurisdiction: 'NL',
      status: 'verifiable',
      from: 'EU',
    });
    expect(result.conclusions[1]?.certainty).toBe('likely');
    expect(result.conclusions[0]?.certainty).toBe('certain');
    expect(result.conclusions[1]?.statement).toContain('inherited from');
  });

  test('EL resolves to GR through the country-prefix vocabulary', () => {
    const result = engine.applicability('eori', 'EL');
    expect(result.data?.jurisdiction).toBe('GR');
    expect(result.data?.statuses[1]?.from).toBe('EU');
  });

  test('is deterministic and a returned result can be changed without effect on the next', () => {
    const first = engine.applicability('eori', 'NL');
    expect(engine.applicability('eori', 'NL')).toEqual(first);
    first.data?.statuses.pop();
    first.data?.statuses[1]?.explanation.pop();
    expect(engine.applicability('eori', 'NL').data?.statuses).toHaveLength(4);
    expect(engine.applicability('eori', 'NL').data?.statuses[1]?.explanation).toHaveLength(3);
  });
});

describe('applicability on fixtures', () => {
  test('recognised stated at CC is inherited by AA through two part_of steps', () => {
    const result = fixtureEngine(entry('CC', ['recognised'])).applicability('xx', 'AA');
    const recognised = result.data?.statuses[1];
    expect(recognised?.basis).toBe('inherited');
    expect(recognised?.from).toBe('CC');
    expect(recognised?.certainty).toBe('likely');
    expect(recognised?.explanation.map((step) => step.ref)).toEqual([
      'xx/applicability/0',
      'jurisdictions/AA/part_of/0',
      'jurisdictions/BB/part_of/0',
      'vocab/applicability-status/recognised/inherits_down',
    ]);
  });

  test('the nearest ancestor wins and ties go by id (DD has BB and CC at depth 1)', () => {
    const both = fixtureEngine(
      entry('CC', ['recognised'], { certainty: 'possible' }),
      entry('BB', ['recognised']),
    ).applicability('xx', 'DD');
    expect(both.data?.statuses[1]?.from).toBe('BB');
    expect(both.data?.statuses[1]?.explanation[0]?.ref).toBe('xx/applicability/1');
    const farOnly = fixtureEngine(entry('CC', ['recognised'])).applicability('xx', 'DD');
    expect(farOnly.data?.statuses[1]?.from).toBe('CC');
    expect(farOnly.data?.statuses[1]?.explanation.map((step) => step.ref)).toContain(
      'jurisdictions/DD/part_of/1',
    );
  });

  test('a stated not-applicable leaves every other unstated status of the jurisdiction as no-data', () => {
    const result = fixtureEngine(
      entry('AA', ['not-applicable']),
      entry('CC', ['recognised', 'verifiable']),
    ).applicability('xx', 'AA');
    expect(view(result.data?.statuses ?? [])).toEqual([
      ['issued', 'no-data', null, null],
      ['recognised', 'no-data', null, null],
      ['verifiable', 'no-data', null, null],
      ['not-applicable', 'stated', null, 'certain'],
    ]);
  });

  test('a stated status beats an inherited one', () => {
    const result = fixtureEngine(
      entry('AA', ['recognised'], { certainty: 'possible' }),
      entry('CC', ['recognised']),
    ).applicability('xx', 'AA');
    const recognised = result.data?.statuses[1];
    expect(recognised?.basis).toBe('stated');
    expect(recognised?.certainty).toBe('possible');
  });

  test('issued and not-applicable are never inherited', () => {
    const result = fixtureEngine(entry('CC', ['issued', 'not-applicable'])).applicability(
      'xx',
      'AA',
    );
    expect(result.data?.statuses.map((each) => each.basis)).toEqual([
      'no-data',
      'no-data',
      'no-data',
      'no-data',
    ]);
  });

  test('a stated entry with a condition carries an assumption step and is at most likely', () => {
    const result = fixtureEngine(
      entry('AA', ['issued'], { condition: { entity_form: 'legal-person' } }),
    ).applicability('xx', 'AA');
    const issued = result.data?.statuses[0];
    expect(issued?.basis).toBe('stated');
    expect(issued?.certainty).toBe('likely');
    expect(issued?.explanation.map((step) => step.kind)).toEqual(['fact', 'assumption']);
  });

  test('the order of the status vocabulary decides the order of the result', () => {
    const reversed = fixtureModel({
      schemes: [fixtureScheme('xx', { applicability: [entry('AA', ['issued'])] })],
    });
    const vocabulary = reversed.vocab['applicability-status'];
    if (vocabulary === undefined) throw new Error('the fixture needs the vocabulary');
    reversed.vocab['applicability-status'] = {
      ...vocabulary,
      values: [...vocabulary.values].reverse(),
    };
    const result = createEngine(reversed).applicability('xx', 'AA');
    expect(result.data?.statuses.map((each) => each.status)).toEqual([...STATUS_ORDER].reverse());
  });
});

describe('applicability bad input', () => {
  test.for(['DE', '__proto__', 'constructor', 'eu', ''])(
    'unknown jurisdiction %j gives null data and unknown-jurisdiction without echoing it',
    (jurisdiction) => {
      const result = engine.applicability('eori', jurisdiction);
      expect(result.data).toBeNull();
      expect(result.conclusions).toEqual([]);
      expect(result.warnings.map((warning) => warning.code)).toEqual(['unknown-jurisdiction']);
      if (jurisdiction !== '') expect(JSON.stringify(result.warnings)).not.toContain(jurisdiction);
    },
  );

  test.for(['__proto__', 'constructor', 'EORI', 'nope'])(
    'unknown scheme %j gives null data and unknown-scheme without echoing it',
    (schemeId) => {
      const result = engine.applicability(schemeId, 'NL');
      expect(result.data).toBeNull();
      expect(result.warnings.map((warning) => warning.code)).toEqual(['unknown-scheme']);
      expect(JSON.stringify(result.warnings)).not.toContain(schemeId);
    },
  );

  test('an unknown scheme and an unknown jurisdiction give both warnings', () => {
    const result = engine.applicability('nope', 'DE');
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'unknown-scheme',
      'unknown-jurisdiction',
    ]);
  });

  test.for([
    [7, 'NL'],
    ['eori', 7],
    [null, undefined],
    [{}, 'NL'],
  ])('non-string arguments %j give invalid-input', ([schemeId, jurisdiction]) => {
    const result = engine.applicability(schemeId as never, jurisdiction as never);
    expect(result.data).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(['invalid-input']);
  });
});
