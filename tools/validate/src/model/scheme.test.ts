import { describe, expect, test } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import {
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  schemeFixture,
  withRealModel,
} from './testing.ts';

const SCHEME = 'model/schemes/fixture-scheme.yaml';

/** The standard fixture set (source, authorities) plus `extra`, checked with the real model. */
const check = (extra: ModelFile | readonly ModelFile[]) =>
  checkModelFiles(
    withRealModel([
      fixtureSource(),
      ...fixtureAuthorities(),
      ...(Array.isArray(extra) ? extra : [extra as ModelFile]),
    ]),
  );

/** 1-based line and column of the first occurrence of `needle` in `text`, shifted by `shift`. */
function where(text: string, needle: string, shift = 0): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 + shift };
}

const scheme = (overrides: Record<string, string | undefined> = {}, extra = ''): ModelFile =>
  schemeFixture('fixture-scheme', minimalSchemeBody('fixture-scheme', overrides, extra));

/** Position of the value after `key: ` on its line. */
const atValue = (file: ModelFile, key: string, value: string) =>
  where(file.text, `${key}: ${value}`, key.length + 2);

describe('the minimal scheme: header fields under the default source (D-07, D-08)', () => {
  test('a scheme with header fields only gives no problem', () => {
    expect(check(scheme())).toEqual([]);
  });

  test('an issuer that names no authority is one error at that value', () => {
    const file = scheme({ issuer: 'no-such-authority' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...atValue(file, 'issuer', 'no-such-authority'),
        message: 'the value is not a known authority',
      },
    ]);
  });

  test('an issuer that names an authority instance is accepted (DEC-031)', () => {
    expect(check(scheme({ issuer: 'fixture-authority-nl' }))).toEqual([]);
  });

  test('a jurisdiction that names no jurisdiction is one error at that value', () => {
    const file = scheme({ jurisdiction: 'XX' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...atValue(file, 'jurisdiction', 'XX'),
        message: 'the value is not a known jurisdiction',
      },
    ]);
  });

  test('kind agency fails with the allowed values listed', () => {
    const file = scheme({ kind: 'agency' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...atValue(file, 'kind', 'agency'),
        message: 'must be one of: identifier, register, composite',
      },
    ]);
  });

  test('an unknown top-level key is an unknown-property error at that key', () => {
    const file = scheme({}, 'issuer_country: NL\n');
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'issuer_country'),
        message: 'unknown property "issuer_country"',
      },
    ]);
  });

  test('a label without English fails; scope and notes need no source (D-09)', () => {
    expect(check(scheme({}, 'scope:\n  en: Scope text\nnotes:\n  en: A note\n'))).toEqual([]);
    const bad = scheme({ label: '\n  nl: Alleen Nederlands' });
    expect(check(bad).map((problem) => problem.message)).toEqual([
      'missing required property "en"',
    ]);
  });

  test('an id that differs from the file name is reported by the file rule', () => {
    const file = schemeFixture('fixture-scheme', minimalSchemeBody('other-scheme'));
    expect(check(file).map((problem) => problem.message)).toEqual([
      'the id must equal the file name without .yaml: "fixture-scheme"',
    ]);
  });
});

describe('the default source (D-07)', () => {
  test('a scheme without sources is a missing-property error at 1:1', () => {
    expect(check(scheme({ sources: undefined }))).toEqual([
      { file: SCHEME, line: 1, column: 1, message: 'missing required property "sources"' },
    ]);
  });

  test('a default source that names no source is one error at that value', () => {
    const file = scheme({ sources: '\n  default: nope' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'default: nope', 'default: '.length),
        message: 'the value is not a known source',
      },
    ]);
  });

  test('an extra key beside default is an unknown-property error', () => {
    const file = scheme({ sources: '\n  default: fixture-source\n  extra: x' });
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'extra: x'), message: 'unknown property "extra"' },
    ]);
  });

  test('sources without default is a missing-property error', () => {
    const file = scheme({ sources: '\n  other: fixture-source' });
    expect(check(file).map((problem) => problem.message)).toEqual(
      expect.arrayContaining(['missing required property "default"']),
    );
  });
});

