import type { Claim, Model, PatternEntry, Scheme } from '@uio/engine';
import { stringify } from 'csv-stringify/sync';
import { mdCell, mdCode } from '../markdown.ts';

/** The columns of the landscape table, in order; they mirror the workbook Overview fields (D-11). */
export const LANDSCAPE_COLUMNS = [
  'id',
  'label_en',
  'label_nl',
  'abbreviation',
  'kind',
  'issuer',
  'jurisdiction',
  'format',
  'checksum',
  'level',
  'availability',
  'scope',
  'roles',
  'mandatory',
  'legal_basis',
  'validation_source',
  'trust_legal_basis',
  'trust_registration_quality',
  'trust_verifiability',
  'trust_crosswalks',
  'trust_lifecycle',
  'trust_certainty',
  'weakest_certainty',
] as const;

export type LandscapeColumn = (typeof LANDSCAPE_COLUMNS)[number];

/** One scheme as a record of strings, a key for every column. */
export type LandscapeRow = Record<LandscapeColumn, string>;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const mark = (text: string, certainty: string): string => `${text} [${certainty}]`;

/** A header claim as `value [certainty]`, empty when the scheme does not carry it. */
function headerCell(claim: Claim<string | null> | undefined, text = claim?.value): string {
  return claim === undefined || text === undefined || text === null
    ? ''
    : mark(text, claim.certainty);
}

/** A list of sourced entries as `text [certainty]` items joined with `; ` in authored order. */
function listCell<T extends { certainty: string }>(
  entries: readonly T[] | undefined,
  text: (entry: T) => string,
): string {
  return (entries ?? []).map((entry) => mark(text(entry), entry.certainty)).join('; ');
}

/** The pattern items of a scheme's format column. */
const patternsOf = (scheme: Scheme): readonly PatternEntry[] => scheme.format?.patterns ?? [];

const formatCell = (scheme: Scheme): string => listCell(patternsOf(scheme), (entry) => entry.regex);

/** The rank of every certainty of the model's certainty vocabulary. */
function certaintyRanks(model: Model): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const member of model.vocab.certainty?.values ?? []) {
    if (member.id !== undefined && member.rank !== undefined) ranks.set(member.id, member.rank);
  }
  return ranks;
}

/** Every `certainty` string anywhere inside a value: the sourced claims of one scheme. */
function certainties(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) certainties(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'certainty' && typeof item === 'string') found.push(item);
      else certainties(item, found);
    }
  }
  return found;
}

/** The lowest-ranked certainty over all sourced claims of a scheme; empty when it has none. */
function weakest(scheme: Scheme, ranks: ReadonlyMap<string, number>): string {
  let lowest: { name: string; rank: number } | undefined;
  for (const name of certainties(scheme)) {
    const rank = ranks.get(name);
    if (rank !== undefined && (lowest === undefined || rank < lowest.rank)) lowest = { name, rank };
  }
  return lowest?.name ?? '';
}

const score = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

function rowOfScheme(
  scheme: Scheme,
  model: Model,
  ranks: ReadonlyMap<string, number>,
): LandscapeRow {
  const trust = scheme.trust;
  const issuer = model.authorities[scheme.issuer.value]?.label.en ?? scheme.issuer.value;
  return {
    id: scheme.id,
    label_en: scheme.label.en,
    label_nl: scheme.label.nl ?? '',
    abbreviation: headerCell(scheme.abbreviation),
    kind: headerCell(scheme.kind),
    issuer: headerCell(scheme.issuer, issuer),
    jurisdiction: headerCell(scheme.jurisdiction),
    format: formatCell(scheme),
    checksum: listCell(scheme.format?.checksum, (entry) => entry.algorithm),
    level: listCell(scheme.level, (entry) => entry.value),
    availability: headerCell(scheme.availability),
    scope: scheme.scope?.en ?? '',
    roles: listCell(scheme.roles, (entry) => entry.value),
    mandatory:
      scheme.mandatory === undefined ? '' : mark(scheme.mandatory.text, scheme.mandatory.certainty),
    legal_basis: listCell(scheme.legal_basis, (entry) => entry.title),
    validation_source:
      scheme.validation_source === undefined
        ? ''
        : mark(scheme.validation_source.label, scheme.validation_source.certainty),
    trust_legal_basis: score(trust?.legal_basis),
    trust_registration_quality: score(trust?.registration_quality),
    trust_verifiability: score(trust?.verifiability),
    trust_crosswalks: score(trust?.crosswalks),
    trust_lifecycle: score(trust?.lifecycle),
    trust_certainty: trust?.certainty ?? '',
    weakest_certainty: weakest(scheme, ranks),
  };
}

/** One row per scheme in codepoint id order (D-03). */
export function landscapeRows(model: Model): LandscapeRow[] {
  const ranks = certaintyRanks(model);
  return Object.keys(model.schemes)
    .sort(compare)
    .flatMap((id) => {
      const scheme = model.schemes[id];
      return scheme === undefined ? [] : [rowOfScheme(scheme, model, ranks)];
    });
}

/** The CSV: a header, one record per row, LF records, no BOM, formula cells neutralised (T-04-13). */
export function landscapeCsv(rows: readonly LandscapeRow[]): string {
  return stringify([...rows], {
    header: true,
    columns: [...LANDSCAPE_COLUMNS],
    escape_formulas: true,
    bom: false,
  });
}

/**
 * One Markdown cell. Regexes of the format column are code spans, each followed by its escaped
 * certainty mark; any other text, and a format cell that no longer matches its scheme, goes
 * through `mdCell`.
 */
function markdownCell(row: LandscapeRow, column: LandscapeColumn, model: Model): string {
  const scheme = model.schemes[row.id];
  if (column === 'format' && scheme !== undefined && row.format === formatCell(scheme)) {
    return patternsOf(scheme)
      .map((entry) => `${mdCode(entry.regex)} ${mdCell(`[${entry.certainty}]`)}`)
      .join('; ');
  }
  return mdCell(row[column]);
}

/** The Markdown table with a generated-file notice; every cell is escaped. */
export function landscapeMarkdown(rows: readonly LandscapeRow[], model: Model): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  const lines = [
    '# Landscape table',
    '',
    `This file is generated by \`npm run build:dist\` from model.json (contract ${model.contract}, model version ${mdCell(model.model_version)}) under CC-BY-4.0 (\`LICENSE-model\`); do not edit it by hand.`,
    '',
    line(LANDSCAPE_COLUMNS),
    line(LANDSCAPE_COLUMNS.map(() => '---')),
    ...rows.map((row) => line(LANDSCAPE_COLUMNS.map((column) => markdownCell(row, column, model)))),
  ];
  return `${lines.join('\n')}\n`;
}
