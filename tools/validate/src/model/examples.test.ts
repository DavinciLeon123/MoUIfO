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
  checkModelFiles(withRealModel([fixtureSource(), ...fixtureAuthorities(), target(), ...files]));

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

  test('a format with examples_valid but no patterns fails every valid example', () => {
    const file = withFormat('  examples_valid: ["DE1234", "FR5678"]\n');
    const problems = check(file);
    expect(problems).toHaveLength(2);
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringContaining('no pattern matches'),
      expect.stringContaining('no pattern matches'),
    ]);
    expect(problems[0]).toMatchObject(where(file.text, '"DE1234"'));
    expect(problems[1]).toMatchObject(where(file.text, '"FR5678"'));
    noEcho(problems, ['DE1234', 'FR5678']);
  });

  test('a format with no patterns accepts nothing, so every invalid example is fine', () => {
    expect(check(withFormat('  examples_invalid: ["DE1234"]\n'))).toEqual([]);
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
