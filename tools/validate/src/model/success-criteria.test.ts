import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ModelFile } from './load.ts';
import {
  cleanupCopies,
  copyOfRepo,
  expectOnlyPendingWarningLines,
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  positionOfToken,
  runValidateCli,
  runValidateCliAsync,
  schemeFixture,
} from './testing.ts';

vi.setConfig({ testTimeout: 60_000 });

// Vectors re-derived in plan 02-05: only the first is accepted by the format below. The bare core
// is the allow-listed public RSIN; every other value is a vat-nl vector the guard does not flag.
const BARE_CORE = '001469630';
const GOOD_A = 'NL001469630B01';
const GOOD_B = 'NL002455799B11';
const BAD_CHECKSUM = 'NL001469631B01';
const TOO_SHORT = 'NL00146963';

const QUOTING_HINT =
  'a bare number with a leading zero or more than 15 digits loses digits in YAML; quote it';
const OK = 'certainty: likely, source: fixture-source';
const VAT_FORMAT = `format:
  patterns:
    - { regex: "^NL[0-9]{9}B[0-9]{2}$", certainty: certain, source: fixture-source }
  checksum:
    - { algorithm: elfproef, over: [{ capture: { regex: "^NL([0-9]{9})B[0-9]{2}$", group: 1 } }], certainty: certain, source: fixture-source }
    - { algorithm: iso7064-mod97-10, certainty: likely, source: fixture-source }
`;

/** One scheme file per defect family, so a structural error never hides a later check. */
const SCHEME_FILES: ModelFile[] = [
  schemeFixture(
    'fixture-number',
    minimalSchemeBody(
      'fixture-number',
      { abbreviation: 'NUM' },
      `format:\n  examples_invalid: [${TOO_SHORT}, ${BARE_CORE}]\n`,
    ),
  ),
  schemeFixture(
    'fixture-dangling',
    minimalSchemeBody(
      'fixture-dangling',
      { abbreviation: 'DNG', issuer: 'no-such-authority', jurisdiction: 'XX' },
      `level:
  - { value: legal-entity, certainty: likely, source: no-such-source }
relations:
  - { kind: references, target: no-such-scheme, ${OK} }
rules:
  - id: dangling-input
    input: no-such-scheme
    output: fixture-dangling
    transform: [uppercase]
    certainty: likely
    source: fixture-source
    examples:
      - { in: "ab", out: "AB" }
  - id: dangling-output
    input: fixture-dangling
    output: no-such-scheme
    transform: [uppercase]
    certainty: likely
    source: fixture-source
    examples:
      - { in: "ab", out: "AB" }
`,
    ),
  ),
  schemeFixture(
    'fixture-unsourced',
    minimalSchemeBody(
      'fixture-unsourced',
      { abbreviation: 'UNS' },
      `level:
  - { value: legal-entity, certainty: likely }
`,
    ),
  ),
  schemeFixture(
    'fixture-certainty',
    minimalSchemeBody(
      'fixture-certainty',
      { abbreviation: 'CER' },
      `roles:
  - { value: taxpayer, certainty: sure, source: fixture-source }
`,
    ),
  ),
  schemeFixture(
    'fixture-examples',
    minimalSchemeBody(
      'fixture-examples',
      { abbreviation: 'EXA' },
      `${VAT_FORMAT}  examples_valid: ["${GOOD_A}", "${BAD_CHECKSUM}"]
  examples_invalid: ["${TOO_SHORT}", "${GOOD_B}"]
rules:
  - id: examples-rule
    input: fixture-examples
    output: fixture-examples
    transform: [{ add_prefix: "NL" }, { add_suffix: "B01" }]
    certainty: likely
    source: fixture-source
    examples:
      - { in: "${BARE_CORE}", out: "NL001469630B02" }
`,
    ),
  ),
  schemeFixture(
    'fixture-shout',
    minimalSchemeBody(
      'fixture-shout',
      { abbreviation: 'SHT' },
      `rules:
  - id: shout-rule
    input: fixture-shout
    output: fixture-shout
    transform: [{ shout: 1 }]
    certainty: likely
    source: fixture-source
    examples:
      - { in: "ab", out: "AB" }
`,
    ),
  ),
];

const FIXTURES: ModelFile[] = [fixtureSource(), ...fixtureAuthorities(), ...SCHEME_FILES];

type Defect = { name: string; file: string; token: string; occurrence?: number; message: string };

const textOf = (path: string): string => {
  const file = FIXTURES.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`no fixture ${path}`);
  return file.text;
};

const scheme = (id: string): string => `model/schemes/${id}.yaml`;

