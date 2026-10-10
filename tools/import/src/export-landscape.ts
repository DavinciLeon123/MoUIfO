// Sanitising Excel -> CSV export of the UID table (D-10, D-11, D-19, D-20).
// Only cell values leave the workbook: document properties, author fields and storage paths are dropped.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';

export const TAB_FILES = {
  'Overview UIDs': 'landscape-v1.2-overview-uids.csv',
  Persistence: 'landscape-v1.2-persistence.csv',
} as const;
export const LINKS_FILE = 'landscape-v1.2-links.csv';
export const MANIFEST_FILE = 'landscape-v1.2.sha256';

const TRACKING =
  /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|_gl|_ga|mc_cid|mc_eid)$/i;

/** Drop tracking query parameters and the browser "#:~:" text directive; keep other fragments such as "#/route". */
export function cleanUrl(raw: string): { url: string; removed: string[] } {
  const removed: string[] = [];
  let url = raw.trim();
  const h = url.indexOf('#');
  let hash = h >= 0 ? url.slice(h) : '';
  if (h >= 0) url = url.slice(0, h);
  const q = url.indexOf('?');
  if (q >= 0) {
    const kept = url
      .slice(q + 1)
      .split('&')
      .filter((param) => {
        const key = param.split('=')[0] ?? '';
        if (TRACKING.test(key)) {
          removed.push(key);
          return false;
        }
        return param !== '';
      });
    url = url.slice(0, q) + (kept.length > 0 ? `?${kept.join('&')}` : '');
  }
  const f = hash.indexOf(':~:');
  if (f >= 0) {
    removed.push('#:~:');
    hash = hash.slice(0, f);
  }
  return { url: url + (hash === '#' ? '' : hash), removed };
}

/** Verbatim cell text (no trimming); CRLF and CR become LF. Unsupported or oddly displayed cells throw. */
export function cellText(cell: XLSX.CellObject | undefined, addr: string): string {
  if (!cell || cell.t === 'z') return '';
  let text: string;
  if (cell.t === 's') {
    text = String(cell.v);
  } else if (cell.t === 'n') {
    text = cell.w ?? String(cell.v);
    if (/[eE][+-]?\d|#/.test(text))
      throw new Error(`numeric cell ${addr} not plainly formatted: ${text}`);
  } else {
    throw new Error(`unsupported cell type '${cell.t}' at ${addr}`);
  }
  return text.replace(/\r\n?/g, '\n');
}

export type ExportResult = {
  files: Record<string, string>;
  links: number;
  removedParams: string[];
};

/** Export both tabs anchored at A1 (so CSV column N is spreadsheet column N) plus the hyperlink list. */
export function exportWorkbook(buf: Uint8Array): ExportResult {
  const wb = XLSX.read(buf, { type: 'buffer', cellText: true, cellFormula: true });
  const files: Record<string, string> = {};
  const linkRows: string[][] = [['tab', 'cell', 'text', 'url']];
  const removedParams: string[] = [];
  for (const [tab, file] of Object.entries(TAB_FILES)) {
    const ws = wb.Sheets[tab];
    if (!ws) throw new Error(`workbook has no '${tab}' tab`);
    const end = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').e;
    const rows: string[][] = [];
    for (let r = 0; r <= end.r; r++) {
      const row: string[] = [];
      for (let c = 0; c <= end.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ws[address] as XLSX.CellObject | undefined;
        const text = cellText(cell, `${tab}!${address}`);
        row.push(text);
        const target = cell?.l?.Target;
        if (target) {
          const cleaned = cleanUrl(target);
          removedParams.push(...cleaned.removed);
          linkRows.push([tab, address, text, cleaned.url]);
        }
      }
      rows.push(row);
    }
    files[file] = stringify(rows, { record_delimiter: 'unix' });
  }
  files[LINKS_FILE] = stringify(linkRows, { record_delimiter: 'unix' });
  return { files, links: linkRows.length - 1, removedParams };
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** coreutils `sha256sum` manifest: `<hash>  <name>` lines sorted by name, trailing LF. */
export function manifestText(files: Record<string, string>): string {
  return `${Object.keys(files)
    .sort()
    .map((name) => `${sha256Hex(files[name] as string)}  ${name}`)
    .join('\n')}\n`;
}

/** Write the three CSVs and the manifest into outDir (created if needed). */
export function writeExport(outDir: string, result: ExportResult): void {
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(result.files))
    writeFileSync(join(outDir, name), content, 'utf8');
  writeFileSync(join(outDir, MANIFEST_FILE), manifestText(result.files), 'utf8');
}
