// Deterministic importer from the committed landscape CSVs to one JSON snapshot (DAT-04, D-11).
// It reads only the three CSVs (DEC-014): never the workbook and never the xlsx package. Values are
// copied verbatim (nothing is trimmed, case-folded or interpreted); no timestamp or path is written.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';
import {
  CSV_FILES,
  EXAMPLE_ROWS,
  FIELD_ROWS,
  GLOSSARY_LINK_ROWS,
  LINK_FIELDS,
  OVERVIEW_COLUMNS,
  OVERVIEW_NAME_ROW,
  OVERVIEW_NAMES,
  OVERVIEW_TAB,
  PERSISTENCE_COLUMNS,
  PERSISTENCE_NAME_ROW,
  PERSISTENCE_NAMES,
  PERSISTENCE_NOTE_ROWS,
  PERSISTENCE_ROWS,
  PERSISTENCE_TAB,
  PRIMARY_LINK_ROWS,
  SNAPSHOT_FILE,
  TRUST_ROWS,
} from './snapshot-map.ts';

export type CsvKey = keyof typeof CSV_FILES;
export type CsvBytes = { name: string; bytes: Uint8Array };
export type LandscapeCsvs = Record<CsvKey, CsvBytes>;

export type Example = { row: number; label: string; value: string };

export type SchemeEntry = {
  columns: { overview: string; persistence: string };
  fields: Record<string, string | null>;
  trust: Record<string, number | null>;
  persistence: Record<string, string | string[] | null>;
  examples: Example[];
};

export type LinkEntry = {
  tab: string;
  cell: string;
  column: string;
  row: number;
  field: string;
  schemes: string[];
  text: string;
  url: string;
};

export type Snapshot = {
  format: 1;
  workbook: { title: string; version: string; date: string };
  inputs: Record<string, string>;
  schemes: Record<string, SchemeEntry>;
  links: LinkEntry[];
};

type Grid = string[][];

/** Read the three committed CSVs as exact bytes; the hashes in the snapshot come from these bytes. */
export function readLandscapeCsvs(sourcesDir: string): LandscapeCsvs {
  const read = (key: CsvKey): CsvBytes => ({
    name: CSV_FILES[key],
    bytes: readFileSync(join(sourcesDir, CSV_FILES[key])),
  });
  return { overview: read('overview'), persistence: read('persistence'), links: read('links') };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decode(csv: CsvBytes): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(csv.bytes);
}

function parseTab(csv: CsvBytes): Grid {
  return parse(decode(csv), { relax_column_count: true }) as Grid;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Cell text at a spreadsheet address (1-based row); an absent cell is the empty string. */
function cellAt(grid: Grid, column: string, row: number): string {
  return grid[row - 1]?.[columnIndex(column)] ?? '';
}

function address(tab: string, column: string, row: number): string {
  return `${tab}!${column}${row}`;
}

/** Map every letter (or every scheme id) to its one entry; a duplicate is a configuration error. */
function invert(map: Readonly<Record<string, readonly string[]>>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [letter, ids] of Object.entries(map)) {
    for (const id of ids) {
      if (out.has(id)) throw new Error(`scheme ${id} is mapped to two columns`);
      out.set(id, letter);
    }
  }
  return out;
}

function checkNames(
  grid: Grid,
  tab: string,
  row: number,
  names: Readonly<Record<string, string>>,
): void {
  for (const [column, name] of Object.entries(names)) {
    if (cellAt(grid, column, row) !== name) {
      throw new Error(
        `${address(tab, column, row)} does not hold the expected column name '${name}'`,
      );
    }
  }
}

/** Empty cell text is null; any other text is kept exactly as written. */
function nullable(text: string): string | null {
  return text === '' ? null : text;
}

/** A trust score is an integer within 0..max; an empty cell (not assessed) is null, anything else throws. */
function trustScore(text: string, max: number, at: string): number | null {
  if (text === '') return null;
  if (!/^[0-9]+$/.test(text) || Number(text) > max) {
    throw new Error(`${at} is not a trust score within 0..${max}`);
  }
  return Number(text);
}

function buildScheme(
  overviewColumn: string,
  persistenceColumn: string,
  overview: Grid,
  persistence: Grid,
): SchemeEntry {
  const fields = Object.fromEntries(
    Object.entries(FIELD_ROWS).map(([row, key]) => [
      key,
      nullable(cellAt(overview, overviewColumn, Number(row))),
    ]),
  );
  const trust = Object.fromEntries(
    Object.entries(TRUST_ROWS).map(([row, { key, max }]) => [
      key,
      trustScore(
        cellAt(overview, overviewColumn, Number(row)),
        max,
        address(OVERVIEW_TAB, overviewColumn, Number(row)),
      ),
    ]),
  );
  const events = Object.entries(PERSISTENCE_ROWS).map(([row, key]) => [
    key,
    nullable(cellAt(persistence, persistenceColumn, Number(row))),
  ]);
  const notes = PERSISTENCE_NOTE_ROWS.map((row) =>
    cellAt(persistence, persistenceColumn, row),
  ).filter((text) => text !== '');
  const examples = EXAMPLE_ROWS.flatMap((row) => {
    const value = cellAt(overview, overviewColumn, row);
    return value === '' ? [] : [{ row, label: cellAt(overview, 'D', row), value }];
  });
  return {
    columns: { overview: overviewColumn, persistence: persistenceColumn },
    fields,
    trust,
    persistence: { ...Object.fromEntries(events), notes },
    examples,
  };
}

