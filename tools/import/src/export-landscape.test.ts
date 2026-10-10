import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import {
  cellText,
  cleanUrl,
  exportWorkbook,
  LINKS_FILE,
  MANIFEST_FILE,
  manifestText,
  sha256Hex,
  TAB_FILES,
  writeExport,
} from './export-landscape.ts';

type Rows = (string | number)[][];

function sheet(rows: Rows, ref?: string): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (ref !== undefined) ws['!ref'] = ref;
  return ws;
}

function workbook(tabs: Record<string, XLSX.WorkSheet>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of Object.entries(tabs)) XLSX.utils.book_append_sheet(wb, ws, name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

function basic(overview: Rows = [['a']], persistence: Rows = [['b']]): Uint8Array {
  return workbook({ 'Overview UIDs': sheet(overview), Persistence: sheet(persistence) });
}

const OVERVIEW = TAB_FILES['Overview UIDs'];
const PERSISTENCE = TAB_FILES.Persistence;

describe('constants', () => {
  test('file names follow the landscape v1.2 naming', () => {
    expect(OVERVIEW).toBe('landscape-v1.2-overview-uids.csv');
    expect(PERSISTENCE).toBe('landscape-v1.2-persistence.csv');
    expect(LINKS_FILE).toBe('landscape-v1.2-links.csv');
    expect(MANIFEST_FILE).toBe('landscape-v1.2.sha256');
  });
});

describe('cleanUrl', () => {
  test('removes tracking parameters and text fragments', () => {
    const r = cleanUrl('https://example.org/p?utm_source=x&id=7#:~:text=foo');
    expect(r.url).toBe('https://example.org/p?id=7');
    expect(r.removed).toEqual(['utm_source', '#:~:']);
  });

  test('keeps single-page-app fragments', () => {
    expect(cleanUrl('https://example.org/#/route').url).toBe('https://example.org/#/route');
  });

  test('removes every listed tracking key case-insensitively and drops an empty query', () => {
    const keys = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'dclid', '_gl', '_ga', 'mc_cid', 'mc_eid', 'UTM_Medium'];
    const raw = `https://example.org/a?${keys.map((k) => `${k}=1`).join('&')}`;
    const r = cleanUrl(raw);
    expect(r.url).toBe('https://example.org/a');
    expect(r.removed).toHaveLength(keys.length);
  });

  test('a fragment holding only a text directive leaves no bare hash', () => {
    expect(cleanUrl('https://example.org/a#:~:text=x').url).toBe('https://example.org/a');
  });

  test('keeps a fragment that precedes a text directive', () => {
    expect(cleanUrl('https://example.org/a#sec:~:text=x').url).toBe('https://example.org/a#sec');
  });

  test('leaves clean urls untouched', () => {
    const r = cleanUrl('https://example.org/a?x=1&y=2');
    expect(r.url).toBe('https://example.org/a?x=1&y=2');
    expect(r.removed).toEqual([]);
  });
});

describe('cellText', () => {
  test('empty for missing and stub cells', () => {
    expect(cellText(undefined, 'A1')).toBe('');
    expect(cellText({ t: 'z' }, 'A1')).toBe('');
  });

  test('strings are verbatim apart from line endings', () => {
    expect(cellText({ t: 's', v: ' 000123 ' }, 'A1')).toBe(' 000123 ');
    expect(cellText({ t: 's', v: 'a\r\nb\rc' }, 'A1')).toBe('a\nb\nc');
  });

  test('numbers use the displayed text', () => {
    expect(cellText({ t: 'n', v: 42, w: '42' }, 'A1')).toBe('42');
    expect(cellText({ t: 'n', v: 7 }, 'A1')).toBe('7');
  });

  test('unsupported types and unusual number displays throw with the address', () => {
    expect(() => cellText({ t: 'b', v: true }, 'C3')).toThrow("unsupported cell type 'b' at C3");
    expect(() => cellText({ t: 'e', v: 0x07 }, 'D4')).toThrow("unsupported cell type 'e' at D4");
    expect(() => cellText({ t: 'd', v: new Date(0) }, 'E5')).toThrow("unsupported cell type 'd' at E5");
    expect(() => cellText({ t: 'n', v: 1e10, w: '1E+10' }, 'B2')).toThrow('B2');
    expect(() => cellText({ t: 'n', v: 5, w: '####' }, 'B3')).toThrow('B3');
  });
});