/** Each defect is located by its token in the fixture text, never by a hand-written line number. */
const DEFECTS: Defect[] = [
  {
    name: 'unquoted 001469630',
    file: scheme('fixture-number'),
    token: BARE_CORE,
    message: QUOTING_HINT,
  },
  {
    name: 'dangling issuer',
    file: scheme('fixture-dangling'),
    token: 'no-such-authority',
    message: 'is not a known authority',
  },
  {
    name: 'dangling jurisdiction',
    file: scheme('fixture-dangling'),
    token: 'XX',
    message: 'is not a known jurisdiction',
  },
  {
    name: 'dangling statement source',
    file: scheme('fixture-dangling'),
    token: 'no-such-source',
    message: 'is not a known source',
  },
  {
    name: 'dangling relation target',
    file: scheme('fixture-dangling'),
    token: 'no-such-scheme',
    occurrence: 1,
    message: 'is not a known scheme',
  },
  {
    name: 'dangling rule input',
    file: scheme('fixture-dangling'),
    token: 'no-such-scheme',
    occurrence: 2,
    message: 'is not a known scheme',
  },
  {
    name: 'dangling rule output',
    file: scheme('fixture-dangling'),
    token: 'no-such-scheme',
    occurrence: 3,
    message: 'is not a known scheme',
  },
  {
    name: 'statement without source',
    file: scheme('fixture-unsourced'),
    token: '{ value: legal-entity',
    message: 'missing required property "source"',
  },
  {
    name: 'invalid certainty',
    file: scheme('fixture-certainty'),
    token: 'sure',
    message: 'is not a known member of vocabulary certainty',
  },
  {
    name: 'example-valid failing pattern plus checksum',
    file: scheme('fixture-examples'),
    token: `"${BAD_CHECKSUM}"`,
    message: 'a pattern matches but every checksum entry fails',
  },
  {
    name: 'example-invalid the format accepts',
    file: scheme('fixture-examples'),
    token: `"${GOOD_B}"`,
    message: 'invalid example is accepted by the format',
  },
  {
    name: 'rule example with a different output',
    file: scheme('fixture-examples'),
    token: '"NL001469630B02"',
    message: 'rule example gives a different output',
  },
  {
    name: 'transform outside the SPEC 5.3 set',
    file: scheme('fixture-shout'),
    token: 'shout: 1',
    message: 'unknown property "shout"',
  },
];

const positionOf = (defect: Defect): { line: number; column: number } =>
  positionOfToken(textOf(defect.file), defect.token, defect.occurrence ?? 1);

/** Every file under `root` (except .git) with the SHA-256 of its content, in sorted order. */
function snapshot(root: string): string[] {
  const entries: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      if (name === '.git') continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
        entries.push(`${path.slice(root.length)} ${digest}`);
      }
    }
  };
  walk(root);
  return entries;
}

let root: string;
let before: string[];
let plain: { status: number | null; stdout: string };

beforeAll(() => {
  root = copyOfRepo();
  for (const file of FIXTURES) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.text);
  }
  before = snapshot(root);
  plain = runValidateCli(root, { GITHUB_ACTIONS: undefined });
});

afterAll(cleanupCopies);

describe('success criteria 1 and 5 through the CLI on a repository copy (D-04, MOD-10)', () => {
  test('the run exits 1', () => {
    expect(plain.status).toBe(1);
  });

  test.for(DEFECTS.map((defect) => [defect.name, defect] as const))(
    'plain mode prints exactly one line for the %s, at its file, line and column',
    ([, defect]) => {
      const { line, column } = positionOf(defect);
      const prefix = `${defect.file}:${line}:${column} `;
      const lines = plain.stdout
        .split('\n')
        .filter((candidate) => candidate.startsWith(prefix) && candidate.includes(defect.message));
      expect(lines).toHaveLength(1);
    },
  );

  test('there is one problem line per defect and nothing else, and it is counted in the summary', () => {
    const problems = plain.stdout
      .split('\n')
      .filter(
        (line) => line !== '' && !line.startsWith('validate:') && !line.includes(' warning:'),
      );
    expect(problems).toHaveLength(DEFECTS.length);
    expect(plain.stdout).toContain(`validate: ${DEFECTS.length} problems`);
  });

  test('the output never contains an example value or a rule example value', () => {
    for (const value of [GOOD_A, GOOD_B, BAD_CHECKSUM, TOO_SHORT, 'NL001469630B02']) {
      // The values appear only where a defect position is printed: never in a message.
      for (const line of plain.stdout.split('\n')) expect(line).not.toContain(value);
    }
  });

  test('CI mode prints a GitHub annotation with file, line and column for each defect', () => {
    const annotated = runValidateCli(root, { GITHUB_ACTIONS: 'true' });
    expect(annotated.status).toBe(1);
    for (const defect of DEFECTS) {
      const { line, column } = positionOf(defect);
      expect(annotated.stdout).toContain(
        `::error file=${defect.file},line=${line},col=${column}::`,
      );
    }
  });

  test('two sequential runs and two concurrent runs print byte-identical output', async () => {
    const second = runValidateCli(root, { GITHUB_ACTIONS: undefined });
    const [third, fourth] = await Promise.all([
      runValidateCliAsync(root, { GITHUB_ACTIONS: undefined }),
      runValidateCliAsync(root, { GITHUB_ACTIONS: undefined }),
    ]);
    expect(second.stdout).toBe(plain.stdout);
    expect(third.stdout).toBe(plain.stdout);
    expect(fourth.stdout).toBe(plain.stdout);
    expect([second.status, third.status, fourth.status]).toEqual([1, 1, 1]);
  });

  test('the validator only reads: the copy is unchanged after all runs', () => {
    expect(snapshot(root)).toEqual(before);
  });
});

describe('the real repository', () => {
  test('npm run validate passes with ten rules and no warning other than pending citations', () => {
    const real = runValidateCli(undefined, { GITHUB_ACTIONS: undefined });
    expect(real.status).toBe(0);
    expect(real.stdout).toContain('validate: repository rules passed (10 rules)');
    expectOnlyPendingWarningLines(real.stdout);
  });
});