function parseLinks(csv: CsvBytes): Grid {
  return parse(decode(csv)) as Grid;
}

function buildLinks(grid: Grid): LinkEntry[] {
  const [header, ...rows] = grid;
  if (header?.join(',') !== 'tab,cell,text,url') {
    throw new Error(`${CSV_FILES.links} header is not tab,cell,text,url`);
  }
  return rows.map((record, index) => {
    const [tab = '', cell = '', text = '', url = ''] = record;
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell);
    if (!match) throw new Error(`links record ${index + 1} has an invalid cell address`);
    const column = match[1] as string;
    const row = Number(match[2]);
    const where = `${OVERVIEW_TAB}!${cell}`;
    if (tab !== OVERVIEW_TAB) throw new Error(`${where} is not on the ${OVERVIEW_TAB} tab`);
    const primary = PRIMARY_LINK_ROWS.includes(row);
    if (!primary && !GLOSSARY_LINK_ROWS.includes(row)) {
      throw new Error(`${where} is neither a primary nor a glossary link row`);
    }
    if (!/^https?:\/\//.test(url)) throw new Error(`${where} does not hold an http(s) URL`);
    let schemes: string[] = [];
    if (primary) {
      const ids = OVERVIEW_COLUMNS[column];
      if (!ids) throw new Error(`${where} is a primary link in a column with no scheme`);
      schemes = [...ids];
    }
    const field = LINK_FIELDS[row];
    if (field === undefined) throw new Error(`${where} has no field mapping`);
    return { tab, cell, column, row, field, schemes, text, url };
  });
}

/** Build the snapshot from the three CSVs. Every mismatch with the expected export layout throws. */
export function buildSnapshot(csvs: LandscapeCsvs): Snapshot {
  const overview = parseTab(csvs.overview);
  const persistence = parseTab(csvs.persistence);
  checkNames(overview, OVERVIEW_TAB, OVERVIEW_NAME_ROW, OVERVIEW_NAMES);
  checkNames(persistence, PERSISTENCE_TAB, PERSISTENCE_NAME_ROW, PERSISTENCE_NAMES);

  const overviewOf = invert(OVERVIEW_COLUMNS);
  const persistenceOf = invert(PERSISTENCE_COLUMNS);
  const schemes: Record<string, SchemeEntry> = {};
  for (const [id, overviewColumn] of overviewOf) {
    const persistenceColumn = persistenceOf.get(id);
    if (persistenceColumn === undefined) throw new Error(`scheme ${id} has no persistence column`);
    schemes[id] = buildScheme(overviewColumn, persistenceColumn, overview, persistence);
  }

  return {
    format: 1,
    workbook: {
      title: cellAt(overview, 'C', 1),
      version: cellAt(overview, 'D', 2),
      date: cellAt(overview, 'D', 3),
    },
    inputs: Object.fromEntries(
      [csvs.overview, csvs.persistence, csvs.links].map((csv) => [csv.name, sha256(csv.bytes)]),
    ),
    schemes,
    links: buildLinks(parseLinks(csvs.links)),
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/** Keys sorted recursively (arrays keep their order), two-space indent, exactly one trailing LF. */
export function serializeSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(sortKeys(snapshot), null, 2)}\n`;
}

function main(argv: string[]): number {
  let sources: string;
  let check: boolean;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        sources: { type: 'string', default: 'sources' },
        check: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
    sources = values.sources;
    check = values.check;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const outPath = join(sources, SNAPSHOT_FILE);
  try {
    const snapshot = buildSnapshot(readLandscapeCsvs(sources));
    const text = serializeSnapshot(snapshot);
    if (check) {
      const current = existsSync(outPath) ? readFileSync(outPath) : null;
      if (current?.equals(Buffer.from(text, 'utf8'))) return 0;
      console.error(`import:snapshot: ${outPath} is out of date; run npm run import:snapshot`);
      return 1;
    }
    writeFileSync(outPath, text, 'utf8');
    console.log(`import:snapshot: wrote ${outPath} (${snapshot.links.length} links)`);
    return 0;
  } catch (error) {
    console.error(`import:snapshot: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
