import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { describe, expect, test } from 'vitest';
import { cleanUrl, MANIFEST_FILE } from './export-landscape.ts';
import { PERSONAL_PATH_PATTERN, parseManifest } from './manifest.ts';
import {
  buildSnapshot,
  type CsvKey,
  type LandscapeCsvs,
  readLandscapeCsvs,
  type Snapshot,
  serializeSnapshot,
} from './snapshot.ts';
import { CSV_FILES, OVERVIEW_COLUMNS, SNAPSHOT_FILE } from './snapshot-map.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const SOURCES = join(REPO, 'sources');
const SCRIPT = join(HERE, 'snapshot.ts');

const SCHEME_IDS = [
  'bsn',
  'duns',
  'eori',
  'euid',
  'fi-number',
  'gln',
  'kvk-establishment-number',
  'kvk-number',
  'lei',
  'oin',
  'peppol-id',
  'roo',
  'rsin',
  'vat',
  'vat-nl',
];

function build(): Snapshot {
  return buildSnapshot(readLandscapeCsvs(SOURCES));
}

function committedText(): string {
  return readFileSync(join(SOURCES, SNAPSHOT_FILE), 'utf8');
}

function linkGrid(): string[][] {
  return parse(readFileSync(join(SOURCES, CSV_FILES.links), 'utf8')) as string[][];
}

/** The committed CSVs with one of them transformed as text; the bytes of the others stay exact. */
function withCsv(key: CsvKey, transform: (text: string) => string): LandscapeCsvs {
  const csvs = readLandscapeCsvs(SOURCES);
  const original = csvs[key];
  const text = transform(Buffer.from(original.bytes).toString('utf8'));
  return { ...csvs, [key]: { name: original.name, bytes: Buffer.from(text, 'utf8') } };
}

function runSnapshot(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('determinism and the committed snapshot', () => {
  test('two builds serialize byte-identically', () => {
    expect(serializeSnapshot(build())).toBe(serializeSnapshot(build()));
  });

  test('the serialized build equals the committed snapshot byte for byte', () => {
    expect(serializeSnapshot(build())).toBe(committedText());
  });
});

describe('hyperlinks (DAT-04, T-03-01)', () => {
  test('all 40 links are listed in links-CSV order with tab, cell, text and url', () => {
    const rows = linkGrid();
    expect(rows[0]).toEqual(['tab', 'cell', 'text', 'url']);
    expect(build().links.map((l) => [l.tab, l.cell, l.text, l.url])).toEqual(rows.slice(1));
    expect(build().links).toHaveLength(40);
  });

  test('the links hold 26 distinct URLs, 32 primary and 8 glossary links', () => {
    const { links } = build();
    expect(new Set(links.map((l) => l.url)).size).toBe(26);
    expect(links.filter((l) => l.field === 'glossary')).toHaveLength(8);
    expect(links.filter((l) => l.field !== 'glossary')).toHaveLength(32);
  });

  test('every URL starts with http:// or https:// and cleanUrl leaves it unchanged', () => {
    for (const link of build().links) {
      expect(link.url, link.cell).toMatch(/^https?:\/\//);
      expect(cleanUrl(link.url).url, link.cell).toBe(link.url);
    }
  });

  test('each primary link names the schemes of its column, glossary links name none', () => {
    for (const link of build().links) {
      if (link.field === 'glossary') {
        expect(link.schemes, link.cell).toEqual([]);
      } else {
        expect(link.schemes, link.cell).toEqual([...(OVERVIEW_COLUMNS[link.column] ?? [])]);
        expect(link.schemes.length, link.cell).toBeGreaterThan(0);
      }
    }
  });

  test('the J links name both vat and vat-nl', () => {
    const j = build().links.filter((l) => l.column === 'J' && l.field !== 'glossary');
    expect(j.length).toBeGreaterThan(0);
    for (const link of j) expect(link.schemes, link.cell).toEqual(['vat', 'vat-nl']);
  });
});

describe('inputs and schemes', () => {
  test('inputs hold the SHA-256 of the three committed CSVs, equal to the export manifest', () => {
    const manifest = Object.fromEntries(
      parseManifest(readFileSync(join(SOURCES, MANIFEST_FILE), 'utf8')).map((e) => [
        e.name,
        e.hash,
      ]),
    );
    expect(build().inputs).toEqual(manifest);
    expect(Object.keys(build().inputs).sort()).toEqual(Object.values(CSV_FILES).sort());
  });

  test('the snapshot holds exactly the fifteen workbook schemes and no kbo entry', () => {
    const schemes = Object.keys(build().schemes).sort();
    expect(schemes).toEqual(SCHEME_IDS);
    expect(schemes).not.toContain('kbo');
  });
});

describe('content hygiene (T-03-02, D-11)', () => {
  test('the serialized snapshot has no personal path, no timestamp and no model source id', () => {
    const text = committedText();
    expect(PERSONAL_PATH_PATTERN.test(text)).toBe(false);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toContain('.yaml');
  });
});

describe('source discipline (DEC-014)', () => {
  test.each(['snapshot.ts', 'snapshot-map.ts'])(
    '%s imports neither the xlsx package nor export-landscape',
    (file) => {
      const text = readFileSync(join(HERE, file), 'utf8');
      const specifiers = [
        ...text.matchAll(
          /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm,
        ),
      ].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
      expect(specifiers.filter((s) => /xlsx|export-landscape/.test(s))).toEqual([]);
    },
  );
});

describe('import:snapshot CLI', () => {
  test('--check exits 0 on the committed tree', () => {
    const result = runSnapshot(['--sources', SOURCES, '--check']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  test('--check exits 1 when one byte of the snapshot differs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uio-snapshot-'));
    try {
      for (const name of Object.values(CSV_FILES))
        copyFileSync(join(SOURCES, name), join(dir, name));
      const changed = committedText().replace('"format": 1', '"format": 2');
      expect(changed).not.toBe(committedText());
      writeFileSync(join(dir, SNAPSHOT_FILE), changed);
      const result = runSnapshot(['--sources', dir, '--check']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('is out of date');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('without --check the snapshot is written and reproduces the committed file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uio-snapshot-'));
    try {
      for (const name of Object.values(CSV_FILES))
        copyFileSync(join(SOURCES, name), join(dir, name));
      const result = runSnapshot(['--sources', dir]);
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(join(dir, SNAPSHOT_FILE), 'utf8')).toBe(committedText());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildSnapshot refuses inputs it cannot map (T-03-01, T-03-03)', () => {
  test('a link whose URL is not http(s) is refused and its cell is named', () => {
    const csvs = withCsv('links', (t) =>
      t.replace(',https://www.kvk.nl/\n', ',javascript:alert(1)\n'),
    );
    expect(() => buildSnapshot(csvs)).toThrow(/Overview UIDs!F15/);
  });

  test('a link on another tab is refused and its cell is named', () => {
    const csvs = withCsv('links', (t) => t.replace('Overview UIDs,F13,', 'Persistence,F13,'));
    expect(() => buildSnapshot(csvs)).toThrow(/F13/);
  });

  test('a shifted overview export fails on the first column whose name differs', () => {
    const csvs = withCsv('overview', (t) => t.replace('OIN,RSIN,VAT-nr', 'RSIN,OIN,VAT-nr'));
    expect(() => buildSnapshot(csvs)).toThrow(/Overview UIDs!H7/);
  });
});
