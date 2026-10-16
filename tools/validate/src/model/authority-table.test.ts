import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { checkModel, checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { fixture, positionOfToken, withSeedModel } from './testing.ts';

// DEC-057: a jurisdiction may carry authority_table { iri, source, certainty, note? } naming its
// entry in the Publications Office country table. The IRIs below are public.

const NL = 'model/jurisdictions/NL.yaml';
const BASE = 'http://publications.europa.eu/resource/authority/country/';

/** The seed NL jurisdiction with `table` (the text under `authority_table:`) appended. */
const nl = (table: string): ModelFile =>
  fixture(
    NL,
    `id: NL\nlabel:\n  en: Netherlands\n  nl: Nederland\npart_of:\n  - jurisdiction: EU\n    source: teu-art-52\n    certainty: certain\nauthority_table:\n${table}`,
  );

const entry = (iri: string, extra = ''): string =>
  `  iri: "${iri}"\n  source: teu-art-52\n  certainty: certain\n${extra}`;

// A file with a problem does not vouch for its own id, so the seed's country-prefix entry for NL
// would dangle as well; the tests look at the problems reported on the jurisdiction file itself.
const check = (file: ModelFile) =>
  checkModelFiles(withSeedModel(file)).filter((problem) => problem.file === NL);

describe('authority_table on a jurisdiction (DEC-057)', () => {
  test('a Publications Office country IRI with a source and certainty validates', () => {
    expect(check(nl(entry(`${BASE}NLD`)))).toEqual([]);
  });

  test('an optional note of the text form validates', () => {
    expect(check(nl(entry(`${BASE}NLD`, '  note:\n    en: Read on the entry page.\n')))).toEqual(
      [],
    );
  });

  test('a lowercase code in the IRI is a problem at the iri value', () => {
    const file = nl(entry(`${BASE}nld`));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: NL,
      ...positionOfToken(file.text, `"${BASE}nld"`),
    });
  });

  test('an IRI of another host is a problem at the iri value', () => {
    const file = nl(entry('https://example.org/NLD'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: NL,
      ...positionOfToken(file.text, '"https://example.org/NLD"'),
    });
  });

  test('a missing source is a problem at the table', () => {
    const file = nl(`  iri: "${BASE}NLD"\n  certainty: certain\n`);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('"source"');
    expect(problems[0]).toMatchObject({
      file: NL,
      line: positionOfToken(file.text, 'authority_table:').line,
    });
  });

  test('a missing certainty is a problem', () => {
    const problems = check(nl(`  iri: "${BASE}NLD"\n  source: teu-art-52\n`));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('"certainty"');
  });

  test('an unknown key is a problem at that key', () => {
    const file = nl(entry(`${BASE}NLD`, '  code: NLD\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: NL,
      message: 'unknown property "code"',
      ...positionOfToken(file.text, 'code:'),
    });
  });

  test('a source id that is not registered is a problem at the source value', () => {
    const file = nl(`  iri: "${BASE}NLD"\n  source: no-such-source\n  certainty: certain\n`);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: NL,
      ...positionOfToken(file.text, 'no-such-source'),
    });
    expect(problems[0]?.message).not.toContain('no-such-source');
  });

  test('the real repository still validates with no problem', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });
});
