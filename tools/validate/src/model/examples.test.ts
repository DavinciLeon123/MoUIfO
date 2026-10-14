import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { SCHEMA_DIR } from './schema.ts';
import {
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  schemeFixture,
  withSeedModel,
} from './testing.ts';

const SCHEME = 'model/schemes/fixture-scheme.yaml';
const OK = 'certainty: likely, source: fixture-source';

// Dutch VAT-style vectors, re-derived in plan 02-05: only the first two are accepted by the format.
const GOOD_A = 'NL001469630B01';
const GOOD_B = 'NL002455799B11';
const BAD_CHECKSUM_A = 'NL001469631B01';
const BAD_CHECKSUM_B = 'NL002455799B12';
const TOO_SHORT = 'NL00146963';
const BARE_CORE = '001469630';

const OVER = '[{ capture: { regex: "^NL([0-9]{9})B[0-9]{2}$", group: 1 } }]';
const VAT_PATTERN =
  '{ regex: "^NL[0-9]{9}B[0-9]{2}$", certainty: certain, source: fixture-source }';
const VAT_CHECKSUM = `  checksum:
    - { algorithm: elfproef, over: ${OVER}, certainty: certain, source: fixture-source }
    - { algorithm: iso7064-mod97-10, certainty: likely, source: fixture-source }
`;

