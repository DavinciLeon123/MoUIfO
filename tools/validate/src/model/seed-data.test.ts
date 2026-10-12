import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { report } from '../index.ts';
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