describe('exportWorkbook', () => {
  test('yields the two tab CSVs and the links CSV', () => {
    const r = exportWorkbook(basic([['x', 'y'], ['1', '2']], [['p']]));
    expect(Object.keys(r.files).sort()).toEqual([LINKS_FILE, PERSISTENCE, OVERVIEW].sort());
    expect(r.files[OVERVIEW]).toBe('x,y\n1,2\n');
    expect(r.files[PERSISTENCE]).toBe('p\n');
    expect(r.files[LINKS_FILE]).toBe('tab,cell,text,url\n');
    expect(r.links).toBe(0);
  });

  test('anchors at A1 when the used range starts at B1', () => {
    // aoa_to_sheet places data at A1:B2; re-address so the data sits at B1:C2.
    const ws = sheet([['x', 'y'], ['z', 'w']]);
    const shifted: XLSX.WorkSheet = {};
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      const a = XLSX.utils.decode_cell(key);
      shifted[XLSX.utils.encode_cell({ r: a.r, c: a.c + 1 })] = ws[key] as XLSX.CellObject;
    }
    shifted['!ref'] = 'B1:C2';
    const r = exportWorkbook(workbook({ 'Overview UIDs': sheet([['a']]), Persistence: shifted }));
    const rows = parse(r.files[PERSISTENCE] as string, { relax_column_count: false }) as string[][];
    expect(rows).toEqual([
      ['', 'x', 'y'],
      ['', 'z', 'w'],
    ]);
  });

  test('keeps leading zeros and numbers, and round-trips comma, quote and CRLF', () => {
    const tricky = 'a, "b"\r\nsecond line';
    const r = exportWorkbook(basic([['000123', 42, tricky]]));
    const rows = parse(r.files[OVERVIEW] as string) as string[][];
    expect(rows).toEqual([['000123', '42', 'a, "b"\nsecond line']]);
  });

  test('keeps whitespace-only and non-breaking-space cells byte-identical', () => {
    const r = exportWorkbook(basic([['  ', ' ', 'x']]));
    const rows = parse(r.files[OVERVIEW] as string, { trim: false }) as string[][];
    expect(rows).toEqual([['  ', ' ', 'x']]);
  });

  test('output has no BOM, no CR, one trailing LF, equal widths and is reproducible', () => {
    const buf = basic([['a', 'b', 'c'], ['d'], [], ['e', '', 'f']], [['x', 'y']]);
    const one = exportWorkbook(buf);
    const two = exportWorkbook(buf);
    expect(two.files).toEqual(one.files);
    for (const text of Object.values(one.files)) {
      expect(text.charCodeAt(0)).not.toBe(0xfeff);
      expect(text).not.toContain('\r');
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
    }
    const rows = parse(one.files[OVERVIEW] as string, { relax_column_count: false }) as string[][];
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([3]));
  });

  test('collects hyperlinks row-major with cleaned urls, including linked empty cells', () => {
    const overview = sheet([['first', 'plain'], ['', 'second']]);
    (overview.A1 as XLSX.CellObject).l = { Target: 'https://example.org/p?utm_source=x&id=7#:~:text=foo' };
    (overview.B2 as XLSX.CellObject).l = { Target: 'https://example.org/#/route' };
    overview.A2 = { t: 's', v: '', l: { Target: 'https://example.org/empty?gclid=9' } };
    const persistence = sheet([['link']]);
    (persistence.A1 as XLSX.CellObject).l = { Target: 'https://example.org/persist' };
    const r = exportWorkbook(workbook({ 'Overview UIDs': overview, Persistence: persistence }));
    expect(r.links).toBe(4);
    expect(r.removedParams.sort()).toEqual(['#:~:', 'gclid', 'utm_source'].sort());
    const rows = parse(r.files[LINKS_FILE] as string) as string[][];
    expect(rows).toEqual([
      ['tab', 'cell', 'text', 'url'],
      ['Overview UIDs', 'A1', 'first', 'https://example.org/p?id=7'],
      ['Overview UIDs', 'A2', '', 'https://example.org/empty'],
      ['Overview UIDs', 'B2', 'second', 'https://example.org/#/route'],
      ['Persistence', 'A1', 'link', 'https://example.org/persist'],
    ]);
  });

  test('throws naming the address for a boolean cell', () => {
    const ws = sheet([['a']]);
    ws.B2 = { t: 'b', v: true };
    ws['!ref'] = 'A1:B2';
    expect(() => exportWorkbook(workbook({ 'Overview UIDs': ws, Persistence: sheet([['b']]) }))).toThrow(/B2/);
  });

  test('throws for a number displayed in exponent form', () => {
    const ws = sheet([['a']]);
    ws.B1 = { t: 'n', v: 1e10, w: '1E+10' };
    ws['!ref'] = 'A1:B1';
    expect(() => exportWorkbook(workbook({ 'Overview UIDs': ws, Persistence: sheet([['b']]) }))).toThrow(/B1/);
  });

  test('throws when a tab is missing', () => {
    expect(() => exportWorkbook(workbook({ 'Overview UIDs': sheet([['a']]) }))).toThrow(/Persistence/);
  });
});

describe('manifestText and writeExport', () => {
  test('manifest lines are sorted by name, two-space separated, with a trailing LF', () => {
    const text = manifestText({ 'b.csv': 'two', 'a.csv': 'one' });
    expect(text).toBe(`${sha256Hex('one')}  a.csv\n${sha256Hex('two')}  b.csv\n`);
  });

  test('sha256Hex matches a known vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('writeExport writes the three CSVs and the manifest, which verifies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uio-export-'));
    try {
      const out = join(dir, 'nested', 'out');
      const result = exportWorkbook(basic([['a', 'b']], [['c']]));
      writeExport(out, result);
      expect(readdirSync(out).sort()).toEqual([LINKS_FILE, MANIFEST_FILE, OVERVIEW, PERSISTENCE].sort());
      const manifest = readFileSync(join(out, MANIFEST_FILE), 'utf8');
      expect(manifest).toBe(manifestText(result.files));
      expect(existsSync(join(out, OVERVIEW))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
