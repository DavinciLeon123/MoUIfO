import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { report, runValidation } from '../index.ts';
import { checkModel, checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { fixture, withRealModel } from './testing.ts';

const NL = 'model/jurisdictions/NL.yaml';
const TEU = 'model/sources/teu-art-52.yaml';

const readReal = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const check = (files: ModelFile | readonly ModelFile[]) => checkModelFiles(withRealModel(files));

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

/** Position of the value after `jurisdiction: ` on a part_of entry line. */
function whereValue(text: string, value: string): { line: number; column: number } {
  const at = where(text, `jurisdiction: ${value}`);
  return { line: at.line, column: at.column + 'jurisdiction: '.length };
}

const nlWith = (partOf: string): ModelFile =>
  fixture(NL, `id: NL\nlabel:\n  en: Netherlands\n  nl: Nederland\npart_of:\n${partOf}`);
const entry = (jurisdiction: string, source = 'teu-art-52'): string =>
  `  - jurisdiction: ${jurisdiction}\n    source: ${source}\n    certainty: certain\n`;

describe('the real seed: NL is part of the EU, sourced by TEU Article 52', () => {
  test('the repository validates with no problem and no warning', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });

  test('NL.yaml holds one sourced part_of claim for EU', () => {
    const data = parse(readReal(NL), { schema: 'core' }) as Record<string, unknown>;
    expect(data.id).toBe('NL');
    expect(data.part_of).toEqual([
      { jurisdiction: 'EU', source: 'teu-art-52', certainty: 'certain' },
    ]);
  });

  test('EU.yaml exists and has no part_of', () => {
    const data = parse(readReal('model/jurisdictions/EU.yaml'), { schema: 'core' }) as Record<
      string,
      unknown
    >;
    expect(data.id).toBe('EU');
    expect(data.part_of).toBeUndefined();
  });

  test('teu-art-52 is a law source with a legislation.gov.uk url and no eli', () => {
    const data = parse(readReal(TEU), { schema: 'core' }) as Record<string, unknown>;
    expect(data.type).toBe('law');
    expect(String(data.url)).toMatch(/^https:\/\/www\.legislation\.gov\.uk\//);
    expect(data).not.toHaveProperty('eli');
    expect(data.date).toBe('2020-03-01');
  });
});

describe('references and self-reference', () => {
  test('an unknown jurisdiction is an error at that value', () => {
    const file = nlWith(entry('XX'));
    const problems = check(file);
    expect(problems).toEqual([
      {
        file: NL,
        ...where(file.text, 'XX'),
        message: '"XX" is not a known jurisdiction',
      },
    ]);
  });

  test('an unknown source is an error at that value', () => {
    const file = nlWith(entry('EU', 'teu-art-99'));
    const problems = check(file);
    const at = where(file.text, 'teu-art-99');
    expect(problems).toContainEqual({
      file: NL,
      ...at,
      message: '"teu-art-99" is not a known source',
    });
  });

  test('a jurisdiction cannot be part of itself', () => {
    const file = nlWith(entry('NL'));
    const problems = check(file);
    expect(problems).toEqual([
      {
        file: NL,
        ...whereValue(file.text, 'NL'),
        message: 'a jurisdiction cannot be part of itself',
      },
    ]);
  });
});

describe('uncited sources', () => {
  const uncited = fixture(
    'model/sources/fixture-uncited.yaml',
    'id: fixture-uncited\ntitle: Uncited register page\ndate: 2026-01-01\ntype: register-doc\nurl: https://example.org/register\n',
  );

  test('a source that no statement cites is a warning at its id', () => {
    const problems = check(uncited);
    expect(problems).toEqual([
      {
        file: 'model/sources/fixture-uncited.yaml',
        ...where(uncited.text, 'fixture-uncited'),
        severity: 'warning',
        message: 'source "fixture-uncited" is not cited by any statement',
      },
    ]);
  });

  test('a warning alone leaves the exit code at 0', () => {
    const { exitCode, lines } = report(check(uncited), { github: false });
    expect(exitCode).toBe(0);
    expect(lines.join('\n')).toContain('warning');
  });
});

const PREFIX = 'model/vocab/country-prefix.yaml';
const ART_215 = 'model/sources/vat-directive-art-215.yaml';

type PrefixEntry = {
  prefix: string;
  jurisdiction: string;
  source: string;
  certainty: string;
  note?: string;
};

const realRecord = (path: string): Record<string, unknown> =>
  parse(readReal(path), { schema: 'core' }) as Record<string, unknown>;

/** Errors only: a fixture map that stops citing Article 215 leaves it uncited, a designed warning. */
const errorsOf = (files: ModelFile | readonly ModelFile[]) =>
  check(files).filter((problem) => problem.severity !== 'warning');

const prefixFile = (entries: string): ModelFile =>
  fixture(PREFIX, `id: country-prefix\nlabel:\n  en: Country prefix\nvalues:\n${entries}`);
const prefixEntry = (prefix: string, jurisdiction: string, source = 'vat-directive-art-215') =>
  `  - prefix: ${prefix}\n    jurisdiction: ${jurisdiction}\n    source: ${source}\n    certainty: certain\n`;

describe('the real seed: Belgium and Greece are EU members, EL means Greece', () => {
  test('country-prefix maps NL, BE, EL, XI and GB; the EU has no prefix', () => {
    const data = realRecord(PREFIX);
    expect(data.id).toBe('country-prefix');
    const entries = data.values as PrefixEntry[];
    expect(entries.map(({ prefix, jurisdiction }) => [prefix, jurisdiction])).toEqual([
      ['NL', 'NL'],
      ['BE', 'BE'],
      ['EL', 'GR'],
      ['XI', 'XI'],
      ['GB', 'GB'],
    ]);
    expect(entries.map((entry) => entry.jurisdiction)).not.toContain('EU');
    for (const entry of entries) {
      expect(entry.source).toBe(
        entry.prefix === 'GB' ? 'hmrc-eori-introduction' : 'vat-directive-art-215',
      );
      expect(entry.certainty).toBe('certain');
    }
  });

  test.each(['BE', 'GR'])('%s is part of the EU, sourced by TEU Article 52', (id) => {
    const data = realRecord(`model/jurisdictions/${id}.yaml`);
    expect(data.id).toBe(id);
    expect(data.part_of).toEqual([
      { jurisdiction: 'EU', source: 'teu-art-52', certainty: 'certain' },
    ]);
  });

  test('the jurisdiction labels follow DEC-040', () => {
    expect(realRecord('model/jurisdictions/GR.yaml').label).toEqual({
      en: 'Greece',
      nl: 'Griekenland',
    });
    expect(realRecord('model/jurisdictions/BE.yaml').label).toEqual({
      en: 'Belgium',
      nl: 'België',
    });
  });

  test('vat-directive-art-215 is a law source with a legislation.gov.uk url and no eli', () => {
    const data = realRecord(ART_215);
    expect(data.type).toBe('law');
    expect(String(data.url)).toBe('https://www.legislation.gov.uk/eudr/2006/112/article/215');
    expect(data).not.toHaveProperty('eli');
    expect(String(data.title)).toContain('2006/112/EC');
    expect(String(data.title)).toContain('2020/1756');
  });
});

describe('the country-prefix vocabulary contract', () => {
  test('a second entry for the same prefix is an error at the second prefix value', () => {
    const file = prefixFile(`${prefixEntry('NL', 'NL')}${prefixEntry('NL', 'BE')}`);
    const second = file.text.lastIndexOf('prefix: NL');
    const before = file.text.slice(0, second).split('\n');
    expect(errorsOf(file)).toEqual([
      {
        file: PREFIX,
        line: before.length,
        column: (before.at(-1) ?? '').length + 'prefix: '.length + 1,
        message: 'duplicate member: each member may appear only once',
      },
    ]);
  });

  test('an entry that maps to an unknown jurisdiction fails at that value', () => {
    const file = prefixFile(prefixEntry('DE', 'DE'));
    const at = where(file.text, 'jurisdiction: DE');
    expect(errorsOf(file)).toEqual([
      {
        file: PREFIX,
        line: at.line,
        column: at.column + 'jurisdiction: '.length,
        message: '"DE" is not a known jurisdiction',
      },
    ]);
  });

  test('an entry without a source fails with the missing property', () => {
    const file = prefixFile('  - prefix: NL\n    jurisdiction: NL\n    certainty: certain\n');
    const problems = errorsOf(file);
    expect(problems.map((p) => p.message)).toEqual(['missing required property "source"']);
    expect(problems[0]).toMatchObject({ file: PREFIX, ...where(file.text, 'prefix: NL') });
  });

  test.each(['ELL', 'el', 'E', '1L'])('the prefix %s fails the pattern at its value', (prefix) => {
    const file = prefixFile(prefixEntry(prefix, 'GR'));
    const at = where(file.text, `prefix: ${prefix}`);
    const problems = errorsOf(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: PREFIX,
      line: at.line,
      column: at.column + 'prefix: '.length,
    });
    expect(problems[0]?.message).toContain('pattern');
  });

  test('an unknown property on an entry is rejected (the schema is closed)', () => {
    const file = prefixFile(`${prefixEntry('NL', 'NL')}    extra: 1\n`);
    expect(errorsOf(file).map((p) => p.message)).toEqual(['unknown property "extra"']);
  });

  describe('the map is a required vocabulary', () => {
    const roots: string[] = [];
    afterAll(() => {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    });

    test('a model copy without country-prefix.yaml reports the missing file', () => {
      const root = mkdtempSync(join(tmpdir(), 'uio-seed-'));
      roots.push(root);
      cpSync(join(REPO_ROOT, 'model'), join(root, 'model'), { recursive: true });
      rmSync(join(root, PREFIX));
      expect(checkModel(root)).toContainEqual({
        file: PREFIX,
        message: 'required vocabulary file is missing',
      });
    }, 30_000);
  });
});