describe('the long form { value, source, certainty } (D-07)', () => {
  const long = (value: string, rest = 'source: fixture-source, certainty: likely') =>
    `{ value: ${value}, ${rest} }`;

  test('a long-form jurisdiction is accepted', () => {
    expect(check(scheme({ jurisdiction: long('NL') }))).toEqual([]);
  });

  test('a long-form value that names no jurisdiction fails at /jurisdiction/value', () => {
    const file = scheme({ jurisdiction: long('XX') });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'value: XX', 'value: '.length),
        message: 'the value is not a known jurisdiction',
      },
    ]);
  });

  test('a long form without source is a missing-property error at the field', () => {
    const file = scheme({ jurisdiction: '{ value: NL, certainty: likely }' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'jurisdiction:'),
        message: 'missing required property "source"',
      },
    ]);
  });

  test('a long form without certainty is a missing-property error at the field', () => {
    const file = scheme({ jurisdiction: '{ value: NL, source: fixture-source }' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'jurisdiction:'),
        message: 'missing required property "certainty"',
      },
    ]);
  });

  test('a certainty outside the vocabulary fails at that value', () => {
    const file = scheme({ jurisdiction: long('NL', 'source: fixture-source, certainty: sure') });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'certainty: sure', 'certainty: '.length),
        message: 'the value is not a known member of vocabulary certainty',
      },
    ]);
  });

  test('a long form with an extra key is an unknown-property error', () => {
    const file = scheme({
      jurisdiction: `{ value: NL, source: fixture-source, certainty: likely, extra: 1 }`,
    });
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'extra: 1'), message: 'unknown property "extra"' },
    ]);
  });

  test('every header field accepts the long form', () => {
    const file = scheme({
      kind: long('identifier'),
      issuer: long('fixture-authority'),
      jurisdiction: long('NL'),
      abbreviation: long('FIX'),
      availability: long('public'),
      iso6523_icd: long('"0106"'),
      peppol_eas: long('"9944"'),
    });
    expect(check(file)).toEqual([]);
  });

  test('every header field in long form and no sources: one missing "sources" at 1:1', () => {
    const file = scheme({
      sources: undefined,
      kind: long('identifier'),
      issuer: long('fixture-authority'),
      jurisdiction: long('NL'),
      abbreviation: long('FIX'),
      availability: long('public'),
      iso6523_icd: long('"0106"'),
      peppol_eas: long('"9944"'),
    });
    expect(check(file)).toEqual([
      { file: SCHEME, line: 1, column: 1, message: 'missing required property "sources"' },
    ]);
  });

  test('a source cited only by a long-form header field gives no uncited-source warning', () => {
    const file = scheme({
      jurisdiction: long('NL', 'source: fixture-source-long, certainty: likely'),
    });
    expect(check([fixtureSource('fixture-source-long'), file])).toEqual([]);
  });
});

describe('ICD and EAS codes (D-19, DEC-036)', () => {
  test.for([
    ['iso6523_icd', '"0106"'],
    ['iso6523_icd', 'null'],
    ['peppol_eas', '"9944"'],
    ['peppol_eas', 'null'],
  ] as const)('%s: %s is accepted', ([key, value]) => {
    expect(check(scheme({ [key]: value }))).toEqual([]);
  });

  test.for([
    ['iso6523_icd', '"106"'],
    ['iso6523_icd', '"01060"'],
    ['peppol_eas', '"99"'],
    ['peppol_eas', '"abcd"'],
  ] as const)('%s: %s fails at the value with the pattern', ([key, value]) => {
    const file = scheme({ [key]: value });
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...atValue(file, key, value) });
    expect(problems[0]?.message).toContain('pattern');
  });

  test('a long form whose value is not four digits fails at /value', () => {
    const file = scheme({
      iso6523_icd: '{ value: "106", source: fixture-source, certainty: certain }',
    });
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ ...where(file.text, 'value: "106"', 'value: '.length) });
  });

  test('an unquoted 0106 gives exactly one problem, the quoting hint, at the scalar', () => {
    const file = scheme({ iso6523_icd: '0106' });
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...atValue(file, 'iso6523_icd', '0106'),
        message:
          'a bare number with a leading zero or more than 15 digits loses digits in YAML; quote it',
      },
    ]);
  });

  test('an unquoted 9944 is a number, not a string: one type error at the value', () => {
    const file = scheme({ peppol_eas: '9944' });
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(atValue(file, 'peppol_eas', '9944'));
  });

  test('absent codes and two null codes both validate (no code recorded)', () => {
    expect(check(scheme({ iso6523_icd: undefined, peppol_eas: undefined }))).toEqual([]);
    expect(check(scheme({ iso6523_icd: 'null', peppol_eas: 'null' }))).toEqual([]);
  });
});

/** A second scheme, the target of relations and rules in the statement tests. */
const target = (): ModelFile =>
  schemeFixture('fixture-target', minimalSchemeBody('fixture-target', { abbreviation: 'TGT' }));

const checkWithTarget = (file: ModelFile) => check([target(), file]);

const OK = 'certainty: likely, source: fixture-source';

