import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elfproef } from '@uio/engine';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import { buildRegistry, type Registry, refKeyword } from './refs.ts';
import { SCHEMA_DIR } from './schema.ts';
import {
  cleanupCopies,
  copyOfRepo,
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  positionOfToken,
  runValidateCli,
  schemeFixture,
  withSeedModel,
} from './testing.ts';

vi.setConfig({ testTimeout: 60_000 });

// No validator message may contain any part of a value from a model file (UAT test 3, WR-01, T-02-33).
// Every identifier-shaped value here is built at runtime, so no personal-number-like literal is
// committed, and no assertion compares a value: leaks are booleans and any compared text is masked,
// so a failing run does not print a value either. Test titles carry labels, never values.

/**
 * The first nine-digit string `elfproef` accepts, from an eight-digit prefix counting up from
 * 99990000 plus a check digit tried from 0 to 9 (the 9999 range is assumed reserved for test
 * persons, as in tools/guards/src/testing.ts).
 */
export function syntheticCore(): string {
  for (let prefix = 99990000; prefix <= 99999999; prefix++) {
    for (let check = 0; check <= 9; check++) {
      const candidate = `${prefix}${check}`;
      if (elfproef(candidate)) return candidate;
    }
  }
  throw new Error('no synthetic core found');
}

/** An uppercase VAT-shaped value, its lowercase form (kebab-id shaped) and the nine-digit core. */
export function identifiers(): { core: string; upper: string; lower: string } {
  const core = syntheticCore();
  return { core, upper: `NL${core}B01`, lower: `nl${core}b01` };
}

/** True when any of the texts contains any of the secrets (a boolean, so nothing is printed). */
export const leaks = (texts: readonly string[], secrets: readonly string[]): boolean =>
  texts.some((text) => secrets.some((secret) => text.includes(secret)));

/** The text with every secret replaced by `<value>`, safe to put in an assertion. */
export const masked = (text: string, secrets: readonly string[]): string =>
  secrets.reduce((result, secret) => result.split(secret).join('<value>'), text);

const SCHEME = 'model/schemes/fixture-echo.yaml';
const { core, upper, lower } = identifiers();
const SECRETS = [upper, lower, core];

const check = (extra: string) =>
  checkModelFiles(
    withSeedModel([
      fixtureSource(),
      ...fixtureAuthorities(),
      schemeFixture('fixture-echo', minimalSchemeBody('fixture-echo', {}, extra)),
    ]),
  );
const textOf = (extra: string): string =>
  schemeFixture('fixture-echo', minimalSchemeBody('fixture-echo', {}, extra)).text;

describe('a reference value is never echoed (file, line and column locate it)', () => {
  test('a VAT-shaped value in a vocabulary-only field is one positioned problem without the value', () => {
    const extra = `level:\n  - { value: ${upper}, certainty: likely, source: fixture-source }\n`;
    const problems = check(extra);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...positionOfToken(textOf(extra), upper) });
    expect(masked(problems[0]?.message ?? '', SECRETS)).toBe(
      'the value is not a known member of vocabulary level',
    );
    expect(
      leaks(
        problems.map((p) => p.message),
        SECRETS,
      ),
    ).toBe(false);
    expect(
      leaks(
        problems.map((p) => JSON.stringify(p)),
        SECRETS,
      ),
    ).toBe(false);
  });

  test('a kebab-id shaped value in a source field is one positioned problem without the value', () => {
    const extra = `roles:\n  - { value: taxpayer, certainty: likely, source: ${lower} }\n`;
    const problems = check(extra);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...positionOfToken(textOf(extra), lower) });
    expect(masked(problems[0]?.message ?? '', SECRETS)).toBe('the value is not a known source');
    expect(
      leaks(
        problems.map((p) => JSON.stringify(p)),
        SECRETS,
      ),
    ).toBe(false);
  });

  test('a kebab-id shaped relation target is one positioned problem without the value', () => {
    const extra = `relations:\n  - { kind: references, target: ${lower}, certainty: likely, source: fixture-source }\n`;
    const problems = check(extra);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: SCHEME, ...positionOfToken(textOf(extra), lower) });
    expect(masked(problems[0]?.message ?? '', SECRETS)).toBe('the value is not a known scheme');
    expect(
      leaks(
        problems.map((p) => JSON.stringify(p)),
        SECRETS,
      ),
    ).toBe(false);
  });

  test('a negated jurisdiction keeps its ref kind in params and prints nothing of the value', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addKeyword(refKeyword(buildRegistry([]), new Set()));
    const validate = ajv.compile({ type: 'string', uioRef: 'jurisdiction-negatable' });
    expect(validate(`!${upper}`)).toBe(false);
    expect(validate.errors).toHaveLength(1);
    expect(masked(validate.errors?.[0]?.message ?? '', SECRETS)).toBe(
      'the value is not a known jurisdiction',
    );
    expect(validate.errors?.[0]?.params).toEqual({ ref: 'jurisdiction-negatable' });
    expect(leaks([JSON.stringify(validate.errors)], SECRETS)).toBe(false);
  });
});

