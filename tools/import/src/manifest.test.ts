import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { describe, expect, test } from 'vitest';
import { LINKS_FILE, MANIFEST_FILE, manifestText, TAB_FILES } from './export-landscape.ts';
import { PERSONAL_PATH_PATTERN, parseManifest, verifyManifest } from './manifest.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCES = join(REPO, 'sources');
const OVERVIEW = TAB_FILES['Overview UIDs'];
const PERSISTENCE = TAB_FILES.Persistence;

const HASH = 'a'.repeat(64);

describe('parseManifest', () => {
  test('parses sorted coreutils lines', () => {
    expect(parseManifest(`${HASH}  a.csv\n${'b'.repeat(64)}  b.csv\n`)).toEqual([
      { hash: HASH, name: 'a.csv' },
      { hash: 'b'.repeat(64), name: 'b.csv' },
    ]);
  });

  test.each([
    ['short hash', `${'a'.repeat(63)}  a.csv\n`],
    ['uppercase hash', `${'A'.repeat(64)}  a.csv\n`],
    ['single space', `${HASH} a.csv\n`],
    ['three spaces', `${HASH}   a.csv\n`],
    ['binary marker', `${HASH} *a.csv\n`],
    ['no name', `${HASH}  \n`],
    ['blank line inside', `${HASH}  a.csv\n\n${HASH}  b.csv\n`],
    ['garbage', 'hello\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseManifest(text)).toThrow();
  });
});

describe('verifyManifest', () => {
  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'uio-manifest-'));
    const files = { 'one.csv': 'alpha\n', 'two.csv': 'beta\n' };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    writeFileSync(join(dir, MANIFEST_FILE), manifestText(files));
    return dir;
  }

  test('no problems for matching files', () => {
    const dir = fixture();
    try {
      expect(verifyManifest(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a changed byte names the file', () => {
    const dir = fixture();
    try {
      writeFileSync(join(dir, 'two.csv'), 'betA\n');
      const problems = verifyManifest(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]?.file).toBe('two.csv');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a listed file that is missing is a problem', () => {
    const dir = fixture();
    try {
      rmSync(join(dir, 'one.csv'));
      const problems = verifyManifest(dir);
      expect(problems.map((p) => p.file)).toEqual(['one.csv']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an unlisted landscape file is a problem, other files are ignored', () => {
    const dir = fixture();
    try {
      writeFileSync(join(dir, 'landscape-v1.2-extra.csv'), 'x\n');
      writeFileSync(join(dir, 'README.md'), 'ignored\n');
      const problems = verifyManifest(dir);
      expect(problems.map((p) => p.file)).toEqual(['landscape-v1.2-extra.csv']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a missing manifest is a problem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uio-manifest-'));
    try {
      expect(verifyManifest(dir).map((p) => p.file)).toEqual([MANIFEST_FILE]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('PERSONAL_PATH_PATTERN', () => {
  test.each([
    'https://tenant.sharepoint.com/sites/x',
    'C:\\Users\\someone\\Documents',
    'D:\\data',
    'file:///tmp/x',
    '/Users/someone/Desktop',
    'My OneDrive folder',
    'ONEDRIVE',
    'SharePoint',
  ])('matches %s', (text) => {
    expect(PERSONAL_PATH_PATTERN.test(text)).toBe(true);
  });

  test.each([
    'https://eur-lex.europa.eu/eli/reg/2013/952/oj',
    'https://www.kvk.nl/over-het-handelsregister/',
    'https://ec.europa.eu/taxation_customs/vies/#/vat-validation',
    'Netherlands Chamber of Commerce',
  ])('does not match %s', (text) => {
    expect(PERSONAL_PATH_PATTERN.test(text)).toBe(false);
  });
});

// The committed CSVs may only be added after Davinci Conclusion's written CC-BY confirmation (DEC-015, plan 01-08).
describe('committed landscape export', () => {
  const manifestPath = join(SOURCES, MANIFEST_FILE);

  test.skipIf(!existsSync(manifestPath))(
    'committed landscape CSVs match the manifest (skipped until Davinci Conclusion CC-BY confirmation, D-13)',
    () => {
      expect(verifyManifest(SOURCES)).toEqual([]);
      const listed = parseManifest(readFileSync(manifestPath, 'utf8'))
        .map((e) => e.name)
        .sort();
      expect(listed).toEqual([LINKS_FILE, OVERVIEW, PERSISTENCE].sort());
      for (const name of listed) {
        const text = readFileSync(join(SOURCES, name), 'utf8');
        expect(text.charCodeAt(0), `${name} BOM`).not.toBe(0xfeff);
        expect(text, `${name} CR`).not.toContain('\r');
        expect(text.endsWith('\n') && !text.endsWith('\n\n'), `${name} trailing LF`).toBe(true);
        expect(PERSONAL_PATH_PATTERN.test(text), `${name} personal path marker`).toBe(false);
        expect(text, `${name} tracking parameter`).not.toMatch(/[?&](utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|_gl|_ga|mc_cid|mc_eid)=/i);
        expect(text, `${name} text fragment`).not.toContain('#:~:');
        const rows = parse(text, { relax_column_count: false }) as string[][];
        expect(new Set(rows.map((r) => r.length)).size, `${name} row widths`).toBe(1);
        if (name === LINKS_FILE) {
          expect(rows[0]).toEqual(['tab', 'cell', 'text', 'url']);
          expect(rows.length - 1).toBe(40);
        }
        if (name === OVERVIEW) {
          expect(text).toContain('Authors:');
          expect(text).toContain('Organisation:');
        }
      }
    },
  );
});

describe('workbook is never committed', () => {
  test('git ls-files lists no xlsx and the local workbook is ignored (D-12)', () => {
    const tracked = execFileSync('git', ['ls-files', '--', '*.xlsx'], { cwd: REPO, encoding: 'utf8' });
    expect(tracked).toBe('');
    expect(() => execFileSync('git', ['check-ignore', '-q', 'UID-table - v1.2.xlsx'], { cwd: REPO })).not.toThrow();
  });
});
