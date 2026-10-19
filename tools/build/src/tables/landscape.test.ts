import type { Model } from '@uio/engine';
import { REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { parseCsv } from '../testing.ts';
import {
  LANDSCAPE_COLUMNS,
  type LandscapeRow,
  landscapeCsv,
  landscapeMarkdown,
  landscapeRows,
} from './landscape.ts';

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

const model = realModel();
const rows = landscapeRows(model);

function rowOf(id: string): LandscapeRow {
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`no row for ${id}`);
  return row;
}

/** The cells of one GFM table line: split on every `|` that no backslash escapes. */
function cellsOf(line: string): string[] {
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

describe('landscapeRows', () => {
  test('one row per scheme in codepoint id order, a key for every column', () => {
    const ids = Object.keys(model.schemes).sort();
    expect(rows.map((row) => row.id)).toEqual(ids);
    for (const row of rows) expect(Object.keys(row)).toEqual([...LANDSCAPE_COLUMNS]);
  });

  test('eori carries certainty marks, authored-order lists and its trust scores', () => {
    const eori = rowOf('eori');
    expect(eori.kind).toBe('identifier [certain]');
    expect(eori.issuer).toBe('National customs authority [certain]');
    expect(eori.jurisdiction).toBe('EU [certain]');
    expect(eori.availability).toBe('public-restricted-details [likely]');
    expect(eori.format).toBe(
      [
        '^[A-Z]{2}[A-Z0-9]{1,15}$ [certain]',
        '^NL[0-9]{9}$ [certain]',
        '^NL[0-9]{10}$ [likely]',
      ].join('; '),
    );
    expect(eori.checksum).toBe('');
    expect(eori.trust_legal_basis).toBe('1');
    expect(eori.trust_verifiability).toBe('0');
    expect(eori.trust_certainty).toBe('likely');
    expect(eori.label_nl).toBe('EORI-nummer');
    expect(eori.roles).toBe('economic-operator [certain]');
    expect(eori.validation_source).toBe('EU EORI number validation [certain]');
    expect(eori.scope).not.toContain('[');
  });

  test('vat-nl lists its checksums, kbo has none, peppol-id has a row', () => {
    expect(rowOf('vat-nl').checksum).toBe('elfproef [likely]; iso7064-mod97-10 [likely]');
    expect(rowOf('kbo').checksum).toBe('');
    expect(rowOf('peppol-id').id).toBe('peppol-id');
  });

  test('a null trust score is an empty cell in the rows, the CSV and the Markdown, never 0', () => {
    const csv = parseCsv(landscapeCsv(rows));
    const markdown = landscapeMarkdown(rows, model).split('\n');
    const trust = LANDSCAPE_COLUMNS.filter(
      (column) => column.startsWith('trust_') && column !== 'trust_certainty',
    );
    expect(trust).toHaveLength(5);
    for (const id of ['bsn', 'fi-number']) {
      for (const column of trust) expect(rowOf(id)[column]).toBe('');
      const record = csv.find((candidate) => candidate[0] === id) ?? [];
      const line = markdown.find((candidate) => candidate.startsWith(`| ${id} |`)) ?? '';
      const cells = cellsOf(line);
      for (const column of trust) {
        const index = LANDSCAPE_COLUMNS.indexOf(column);
        expect(record[index]).toBe('');
        expect(cells[index]).toBe('');
      }
    }
  });

  test('weakest_certainty is the lowest-ranked certainty over all claims of the scheme', () => {
    expect(rowOf('euid').weakest_certainty).toBe('possible');
    expect(rowOf('eori').weakest_certainty).toBe('likely');
    const certain = JSON.parse(JSON.stringify(model.schemes.eori)) as Record<string, unknown>;
    const lowered: Model = {
      ...model,
      schemes: { eori: { ...(certain as unknown as Model['schemes'][string]) } },
    };
    expect(landscapeRows(lowered)[0]?.weakest_certainty).toBe('likely');
  });

  test('the table is built from the Model only: a changed label shows in the row', () => {
    const changed = JSON.parse(JSON.stringify(model)) as Model;
    const scheme = changed.schemes.eori;
    if (scheme === undefined) throw new Error('eori');
    scheme.label = { en: 'Changed' };
    const row = landscapeRows(changed).find((candidate) => candidate.id === 'eori');
    expect(row?.label_en).toBe('Changed');
    expect(row?.label_nl).toBe('');
  });
});

describe('landscapeCsv', () => {
  const base = rowOf('eori');
  const parse = (row: LandscapeRow): string[] => parseCsv(landscapeCsv([row]))[1] ?? [];

  test('quotes a cell with a comma, a double quote or a line break (doubled quotes)', () => {
    const text = landscapeCsv([{ ...base, label_en: 'a,b', label_nl: 'say "hi"', scope: 'x\ny' }]);
    expect(text).toContain('"a,b"');
    expect(text).toContain('"say ""hi"""');
    expect(text).toContain('"x\ny"');
    const record = parse({ ...base, label_en: 'a,b', label_nl: 'say "hi"', scope: 'x\ny' });
    expect(record[1]).toBe('a,b');
    expect(record[2]).toBe('say "hi"');
    expect(record[LANDSCAPE_COLUMNS.indexOf('scope')]).toBe('x\ny');
  });

  test('prefixes a cell starting with =, +, - or @ so it is not a formula', () => {
    for (const value of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      const cell = parse({ ...base, label_en: value })[1] ?? '';
      expect(cell).not.toBe(value);
      expect(cell.endsWith(value)).toBe(true);
      expect(/^[=+\-@]/.test(cell)).toBe(false);
    }
  });

  test('uses LF records, no BOM, one trailing LF', () => {
    const text = landscapeCsv(rows);
    expect(text.includes('\r')).toBe(false);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});

describe('landscapeMarkdown', () => {
  const text = landscapeMarkdown(rows, model);
  const lines = text.slice(0, -1).split('\n');

  test('starts with the heading, names contract, version and licence, ends with one LF', () => {
    expect(lines[0]).toBe('# Landscape table');
    expect(lines[2]).toContain(`contract ${model.contract}`);
    expect(lines[2]).toContain(model.model_version);
    expect(lines[2]).toContain('CC-BY-4.0');
    expect(lines[2]).toContain('npm run build:dist');
    expect(text.endsWith('\n\n')).toBe(false);
  });

  test('every table line has the column count, even with a regex containing |', () => {
    const header = lines.findIndex((line) => line.startsWith('| id |'));
    const table = lines.slice(header);
    expect(table).toHaveLength(rows.length + 2);
    for (const line of table) expect(cellsOf(line)).toHaveLength(LANDSCAPE_COLUMNS.length);
    const tricky = landscapeMarkdown(
      [{ ...rowOf('eori'), format: '^(a|b)$ [certain]', scope: '<script>x</script>\nline' }],
      model,
    );
    const body = tricky.split('\n').filter((line) => line.startsWith('| eori |'))[0] ?? '';
    expect(cellsOf(body)).toHaveLength(LANDSCAPE_COLUMNS.length);
    expect(body).not.toContain('<script>');
  });

  test('regexes are shown as code spans', () => {
    const line = lines.find((candidate) => candidate.startsWith('| eori |')) ?? '';
    expect(line).toContain('`^NL[0-9]{9}$`');
  });
});
