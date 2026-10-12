import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRANSFORM_OPERATIONS } from '@uio/engine';
import { describe, expect, test } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { SCHEMA_DIR } from './schema.ts';
import {
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  schemeFixture,
  withRealModel,
} from './testing.ts';

const SCHEME = 'model/schemes/fixture-scheme.yaml';
const QUOTING_HINT =
  'a bare number with a leading zero or more than 15 digits loses digits in YAML; quote it';

const target = (extra = ''): ModelFile =>
  schemeFixture(
    'fixture-target',
    minimalSchemeBody('fixture-target', { abbreviation: 'TGT' }, extra),
  );

/** The standard fixture set plus the target scheme and `files`, checked with the real model. */
const check = (...files: ModelFile[]) =>
  checkModelFiles(
    withRealModel([
      fixtureSource(),
      ...fixtureAuthorities(),
      ...(files.some((file) => file.path.endsWith('/fixture-target.yaml')) ? [] : [target()]),
      ...files,
    ]),
  );

const scheme = (extra: string, overrides: Record<string, string | undefined> = {}): ModelFile =>
  schemeFixture('fixture-scheme', minimalSchemeBody('fixture-scheme', overrides, extra));

/** 1-based line and column of the first occurrence of `needle` in `text`, shifted by `shift`. */
function where(text: string, needle: string, shift = 0): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 + shift };
}

const OK = 'certainty: likely, source: fixture-source';
const OVER = '[{ capture: { regex: "^NL([0-9]{9})B[0-9]{2}$", group: 1 } }]';

const VAT_STYLE = `format:
  patterns:
    - { regex: "^NL[0-9]{9}B[0-9]{2}$", certainty: certain, source: fixture-source }
  checksum:
    - { algorithm: elfproef, over: ${OVER}, certainty: certain, source: fixture-source }
    - { algorithm: iso7064-mod97-10, certainty: likely, source: fixture-source }
  examples_valid: ["NL001469630B01"]
  examples_invalid: ["NL00146963", "001469630"]
context_from:
  issuing_country:
    capture: { regex: "^([A-Z]{2})", group: 1 }
    map: country-prefix
    certainty: certain
    source: fixture-source
rules:
  - id: fixture-rule
    input: fixture-target
    output: fixture-scheme
    transform: [{ add_prefix: "NL" }]
    certainty: likely
    source: fixture-source
    examples:
      - { in: "001469630", out: "NL001469630" }
`;

describe('a vat-nl-style scheme (D-18, D-21, D-22, D-23)', () => {
  test('patterns, any-of checksum with over, string examples, context_from and a rule pass', () => {
    expect(check(scheme(VAT_STYLE))).toEqual([]);
  });

  test('an unquoted examples_valid number is one problem, the quoting hint, at that scalar', () => {
    const file = scheme('format:\n  examples_valid: [001469630]\n');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, '001469630'), message: QUOTING_HINT },
    ]);
  });

  test('an unquoted examples_invalid number is one problem at that scalar', () => {
    const file = scheme('format:\n  examples_invalid: [NL00146963, 001469630]\n');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, '001469630'), message: QUOTING_HINT },
    ]);
  });

  test('an unquoted rule example is one problem at that scalar', () => {
    const body = `rules:\n  - { id: r, input: fixture-target, output: fixture-scheme, transform: [uppercase], ${OK}, examples: [{ in: 001469630, out: "x" }] }\n`;
    const file = scheme(body);
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, '001469630'), message: QUOTING_HINT },
    ]);
  });

  test('a plain number in examples_valid without leading zero is a type error at the value', () => {
    const file = scheme('format:\n  examples_valid: [12345678]\n');
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      ...where(file.text, '12345678'),
      message: 'must be string',
    });
  });

  test('format needs no pattern and no checksum (no mandatory-pattern rule)', () => {
    expect(check(scheme('format:\n  examples_invalid: ["x"]\n'))).toEqual([]);
    expect(check(scheme('format: {}\n'))).toEqual([]);
  });

  test('checksum null fails: it must be an array (DEC-004)', () => {
    const file = scheme('format:\n  checksum: null\n');
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'checksum: null', 'checksum: '.length),
        message: 'must be array',
      },
    ]);
  });

  test('a checksum algorithm outside the vocabulary fails at the value', () => {
    const file = scheme(`format:\n  checksum:\n    - { algorithm: luhn, ${OK} }\n`);
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'algorithm: luhn', 'algorithm: '.length),
        message: '"luhn" is not a known member of vocabulary checksum',
      },
    ]);
  });

  test('an over step outside the transform set fails as an unknown property', () => {
    const file = scheme(
      `format:\n  checksum:\n    - { algorithm: elfproef, over: [{ shout: 1 }], ${OK} }\n`,
    );
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'shout'), message: 'unknown property "shout"' },
    ]);
  });

  test('format with an unknown key is an unknown-property error', () => {
    const file = scheme('format:\n  extra: 1\n');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'extra'), message: 'unknown property "extra"' },
    ]);
  });
});