/** One valid entry per statement kind; certainty and source come last so the table can edit them. */
const KINDS: readonly {
  key: string;
  yaml: string;
  /** What the entry starts with, for its position. */
  needle: string;
  shift: number;
}[] = [
  {
    key: 'level',
    yaml: `level:\n  - { value: legal-entity-top-level, condition: { issuing_country: NL }, ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'roles',
    yaml: `roles:\n  - { value: economic-operator, ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'applicability',
    yaml: `applicability:\n  - { jurisdiction: EU, status: [issued, recognised, verifiable], certainty: certain, source: fixture-source, note: "free text" }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'persistence',
    yaml: `persistence:\n  - { event: merger, behaviour: "Unchanged if the entity persists", ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'trust',
    yaml: `trust: { legal_basis: 1, registration_quality: 1, verifiability: 0, crosswalks: 1, lifecycle: null, certainty: certain, source: fixture-source }\n`,
    needle: 'trust:',
    shift: 0,
  },
  {
    key: 'relations',
    yaml: `relations:\n  - { kind: specializes, target: fixture-target, ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'legal_basis',
    yaml: `legal_basis:\n  - { title: "A law", url: "https://example.org/law", eli: "http://data.europa.eu/eli/reg/2013/952/oj", ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    key: 'validation_source',
    yaml: `validation_source: { label: "A check page", url: "https://example.org/check", ${OK} }\n`,
    needle: 'validation_source:',
    shift: 0,
  },
  {
    key: 'mandatory',
    yaml: `mandatory: { text: "Required for exporters", ${OK} }\n`,
    needle: 'mandatory:',
    shift: 0,
  },
];

describe('every statement kind carries its own source and certainty (D-07, DEC-029)', () => {
  test('one valid entry of each kind gives no problem', () => {
    const body = KINDS.map((kind) => kind.yaml).join('');
    expect(checkWithTarget(scheme({}, body))).toEqual([]);
  });

  test.for(KINDS.map((kind) => [kind.key, kind] as const))(
    '%s without source fails at the entry',
    ([, kind]) => {
      const file = scheme({}, kind.yaml.replace(/, source: fixture-source/, ''));
      expect(checkWithTarget(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, kind.needle, kind.shift),
          message: 'missing required property "source"',
        },
      ]);
    },
  );

  test.for(KINDS.map((kind) => [kind.key, kind] as const))(
    '%s without certainty fails at the entry',
    ([, kind]) => {
      const file = scheme({}, kind.yaml.replace(/certainty: (likely|certain), /, ''));
      expect(checkWithTarget(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, kind.needle, kind.shift),
          message: 'missing required property "certainty"',
        },
      ]);
    },
  );

  test.for(KINDS.map((kind) => [kind.key, kind] as const))(
    '%s with certainty sure fails at the sure value',
    ([, kind]) => {
      const file = scheme({}, kind.yaml.replace(/certainty: (likely|certain)/, 'certainty: sure'));
      expect(checkWithTarget(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, 'certainty: sure', 'certainty: '.length),
          message: 'the value is not a known member of vocabulary certainty',
        },
      ]);
    },
  );

  test.for(KINDS.map((kind) => [kind.key, kind] as const))(
    '%s with a source that names no source fails at that value',
    ([, kind]) => {
      const file = scheme({}, kind.yaml.replace(/source: fixture-source/, 'source: nope'));
      expect(checkWithTarget(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, 'source: nope', 'source: '.length),
          message: 'the value is not a known source',
        },
      ]);
    },
  );

  test('a statement note is free text covered by the statement source', () => {
    const body = `roles:\n  - { value: taxpayer, ${OK}, note: "Any text here" }\n`;
    expect(checkWithTarget(scheme({}, body))).toEqual([]);
  });

  test('a statement with an unknown key is an unknown-property error', () => {
    const body = `roles:\n  - { value: taxpayer, ${OK}, extra: 1 }\n`;
    const file = scheme({}, body);
    expect(checkWithTarget(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'extra: 1'), message: 'unknown property "extra"' },
    ]);
  });

  test('level and role values come from their vocabularies', () => {
    const level = scheme({}, `level:\n  - { value: company, ${OK} }\n`);
    expect(checkWithTarget(level)).toEqual([
      {
        file: SCHEME,
        ...where(level.text, 'value: company', 'value: '.length),
        message: 'the value is not a known member of vocabulary level',
      },
    ]);
    const role = scheme({}, `roles:\n  - { value: wizard, ${OK} }\n`);
    expect(checkWithTarget(role)).toEqual([
      {
        file: SCHEME,
        ...where(role.text, 'value: wizard', 'value: '.length),
        message: 'the value is not a known member of vocabulary role',
      },
    ]);
  });
});