const list = (directory: string): string[] =>
  readdirSync(join(REPO_ROOT, 'model', directory)).sort();

describe('the complete Phase 2 seed: six jurisdictions, four sources', () => {
  test('model/jurisdictions holds exactly BE, EU, GB, GR, NL and XI', () => {
    expect(list('jurisdictions')).toEqual([
      'BE.yaml',
      'EU.yaml',
      'GB.yaml',
      'GR.yaml',
      'NL.yaml',
      'XI.yaml',
    ]);
  });

  test('model/sources holds exactly the four seeded sources', () => {
    expect(list('sources')).toEqual([
      'hmrc-eori-introduction.yaml',
      'nia-1998-s1.yaml',
      'teu-art-52.yaml',
      'vat-directive-art-215.yaml',
    ]);
  });

  test('every part_of claim is one of the four sourced memberships', () => {
    const claims: string[] = [];
    for (const file of list('jurisdictions')) {
      const data = realRecord(`model/jurisdictions/${file}`);
      for (const claim of (data.part_of ?? []) as Record<string, string>[]) {
        claims.push(`${data.id}>${claim.jurisdiction}:${claim.source}:${claim.certainty}`);
      }
    }
    expect(claims.sort()).toEqual([
      'BE>EU:teu-art-52:certain',
      'GR>EU:teu-art-52:certain',
      'NL>EU:teu-art-52:certain',
      'XI>GB:nia-1998-s1:certain',
    ]);
  });

  test('XI and GB carry the EORI-area notes and the labels', () => {
    const xi = realRecord('model/jurisdictions/XI.yaml');
    const gb = realRecord('model/jurisdictions/GB.yaml');
    expect(xi.label).toEqual({ en: 'Northern Ireland', nl: 'Noord-Ierland' });
    expect(gb.label).toEqual({ en: 'United Kingdom', nl: 'Verenigd Koninkrijk' });
    expect(gb.part_of).toBeUndefined();
    expect(String((xi.notes as { en: string }).en)).toContain('EU legislation');
    expect(String((gb.notes as { en: string }).en)).toContain('England, Scotland and Wales');
    expect(String((xi.notes as { en: string }).en)).toContain('DEC-041');
  });

  test('the new sources are law and register-doc with a url and no eli', () => {
    const nia = realRecord('model/sources/nia-1998-s1.yaml');
    expect(nia.type).toBe('law');
    expect(nia.url).toBe('https://www.legislation.gov.uk/ukpga/1998/47/section/1');
    expect(nia.date).toBe('1998-11-19');
    expect(nia).not.toHaveProperty('eli');
    const hmrc = realRecord('model/sources/hmrc-eori-introduction.yaml');
    expect(hmrc.type).toBe('register-doc');
    expect(String(hmrc.url)).toBe(
      'https://www.gov.uk/guidance/economic-operators-registration-and-identification-eori/introduction',
    );
    expect(hmrc.publisher).toBe('HM Revenue & Customs (GOV.UK)');
    expect(hmrc).not.toHaveProperty('eli');
  });

  test('the real repository validates with no problem and no warning', () => {
    expect(runValidation(REPO_ROOT)).toEqual([]);
  });
});

describe('docs/gaps.md', () => {
  const gaps = (): string => readFileSync(join(REPO_ROOT, 'docs', 'gaps.md'), 'utf8');

  test('uses the four-part entry form and names the required gaps', () => {
    expect(gaps()).toContain('Open question');
    expect(gaps()).toContain('Why it is not in the model');
    expect(gaps()).toContain('Owner or next step');
    expect(gaps()).toMatch(/teu-art-52[\s\S]*ELI|ELI[\s\S]*teu-art-52/);
    expect(gaps()).toContain('vat-directive-art-215');
    expect(gaps()).toMatch(/United Kingdom[\s\S]*Great Britain|Great Britain[\s\S]*United Kingdom/);
  });

  test('holds no nine-digit number', () => {
    expect(gaps()).not.toMatch(/(^|[^0-9])[0-9]{9}([^0-9]|$)/);
  });
});