/** One valid block per statement kind of this task, source last so the table can edit it. */
const BLOCKS: readonly { name: string; yaml: string; needle: string; shift: number }[] = [
  {
    name: 'rule',
    yaml: `rules:\n  - { id: r, input: fixture-target, output: fixture-scheme, transform: [uppercase], ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    name: 'pattern',
    yaml: `format:\n  patterns:\n    - { regex: "^x$", ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    name: 'checksum entry',
    yaml: `format:\n  checksum:\n    - { algorithm: elfproef, ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
  {
    name: 'context_from',
    yaml: `context_from:\n  issuing_country: { capture: { regex: "^([A-Z]{2})", group: 1 }, map: country-prefix, ${OK} }\n`,
    needle: 'issuing_country:',
    shift: 0,
  },
  {
    name: 'component',
    yaml: `components:\n  - { prefix: "0106", scheme: fixture-target, ${OK} }\n`,
    needle: '- {',
    shift: 2,
  },
];

const COMPOSITE = { kind: 'composite' };

describe('every format, context_from, component and rule statement carries source and certainty', () => {
  const withBlock = (block: (typeof BLOCKS)[number], yaml: string): ModelFile =>
    scheme(yaml, block.name === 'component' ? COMPOSITE : {});

  test('one valid block of each kind passes', () => {
    for (const block of BLOCKS) {
      expect(check(withBlock(block, block.yaml)), block.name).toEqual([]);
    }
  });

  test.for(BLOCKS.map((block) => [block.name, block] as const))(
    '%s without source fails at the entry',
    ([, block]) => {
      const file = withBlock(block, block.yaml.replace(/, source: fixture-source/, ''));
      expect(check(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, block.needle, block.shift),
          message: 'missing required property "source"',
        },
      ]);
    },
  );

  test.for(BLOCKS.map((block) => [block.name, block] as const))(
    '%s with certainty sure fails at the sure value',
    ([, block]) => {
      const file = withBlock(block, block.yaml.replace('certainty: likely', 'certainty: sure'));
      expect(check(file)).toEqual([
        {
          file: SCHEME,
          ...where(file.text, 'certainty: sure', 'certainty: '.length),
          message: '"sure" is not a known member of vocabulary certainty',
        },
      ]);
    },
  );
});

describe('context_from (D-18, DEC-035)', () => {
  const context = (fields: string): ModelFile =>
    scheme(`context_from:\n  issuing_country: { ${fields} }\n`);
  const CAPTURE = 'capture: { regex: "^([A-Z]{2})", group: 1 }';

  test('a map other than country-prefix fails at the map value', () => {
    const file = context(`${CAPTURE}, map: iso-3166, ${OK}`);
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'map: iso-3166', 'map: '.length),
        message: 'must be "country-prefix"',
      },
    ]);
  });

  test('an extra key beside issuing_country fails as an unknown property', () => {
    const file = scheme(
      `context_from:\n  issuing_country: { ${CAPTURE}, map: country-prefix, ${OK} }\n  issuing_region: { ${CAPTURE}, map: country-prefix, ${OK} }\n`,
    );
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'issuing_region'),
        message: 'unknown property "issuing_region"',
      },
    ]);
  });

  test('a capture without group is a missing-property error', () => {
    const file = context(`capture: { regex: "^([A-Z]{2})" }, map: country-prefix, ${OK}`);
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'capture:'),
        message: 'missing required property "group"',
      },
    ]);
  });
});

describe('rules and the closed transform schema (D-22, MOD-11)', () => {
  const rule = (fields: string): ModelFile =>
    scheme(
      `rules:\n  - { id: r, input: fixture-target, output: fixture-scheme, ${fields}, ${OK} }\n`,
    );
  const step = (text: string): ModelFile => rule(`transform: ${text}`);

  test('an input that names no scheme fails at the value', () => {
    const file = scheme(
      `rules:\n  - { id: r, input: no-such-scheme, output: fixture-scheme, transform: [uppercase], ${OK} }\n`,
    );
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'input: no-such-scheme', 'input: '.length),
        message: '"no-such-scheme" is not a known scheme',
      },
    ]);
  });

  test('an output that names no scheme fails at the value', () => {
    const file = scheme(
      `rules:\n  - { id: r, input: fixture-target, output: no-such-scheme, transform: [uppercase], ${OK} }\n`,
    );
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'output: no-such-scheme', 'output: '.length),
        message: '"no-such-scheme" is not a known scheme',
      },
    ]);
  });

  test.for([
    '[uppercase]',
    '[{ strip_prefix: 2 }]',
    '[{ strip_suffix: 0 }]',
    '[{ add_prefix: "NL" }]',
    '[{ add_suffix: "B01" }]',
    '[{ pad_left: { length: 9, char: "0" } }]',
    '[{ remove: " .-" }]',
    '[{ capture: { regex: "^([0-9]+)$", group: 1 } }, { template: "NL{capture:1}B01" }]',
    '[{ template: "{value}" }]',
  ])('the transform %s is accepted', (transform) => {
    expect(check(step(transform))).toEqual([]);
  });

  test('an empty transform fails', () => {
    const file = step('[]');
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('fewer than 1');
  });

  test('a step with an unknown operation fails as an unknown property', () => {
    const file = step('[{ shout: 1 }]');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'shout'), message: 'unknown property "shout"' },
    ]);
  });

  test('a step with two operations fails', () => {
    const file = step('[{ strip_suffix: 3, add_suffix: "B01" }]');
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('more than 1');
  });

  test('a bare string other than uppercase fails with must be "uppercase"', () => {
    const file = step('[lowercase]');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'lowercase'), message: 'must be "uppercase"' },
    ]);
  });

  test('uppercase with an argument is not an operation', () => {
    const file = step('[{ uppercase: 1 }]');
    expect(check(file)).toEqual([
      { file: SCHEME, ...where(file.text, 'uppercase'), message: 'unknown property "uppercase"' },
    ]);
  });

  test('pad_left without char is a missing-property error', () => {
    const file = step('[{ pad_left: { length: 9 } }]');
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'pad_left:'),
        message: 'missing required property "char"',
      },
    ]);
  });

  test('a rule example without out is a missing-property error', () => {
    const file = rule('transform: [uppercase], examples: [{ in: "a" }]');
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, '{ in:'),
        message: 'missing required property "out"',
      },
    ]);
  });

  test('a rule without an id fails and a rule id must be kebab-case', () => {
    const bad = scheme(
      `rules:\n  - { id: Bad_Id, input: fixture-target, output: fixture-scheme, transform: [uppercase], ${OK} }\n`,
    );
    const problems = check(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(bad.text, 'Bad_Id'));
  });
});

describe('composites and components (D-19)', () => {
  const COMPONENT = `components:\n  - { prefix: "0106", scheme: fixture-target, certainty: certain, source: fixture-source }\n`;

  test('kind composite without components fails at the root', () => {
    expect(check(scheme('', COMPOSITE))).toEqual([
      { file: SCHEME, line: 1, column: 1, message: 'kind: composite requires components' },
    ]);
  });

  test('kind composite with components passes', () => {
    expect(check(scheme(COMPONENT, COMPOSITE))).toEqual([]);
  });

  test('kind identifier with components fails at /components', () => {
    const file = scheme(COMPONENT);
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'components:'),
        message: 'components are only allowed when kind is composite',
      },
    ]);
  });

  test('a long-form kind composite is treated as composite', () => {
    const long = '{ value: composite, source: fixture-source, certainty: likely }';
    expect(check(scheme(COMPONENT, { kind: long }))).toEqual([]);
    expect(check(scheme('', { kind: long }))).toEqual([
      { file: SCHEME, line: 1, column: 1, message: 'kind: composite requires components' },
    ]);
  });

  test('an empty components list fails', () => {
    const problems = check(scheme('components: []\n', COMPOSITE));
    expect(problems.map((problem) => problem.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('fewer than 1')]),
    );
  });

  test('a component scheme that does not exist fails at the value', () => {
    const file = scheme(COMPONENT.replace('fixture-target', 'no-such-scheme'), COMPOSITE);
    expect(check(file)).toEqual([
      {
        file: SCHEME,
        ...where(file.text, 'scheme: no-such-scheme', 'scheme: '.length),
        message: '"no-such-scheme" is not a known scheme',
      },
    ]);
  });
});

describe('rule ids are unique across all scheme files', () => {
  const RULE = `rules:\n  - { id: dup-rule, input: fixture-target, output: fixture-scheme, transform: [uppercase], ${OK} }\n`;
  const RULE_BACK = RULE.replace(
    'input: fixture-target, output: fixture-scheme',
    'input: fixture-scheme, output: fixture-target',
  );

  test('a duplicate rule id fails at the second file, at the id value', () => {
    const second = target(RULE_BACK);
    expect(check(scheme(RULE), second)).toEqual([
      {
        file: 'model/schemes/fixture-target.yaml',
        ...where(second.text, 'id: dup-rule', 'id: '.length),
        message: 'duplicate rule id: each rule id may be used only once',
      },
    ]);
  });

  test('two distinct rule ids pass', () => {
    expect(check(scheme(RULE), target(RULE_BACK.replace('dup-rule', 'other-rule')))).toEqual([]);
  });

  test('a duplicate inside one file fails at the second occurrence', () => {
    const entry = RULE.split('\n')[1] as string;
    const file = scheme(`${RULE}${entry}\n`);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.line).toBe(file.text.split('\n').lastIndexOf(entry) + 1);
  });
});

describe('the schema transform set equals the engine set (MOD-11, T-02-22)', () => {
  test('the string step plus the object keys equal TRANSFORM_OPERATIONS', () => {
    const schema = JSON.parse(
      readFileSync(`${fileURLToPath(SCHEMA_DIR)}transform.schema.json`, 'utf8'),
    ) as {
      $defs: { step: { then: { const: string }; else: { properties: Record<string, unknown> } } };
    };
    const names = new Set([
      schema.$defs.step.then.const,
      ...Object.keys(schema.$defs.step.else.properties),
    ]);
    expect([...names].sort()).toEqual([...TRANSFORM_OPERATIONS].sort());
  });
});
