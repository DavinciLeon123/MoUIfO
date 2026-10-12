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
  test('the snapshot holds no personal path, no timestamp and no model source id', () => {
    const text = committedText();
    // PERSONAL_PATH_PATTERN is applied to the decoded string values, not the JSON text: its
    // case-insensitive drive-letter alternative would match the escaped line break after "they:"
    // (serialized as `:\n`) in a verbatim cell. The decoded values hold no such false positive.
    const values: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') values.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(JSON.parse(text));
    expect(PERSONAL_PATH_PATTERN.test(values.join('\n'))).toBe(false);
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

describe('workbook values per scheme (D-03, D-11)', () => {
  const TRUST_KEYS = [
    'legal_basis',
    'registration_quality',
    'verifiability',
    'crosswalks',
    'lifecycle',
  ];
  const EVENTS = [
    'merger',
    'acquisition-without-merger',
    'split',
    'dissolution',
    'move-within-country',
    'move-to-other-country',
  ];

  test('the workbook title, version and date are copied verbatim', () => {
    expect(build().workbook).toEqual({
      title: 'Analysis of Unique Identifiers for Organisations',
      version: '1.2',
      date: 'July 3rd, 2026',
    });
  });

  test('kvk-number carries its format, legal basis, trust, persistence and examples', () => {
    const kvk = build().schemes['kvk-number'];
    expect(kvk?.fields.format).toBe('NL: unique ID - num(8)');
    expect(kvk?.fields.legal_basis).toBe('NL: Handelswet');
    expect(kvk?.trust).toEqual({
      legal_basis: 2,
      registration_quality: 1,
      verifiability: 1,
      crosswalks: 1,
      lifecycle: 1,
    });
    expect(kvk?.persistence.merger).toBe('New number for merged entity');
    expect(kvk?.persistence.summary).toBe('medium');
    expect(kvk?.examples).toEqual([
      { row: 39, label: 'ABN AMRO Schadeverzekering N.V.', value: '05058078' },
      { row: 40, label: 'ABN AMRO Hypotheken Groep B.V.', value: '08024285' },
    ]);
  });

  test('bsn and fi-number hold null for every trust score, never 0', () => {
    const schemes = build().schemes;
    for (const id of ['bsn', 'fi-number']) {
      for (const key of TRUST_KEYS) expect(schemes[id]?.trust[key], `${id} ${key}`).toBeNull();
    }
  });

  test('bsn reads n/a in its six events and summary, fi-number summary is medium', () => {
    const schemes = build().schemes;
    for (const key of [...EVENTS, 'summary']) {
      expect(schemes.bsn?.persistence[key], key).toBe('n/a');
    }
    expect(schemes['fi-number']?.persistence.summary).toBe('medium');
  });

  test('gln carries the two persistence notes verbatim and a summary of Low', () => {
    const gln = build().schemes.gln;
    expect(gln?.persistence.summary).toBe('Low');
    expect(gln?.persistence.notes).toEqual([
      "'Recommended new' because a GLN is not legally bound to the register. GLN identifies a location, not necessarily a legal entity.",
      'Still, it is strongly recommended not to reuse any GLN.',
    ]);
  });

  test('vat and vat-nl are deep-equal and every other entry differs from every other', () => {
    const schemes = build().schemes;
    expect(schemes['vat-nl']).toEqual(schemes.vat);
    const seen = new Map<string, string>();
    for (const id of SCHEME_IDS.filter((x) => x !== 'vat-nl')) {
      const key = JSON.stringify(schemes[id]);
      expect(seen.has(key), `${id} repeats ${seen.get(key)}`).toBe(false);
      seen.set(key, id);
    }
  });

  test('for the twelve assessed columns the five sub-scores sum to the row-36 total', () => {
    const grid = parse(readFileSync(join(SOURCES, CSV_FILES.overview), 'utf8'), {
      relax_column_count: true,
    }) as string[][];
    const assessed = Object.entries(build().schemes).filter(([, e]) =>
      'FGHIJKLMNOPQ'.includes(e.columns.overview),
    );
    expect(assessed).toHaveLength(13);
    for (const [id, entry] of assessed) {
      const total = Number(grid[35]?.[entry.columns.overview.charCodeAt(0) - 65]);
      const sum = Object.values(entry.trust).reduce<number>((acc, v) => acc + (v ?? 0), 0);
      expect(sum, id).toBe(total);
    }
  });

  test('an empty Overview cell is null and a multi-line cell keeps its line feeds', () => {
    const schemes = build().schemes;
    expect(schemes['kvk-number']?.fields.legal_basis_continued).toBeNull();
    expect(schemes.vat?.fields.format).toContain('\n');
  });

  test('kvk-establishment-number and roo read N/A verbatim for a move to another country', () => {
    const schemes = build().schemes;
    expect(schemes['kvk-establishment-number']?.persistence['move-to-other-country']).toBe('N/A');
    expect(schemes.roo?.persistence['move-to-other-country']).toBe('N/A');
  });
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