/** Every string stored under a `uioRef` key in the schema files, sorted and unique. */
function referenceKinds(): string[] {
  const dir = fileURLToPath(SCHEMA_DIR);
  const kinds = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'uioRef' && typeof value === 'string') kinds.add(value);
        else walk(value);
      }
    }
  };
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.schema.json'))) {
    walk(JSON.parse(readFileSync(`${dir}${name}`, 'utf8')));
  }
  return [...kinds].sort();
}

const KINDS = referenceKinds();

function compileRef(kind: string, registry: Registry) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addKeyword(refKeyword(registry, new Set()));
  return ajv.compile({ type: 'string', uioRef: kind });
}

describe('every reference kind in the schemas never echoes a value', () => {
  test('the sweep finds the kinds the schemas use, so it cannot be empty', () => {
    for (const kind of ['source', 'scheme', 'jurisdiction-negatable', 'vocab:level']) {
      expect(KINDS).toContain(kind);
    }
  });

  test.for(KINDS.map((kind) => [kind] as const))(
    'kind %s: four value shapes fail with the generic message and no part of the value',
    ([kind]) => {
      const validate = compileRef(kind, new Map());
      for (const value of [upper, lower, `!${upper}`, core]) {
        expect(validate(value)).toBe(false);
        const messages = (validate.errors ?? []).map((error) => error.message ?? '');
        expect(messages).toHaveLength(1);
        expect(messages[0]?.startsWith('the value is not a known ')).toBe(true);
        expect(leaks([JSON.stringify(validate.errors)], SECRETS)).toBe(false);
      }
    },
  );

  test.for(KINDS.map((kind) => [kind] as const))(
    'kind %s: a registered id passes (positive control)',
    ([kind]) => {
      const key = kind === 'jurisdiction-negatable' ? 'jurisdiction' : kind;
      const registry: Registry = new Map([[key, new Set(['known-id'])]]);
      const validate = compileRef(kind, registry);
      expect(validate('known-id')).toBe(true);
      expect(validate.errors).toBeNull();
    },
  );
});

const CLI_BODY = `level:
  - { value: ${upper}, certainty: likely, source: fixture-source }
roles:
  - { value: taxpayer, certainty: likely, source: ${lower} }
relations:
  - { kind: ${upper}, target: ${lower}, certainty: likely, source: fixture-source }
`;
const CLI_FILE = schemeFixture('fixture-echo', minimalSchemeBody('fixture-echo', {}, CLI_BODY));
const CLI_DEFECTS = [
  {
    name: 'vocabulary member',
    ...positionOfToken(CLI_FILE.text, upper, 1),
    message: 'the value is not a known member of vocabulary level',
  },
  {
    name: 'source',
    ...positionOfToken(CLI_FILE.text, lower, 1),
    message: 'the value is not a known source',
  },
  {
    name: 'relation kind',
    ...positionOfToken(CLI_FILE.text, upper, 2),
    message: 'the value is not a known member of vocabulary relation-kind',
  },
  {
    name: 'scheme',
    ...positionOfToken(CLI_FILE.text, lower, 2),
    message: 'the value is not a known scheme',
  },
];

let plain: { status: number | null; stdout: string };
let annotated: { status: number | null; stdout: string };

beforeAll(() => {
  const root = copyOfRepo();
  for (const file of [fixtureSource(), ...fixtureAuthorities(), CLI_FILE]) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.text);
  }
  plain = runValidateCli(root, { GITHUB_ACTIONS: undefined });
  annotated = runValidateCli(root, { GITHUB_ACTIONS: 'true' });
});

afterAll(cleanupCopies);

describe('the CLI on a repository copy prints positions, never values (D-04, MOD-10)', () => {
  test('both runs exit 1', () => {
    expect(plain.status).toBe(1);
    expect(annotated.status).toBe(1);
  });

  test.for(CLI_DEFECTS.map((defect) => [defect.name, defect] as const))(
    'plain mode prints exactly one line for the %s, at its line and column, ending in its message',
    ([, defect]) => {
      const prefix = `${CLI_FILE.path}:${defect.line}:${defect.column} `;
      const lines = plain.stdout.split('\n').filter((line) => line.startsWith(prefix));
      expect(lines).toHaveLength(1);
      expect(lines[0]?.endsWith(defect.message)).toBe(true);
    },
  );

  test('the summary counts the four problems and nothing else is a problem line', () => {
    expect(plain.stdout).toContain('validate: 4 problems');
    const problems = plain.stdout
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('validate:'));
    expect(problems).toHaveLength(CLI_DEFECTS.length);
  });

  test('annotation mode prints one error annotation per defect with the generic message', () => {
    for (const defect of CLI_DEFECTS) {
      const annotation = `::error file=${CLI_FILE.path},line=${defect.line},col=${defect.column}::${defect.message}`;
      expect(annotated.stdout.split('\n').filter((line) => line === annotation)).toHaveLength(1);
    }
  });

  test('no output line of either mode contains a part of the value', () => {
    expect(leaks(plain.stdout.split('\n'), SECRETS)).toBe(false);
    expect(leaks(annotated.stdout.split('\n'), SECRETS)).toBe(false);
  });
});