const list = (values: readonly string[]): string =>
  `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;

/** A scheme file whose `format` block is `block` (already indented under `format:`). */
const withFormat = (block: string, overrides: Record<string, string | undefined> = {}): ModelFile =>
  schemeFixture(
    'fixture-scheme',
    minimalSchemeBody('fixture-scheme', overrides, `format:\n${block}`),
  );

/** The vat-nl-style format of plan 02-10 Task 3 with the given example lists. */
const vat = (valid: readonly string[], invalid: readonly string[]): ModelFile =>
  withFormat(
    `  patterns:\n    - ${VAT_PATTERN}\n${VAT_CHECKSUM}  examples_valid: ${list(valid)}\n  examples_invalid: ${list(invalid)}\n`,
  );

const target = (): ModelFile =>
  schemeFixture('fixture-target', minimalSchemeBody('fixture-target', { abbreviation: 'TGT' }));

const check = (...files: ModelFile[]) =>
  checkModelFiles(withSeedModel([fixtureSource(), ...fixtureAuthorities(), target(), ...files]));

/** 1-based line and column of the `occurrence`-th occurrence of `needle` in `text`. */
function where(text: string, needle: string, occurrence = 1): { line: number; column: number } {
  let index = -1;
  for (let seen = 0; seen < occurrence; seen++) {
    index = text.indexOf(needle, index + 1);
    expect(index).toBeGreaterThanOrEqual(0);
  }
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const noEcho = (problems: readonly { message: string }[], values: readonly string[]): void => {
  for (const problem of problems) {
    for (const value of values) expect(problem.message).not.toContain(value);
  }
};

describe('check 4: examples run through the engine format check (SPEC 5.6, DEC-039)', () => {
  test('a vat-nl-style fixture with consistent examples gives no problem', () => {
    const file = vat([GOOD_A, GOOD_B], [BAD_CHECKSUM_A, BAD_CHECKSUM_B, TOO_SHORT, BARE_CORE]);
    expect(check(file)).toEqual([]);
  });

  test('a valid example whose checksum entries all fail is reported at its index, naming the entries', () => {
    const file = vat([GOOD_A, GOOD_B, BAD_CHECKSUM_A], []);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...where(file.text, `"${BAD_CHECKSUM_A}"`),
    });
    expect(problems[0]?.message).toContain(
      'a pattern matches but every checksum entry fails (elfproef, iso7064-mod97-10)',
    );
    expect(problems[0]?.message).toContain('examples_valid[2]');
    expect(problems[0]?.message).toContain('fixture-scheme');
    noEcho(problems, [BAD_CHECKSUM_A, GOOD_A, GOOD_B]);
  });

  test('a valid example matching no pattern is reported with the no-pattern message', () => {
    const file = vat([GOOD_A, TOO_SHORT], []);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...where(file.text, `"${TOO_SHORT}"`) });
    expect(problems[0]?.message).toContain('example is not accepted: no pattern matches');
    noEcho(problems, [TOO_SHORT]);
  });

  test('an invalid example the format accepts is reported at its index', () => {
    const file = vat([GOOD_A], [BAD_CHECKSUM_A, BAD_CHECKSUM_B, TOO_SHORT, BARE_CORE, GOOD_B]);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...where(file.text, `"${GOOD_B}"`, 1),
    });
    expect(problems[0]?.message).toContain('invalid example is accepted by the format');
    expect(problems[0]?.message).toContain('examples_invalid[4]');
    noEcho(problems, [GOOD_B]);
  });

  test('a scheme with patterns and no checksum accepts a matching valid example', () => {
    const file = withFormat(
      `  patterns:\n    - { regex: "^[A-Z]{2}[0-9]{4}$", ${OK} }\n  examples_valid: ["DE1234"]\n  examples_invalid: ["1234"]\n`,
    );
    expect(check(file)).toEqual([]);
  });

  const NO_PATTERN_REASON = (index: number) =>
    `example is not accepted: the format declares no pattern, so it accepts no value (examples_valid[${index}] of fixture-scheme)`;

  test.for([
    ['patterns absent', '  examples_valid: ["DE1234", "FR5678"]\n', ['DE1234', 'FR5678']],
    ['patterns empty', '  patterns: []\n  examples_valid: ["DE1234"]\n', ['DE1234']],
    [
      'checksum only',
      `  checksum:\n    - { algorithm: elfproef, ${OK} }\n  examples_valid: ["DE1234"]\n`,
      ['DE1234'],
    ],
  ] as const)(
    'a format with %s fails every valid example as declaring no pattern (WR-04)',
    ([, block, examples]) => {
      const file = withFormat(block);
      const problems = check(file);
      expect(problems).toHaveLength(examples.length);
      examples.forEach((example, index) => {
        expect(problems[index]).toMatchObject({
          file: SCHEME,
          ...where(file.text, `"${example}"`),
        });
        expect(problems[index]?.message).toBe(NO_PATTERN_REASON(index));
      });
      noEcho(problems, examples);
    },
  );

  test('the format description states the DEC-039 contract and no longer says neither list is needed', () => {
    const schema = JSON.parse(
      readFileSync(join(fileURLToPath(SCHEMA_DIR), 'scheme.schema.json'), 'utf8'),
    ) as { properties: { format: { description: string } } };
    const description = schema.properties.format.description;
    expect(description).toContain('accepts no value');
    expect(description).not.toMatch(/neither list is required/i);
  });

  test('a format with no patterns accepts nothing, so every invalid example is fine', () => {
    expect(check(withFormat('  examples_invalid: ["DE1234"]\n'))).toEqual([]);
  });

  test('an unanchored pattern is matched against the whole example (WR-05)', () => {
    const file = withFormat(
      `  patterns:\n    - { regex: "[A-Z]{2}[0-9]{4}", ${OK} }\n  examples_valid: ["DE1234"]\n  examples_invalid: ["xxDE1234yy", "DE12345"]\n`,
    );
    expect(check(file)).toEqual([]);
  });

  test('a valid example that only contains a match is reported as matching no pattern', () => {
    const file = withFormat(
      `  patterns:\n    - { regex: "[A-Z]{2}[0-9]{4}", ${OK} }\n  examples_valid: ["xxDE1234yy"]\n`,
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...where(file.text, '"xxDE1234yy"') });
    expect(problems[0]?.message).toContain('no pattern matches');
    noEcho(problems, ['xxDE1234yy']);
  });

  test('pattern conditions are not evaluated: a conditional pattern still matches the examples', () => {
    const file = withFormat(
      `  patterns:\n    - { regex: "^[A-Z]{2}[0-9]{4}$", condition: { issuing_country: NL }, ${OK} }\n  examples_valid: ["NL1234"]\n  examples_invalid: ["NL5678"]\n`,
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(file.text, '"NL5678"'));
    expect(problems[0]?.message).toContain('invalid example is accepted by the format');
    noEcho(problems, ['NL1234', 'NL5678']);
  });

  test('a scheme with a structural error is not example-checked (no cascade)', () => {
    const file = withFormat(
      `  patterns:\n    - ${VAT_PATTERN}\n${VAT_CHECKSUM}  examples_valid: ${list([BAD_CHECKSUM_A])}\n  examples_invalid: ${list([GOOD_A])}\n  surprise: true\n`,
    );
    const problems = check(file);
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.some(
        (problem) =>
          problem.message.includes('not accepted') || problem.message.includes('is accepted'),
      ),
    ).toBe(false);
  });
});

/** Like `where`, but searching only after the first occurrence of `marker`. */
function whereAfter(
  text: string,
  marker: string,
  needle: string,
): { line: number; column: number } {
  const start = text.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const index = text.indexOf(needle, start);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const VAT_FORMAT = `  patterns:\n    - ${VAT_PATTERN}\n${VAT_CHECKSUM}`;
const RULE_OUT = 'NL001469630B01';
const ADD_NL_B01 = '[{ add_prefix: "NL" }, { add_suffix: "B01" }]';

const ruleBlock = (
  transform: string,
  example = `{ in: "${BARE_CORE}", out: "${RULE_OUT}" }`,
  output = 'fixture-scheme',
): string =>
  `rules:\n  - id: fixture-rule\n    input: fixture-target\n    output: ${output}\n    transform: ${transform}\n    certainty: likely\n    source: fixture-source\n    examples:\n      - ${example}\n`;

/** A scheme with the vat-nl-style format (or `format`) followed by one rule. */
const withRule = (rules: string, format: string | undefined = VAT_FORMAT): ModelFile =>
  schemeFixture(
    'fixture-scheme',
    minimalSchemeBody(
      'fixture-scheme',
      {},
      `${format === undefined ? '' : `format:\n${format}`}${rules}`,
    ),
  );

describe('check 5: rule examples run through the transform and the target format (SPEC 5.3, 5.6)', () => {
  test('a rule whose example output equals the transform result and passes the format gives no problem', () => {
    expect(check(withRule(ruleBlock(ADD_NL_B01)))).toEqual([]);
  });

  test('an example output that differs from the transform result is reported at its out', () => {
    const file = withRule(ruleBlock(ADD_NL_B01, `{ in: "${BARE_CORE}", out: "NL001469630B02" }`));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'examples:', '"NL001469630B02"'),
    });
    expect(problems[0]?.message).toContain('rule example gives a different output');
    expect(problems[0]?.message).toContain('rules[0].examples[0]');
    noEcho(problems, [BARE_CORE, 'NL001469630B02', RULE_OUT]);
  });

  test('a transform that gives no result for the example is reported at its out', () => {
    const file = withRule(ruleBlock('[{ strip_prefix: 20 }]'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'examples:', `"${RULE_OUT}"`),
    });
    expect(problems[0]?.message).toContain('rule example gives no result');
    noEcho(problems, [BARE_CORE, RULE_OUT]);
  });

  test('an output that fails the output scheme format is reported, naming that scheme (no conclusion)', () => {
    const file = withRule(
      ruleBlock(
        '[{ add_prefix: "NL" }, { add_suffix: "X" }]',
        `{ in: "${BARE_CORE}", out: "NL001469630X" }`,
      ),
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'examples:', '"NL001469630X"'),
    });
    expect(problems[0]?.message).toContain('rule output fails the format of fixture-scheme');
    noEcho(problems, [BARE_CORE, 'NL001469630X']);
  });

  test('an output scheme without a format is checked by equality only', () => {
    const file = withRule(
      ruleBlock(
        '[{ add_prefix: "NL" }]',
        `{ in: "${BARE_CORE}", out: "NL${BARE_CORE}" }`,
        'fixture-target',
      ),
      undefined,
    );
    expect(check(file)).toEqual([]);
    const wrong = withRule(
      ruleBlock('[{ add_prefix: "NL" }]', `{ in: "${BARE_CORE}", out: "XX" }`, 'fixture-target'),
      undefined,
    );
    const problems = check(wrong);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('rule example gives a different output');
  });

  test('a rule whose output scheme is missing is skipped: only the reference error remains', () => {
    const problems = check(withRule(ruleBlock(ADD_NL_B01, undefined, 'no-such-scheme')));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('the value is not a known scheme');
  });
});

describe('compile checks: every transform, over list, pattern and capture the engine will run', () => {
  test('a template with an unknown placeholder is reported at its transform step', () => {
    const file = withRule(ruleBlock('[{ template: "NL{bogus}" }]'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'transform:', '{ template'),
    });
  });

  test('a capture index above the capture group count is reported at the template step', () => {
    const file = withRule(
      ruleBlock('[{ capture: { regex: "^([0-9]{4})", group: 1 } }, { template: "{capture:2}" }]'),
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'transform:', '{ template'),
    });
  });

  test('a rule that does not compile has its examples skipped (one problem, not a cascade)', () => {
    const problems = check(withRule(ruleBlock('[{ template: "NL{bogus}" }]')));
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.not.stringContaining('rule example'),
    ]);
  });

  test('an over step with a bad template is reported at the over step', () => {
    const file = withFormat(
      `  patterns:\n    - ${VAT_PATTERN}\n  checksum:\n    - { algorithm: elfproef, over: [{ template: "{bogus}" }], certainty: certain, source: fixture-source }\n`,
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: SCHEME,
      ...whereAfter(file.text, 'over:', '{ template'),
    });
  });

  test('a pattern regex that does not compile is reported at its regex', () => {
    const file = withFormat(`  patterns:\n    - { regex: "([", ${OK} }\n  examples_valid: ["x"]\n`);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...where(file.text, '"(["') });
  });

  test('a context_from capture regex that does not compile is reported at the regex', () => {
    const file = schemeFixture(
      'fixture-scheme',
      minimalSchemeBody(
        'fixture-scheme',
        {},
        `context_from:\n  issuing_country:\n    capture: { regex: "([", group: 1 }\n    map: country-prefix\n    certainty: certain\n    source: fixture-source\n`,
      ),
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...where(file.text, '"(["') });
  });

  test('a context_from group above the regex group count is reported at the group', () => {
    const file = schemeFixture(
      'fixture-scheme',
      minimalSchemeBody(
        'fixture-scheme',
        {},
        `context_from:\n  issuing_country:\n    capture: { regex: "^([A-Z]{2})", group: 2 }\n    map: country-prefix\n    certainty: certain\n    source: fixture-source\n`,
      ),
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...where(file.text, '2 }') });
  });

  test('an unmapped prefix is no problem: context_from is compiled, never run on examples', () => {
    const file = schemeFixture(
      'fixture-scheme',
      minimalSchemeBody(
        'fixture-scheme',
        {},
        `format:\n  patterns:\n    - { regex: "^[A-Z]{2}[0-9]{4}$", ${OK} }\n  examples_valid: ["DE1234"]\ncontext_from:\n  issuing_country:\n    capture: { regex: "^([A-Z]{2})", group: 1 }\n    map: country-prefix\n    certainty: certain\n    source: fixture-source\n`,
      ),
    );
    expect(check(file)).toEqual([]);
  });
});