describe('conditions (SPEC 5.3)', () => {
  const withCondition = (condition: string): ModelFile =>
    scheme({}, `roles:\n  - { value: taxpayer, condition: ${condition}, ${OK} }\n`);

  test.for([
    '{ issuing_country: "!NL" }',
    '{ issuing_country: NL }',
    '{ entity_form: sole-proprietorship }',
    '{ issuing_country: EU, entity_form: legal-person }',
  ])('%s is accepted', (condition) => {
    expect(checkWithTarget(withCondition(condition))).toEqual([]);
  });

  test('a negated jurisdiction that does not exist fails at the value', () => {
    const file = withCondition('{ issuing_country: "!XX" }');
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, '"!XX"'),
        message: 'the value is not a known jurisdiction',
      },
    ]);
  });

  test('an entity_form outside the vocabulary fails at the value', () => {
    const file = withCondition('{ entity_form: trust-fund }');
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'trust-fund'),
        message: 'the value is not a known member of vocabulary entity-form',
      },
    ]);
  });

  test('a context tag fails while the condition-context vocabulary is empty', () => {
    const file = withCondition('{ context: anything }');
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'anything'),
        message: 'the value is not a known member of vocabulary condition-context',
      },
    ]);
  });

  test('an empty condition fails', () => {
    const file = withCondition('{}');
    const problems = checkWithTarget(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ ...where(file.text, '{}') });
    expect(problems[0]?.message).toContain('fewer than 1');
  });

  test('an unknown condition key fails as an unknown property', () => {
    const file = withCondition('{ region: NL }');
    expect(checkWithTarget(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'region'), message: 'unknown property "region"' },
    ]);
  });
});

describe('relations (MOD-03)', () => {
  test('a relation target that names no scheme fails at the value', () => {
    const file = scheme(
      {},
      `relations:\n  - { kind: specializes, target: no-such-scheme, ${OK} }\n`,
    );
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'target: no-such-scheme', 'target: '.length),
        message: 'the value is not a known scheme',
      },
    ]);
  });

  test('a relation kind outside the vocabulary fails at the value', () => {
    const file = scheme({}, `relations:\n  - { kind: cousin-of, target: fixture-target, ${OK} }\n`);
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'kind: cousin-of', 'kind: '.length),
        message: 'the value is not a known member of vocabulary relation-kind',
      },
    ]);
  });
});

describe('trust sub-scores (DAT-08)', () => {
  const trust = (fields: string): ModelFile =>
    scheme({}, `trust: { ${fields}, certainty: certain, source: fixture-source }\n`);
  const FULL =
    'legal_basis: 1, registration_quality: 1, verifiability: 0, crosswalks: 1, lifecycle: null';

  test('all five sub-scores, some null, are accepted', () => {
    expect(checkWithTarget(trust(FULL))).toEqual([]);
    expect(
      checkWithTarget(
        trust(
          'legal_basis: 2, registration_quality: null, verifiability: null, crosswalks: 0, lifecycle: 1',
        ),
      ),
    ).toEqual([]);
  });

  test.for([
    ['legal_basis: 3', 'legal_basis: 1', 'must be <= 2'],
    ['legal_basis: -1', 'legal_basis: 1', 'must be >= 0'],
    ['verifiability: 2', 'verifiability: 0', 'must be <= 1'],
    ['crosswalks: 0.5', 'crosswalks: 1', 'must be integer or null'],
    ['lifecycle: "high"', 'lifecycle: null', 'must be integer or null'],
  ] as const)('%s fails at the value', ([bad, good, message]) => {
    const file = trust(FULL.replace(good, bad));
    const key = bad.split(':')[0] as string;
    const problems = checkWithTarget(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...where(file.text, `${key}: `, key.length + 2),
      message,
    });
  });

  test('a missing sub-score is a missing-property error', () => {
    const file = trust(FULL.replace(', lifecycle: null', ''));
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'trust:'),
        message: 'missing required property "lifecycle"',
      },
    ]);
  });
});

describe('applicability status', () => {
  const applicability = (status: string): ModelFile =>
    scheme({}, `applicability:\n  - { jurisdiction: NL, status: ${status}, ${OK} }\n`);

  test('an empty status list fails', () => {
    const file = applicability('[]');
    const problems = checkWithTarget(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('fewer than 1');
  });

  test('a repeated status fails', () => {
    const problems = checkWithTarget(applicability('[issued, issued]'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('duplicate');
  });

  test('a status outside the vocabulary fails at the value', () => {
    const file = applicability('[granted]');
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'granted'),
        message: 'the value is not a known member of vocabulary applicability-status',
      },
    ]);
  });

  test('a jurisdiction that does not exist fails at the value', () => {
    const file = scheme({}, `applicability:\n  - { jurisdiction: XX, status: [issued], ${OK} }\n`);
    expect(checkWithTarget(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'jurisdiction: XX', 'jurisdiction: '.length),
        message: 'the value is not a known jurisdiction',
      },
    ]);
  });
});
