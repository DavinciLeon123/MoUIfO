import { elfproef } from '@uio/engine';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import { buildRegistry, refKeyword } from './refs.ts';
import {
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  positionOfToken,
  schemeFixture,
  withRealModel,
} from './testing.ts';

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
    withRealModel([
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
