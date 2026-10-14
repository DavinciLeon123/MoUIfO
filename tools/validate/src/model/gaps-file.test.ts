import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';

// The gap log docs/gaps.md (DAT-06, DAT-07, DEC-049): the Appendix B verification table, the
// end-of-phase human-check list, the four-part entries and the topics the phase must log.

const GAPS = join(REPO_ROOT, 'docs', 'gaps.md');
const SOURCES_DIR = join(REPO_ROOT, 'model', 'sources');
const VERIFICATION = 'Appendix B verification (DEC-049)';
const HUMAN_CHECK = 'End-of-phase human check';
const FOUR_PARTS = [
  '- **Item:**',
  '- **Why it is not in the model:**',
  '- **Open question:**',
  '- **Owner or next step:**',
];

type Section = { heading: string; body: string };

function gapsText(): string {
  return readFileSync(GAPS, 'utf8');
}

/** The `##` sections of the gap log, in file order, each with its heading and body. */
function sections(text: string): Section[] {
  return text
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const newline = part.indexOf('\n');
      return { heading: part.slice(0, newline).trim(), body: part.slice(newline + 1) };
    });
}

/** The body of the `##` section with exactly this heading; the test fails if there is none. */
function sectionBody(name: string): string {
  const found = sections(gapsText()).find((section) => section.heading === name);
  if (found === undefined) throw new Error(`docs/gaps.md has no "## ${name}" section`);
  return found.body;
}

type Row = { cells: string[]; item: string; status: string; source: string; date: string };

/** The data rows of the first markdown table of `body`, split into their cells. */
function tableRows(body: string): Row[] {
  const lines = body.split('\n').filter((line) => line.startsWith('|'));
  return lines.slice(2).map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return {
      cells,
      item: cells[0] ?? '',
      status: cells[1] ?? '',
      source: cells[2] ?? '',
      date: cells[3] ?? '',
    };
  });
}

/** The source ids of a Source cell: comma-separated, with `—` meaning none. */
function sourceIds(cell: string): string[] {
  return cell
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && id !== '—');
}

function sourceFileExists(id: string): boolean {
  return existsSync(join(SOURCES_DIR, `${id}.yaml`));
}

describe('Appendix B verification (DEC-049)', () => {
  test('is a section whose table has the four columns of DEC-049', () => {
    const body = sectionBody(VERIFICATION);
    const header = body.split('\n').find((line) => line.startsWith('|'));
    expect(header).toBe('| Item | Status | Source | Date checked |');
  });

  test('has one row for each Appendix B item of the phase', () => {
    const items = tableRows(sectionBody(VERIFICATION)).map((row) => row.item);
    const expected = [
      'ICD 0106',
      'ICD 0190',
      'ICD 0088',
      'ICD 0060',
      'ICD 0199',
      'ICD 0208',
      'Peppol EAS 9944',
      'Peppol EAS 0106',
      'Elfproef of BSN, RSIN and fi-number',
      'LEI ISO 7064 mod 97-10',
      'GLN GS1 mod 10',
      'Mod 97 of the Dutch sole-proprietor VAT number',
      'Dutch EUID format',
      'OIN prefixes',
      'Suffix after the B of the Dutch VAT number',
      'GLEIF RA entries',
      'EORI structure',
    ];
    for (const prefix of expected) {
      expect(
        items.some((item) => item.startsWith(prefix)),
        `no row for ${prefix}`,
      ).toBe(true);
    }
  });

  test('every row has four cells, a status that starts confirmed or not confirmed, a model statement and a date', () => {
    const rows = tableRows(sectionBody(VERIFICATION));
    expect(rows.length).toBeGreaterThan(0);
    const problems = rows.flatMap((row) => {
      const found: string[] = [];
      if (row.cells.length !== 4) found.push(`${row.item}: ${row.cells.length} cells`);
      if (!/^(not )?confirmed\b/.test(row.status))
        found.push(`${row.item}: status does not start confirmed or not confirmed`);
      if (!/\b(not )?in the model\b/.test(row.status))
        found.push(`${row.item}: status names no model treatment`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date))
        found.push(`${row.item}: date ${row.date} is not YYYY-MM-DD`);
      return found;
    });
    expect(problems).toEqual([]);
  });

  test('every source id named in the Source column exists in model/sources', () => {
    const missing = tableRows(sectionBody(VERIFICATION))
      .flatMap((row) => sourceIds(row.source))
      .filter((id) => !sourceFileExists(id));
    expect(missing).toEqual([]);
  });

  test('a Peppol-code-list-only item (an ICD other than 0190, or an EAS code) is never plain confirmed (DEC-049, owner ruling)', () => {
    const plain = tableRows(sectionBody(VERIFICATION))
      .filter(
        (row) =>
          (row.item.startsWith('ICD ') && !row.item.startsWith('ICD 0190')) ||
          row.item.startsWith('Peppol EAS'),
      )
      .filter((row) => /^confirmed\b/.test(row.status))
      .map((row) => row.item);
    expect(plain).toEqual([]);
  });

  test('every Peppol EAS row puts its codes in the model at likely, in the long form (DEC-052)', () => {
    const rows = tableRows(sectionBody(VERIFICATION)).filter((row) =>
      row.item.startsWith('Peppol EAS'),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status, row.item).toContain('in the model at likely (long form)');
      expect(row.status, row.item).toContain('DEC-052');
      expect(row.status, row.item).not.toMatch(/\bat certain\b/);
    }
  });

  test('only ICD 0190 among the ICD rows is confirmed by its standard', () => {
    const row = tableRows(sectionBody(VERIFICATION)).find((candidate) =>
      candidate.item.startsWith('ICD 0190'),
    );
    expect(row?.status.startsWith('confirmed')).toBe(true);
    expect(row?.source).toContain('oin-stelsel-2-1-0');
  });

  test('the rows of the five peppol-id prefixes put the component and its contains relation at likely (DEC-053)', () => {
    const expected = [
      ['ICD 0106', '0106', 'kvk-number'],
      ['ICD 0190', '0190', 'oin'],
      ['ICD 0088', '0088', 'gln'],
      ['ICD 0208', '0208', 'kbo'],
      ['Peppol EAS 9944', '9944', 'vat-nl'],
    ] as const;
    const rows = tableRows(sectionBody(VERIFICATION));
    for (const [prefix, code, scheme] of expected) {
      const row = rows.find((candidate) => candidate.item.startsWith(`${prefix} `));
      expect(row, prefix).toBeDefined();
      expect(row?.status, prefix).toContain(
        `the \`peppol-id\` component ${code} and its \`contains\` relation to \`${scheme}\` at likely`,
      );
      expect(row?.status, prefix).toContain('DEC-053');
    }
    const oin = rows.find((candidate) => candidate.item.startsWith('ICD 0190'));
    expect(oin?.status.startsWith('confirmed')).toBe(true);
    expect(oin?.status).toContain('in the model at certain as `iso6523_icd` of `oin`');
    for (const row of rows) expect(row.status, row.item).not.toMatch(/component[^;.]* at certain/);
  });
});

describe('End-of-phase human check', () => {
  test('is a section of bullets, one per check', () => {
    const bullets = sectionBody(HUMAN_CHECK)
      .split('\n')
      .filter((line) => line.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(8);
  });

  const CHECKS: readonly (readonly [string, RegExp])[] = [
    ['the EUR-Lex ELIs', /ELI/],
    ['the TEU date', /TEU|Article 52/],
    ['the fallback dates', /fallback|DEC-042/],
    ['the Belgian sources', /Belgian|FOD Economie/],
    ['the GS1 check-digit text', /GS1/],
    ['ISO 17442', /ISO 17442/],
    ['the ISO 6523 registry', /ISO 6523/],
  ];
  for (const [label, pattern] of CHECKS) {
    test(`names ${label}`, () => {
      expect(sectionBody(HUMAN_CHECK)).toMatch(pattern);
    });
  }
});

describe('the four-part entries', () => {
  test('every section other than the verification and the human check has the four parts', () => {
    const missing = sections(gapsText())
      .filter((section) => section.heading !== VERIFICATION && section.heading !== HUMAN_CHECK)
      .map((section) => ({
        heading: section.heading,
        missing: FOUR_PARTS.filter((part) => !section.body.includes(part)),
      }))
      .filter((entry) => entry.missing.length > 0);
    expect(missing).toEqual([]);
  });

  test('the phase-2 wording "Why it is a caveat" is gone', () => {
    expect(gapsText()).not.toContain('Why it is a caveat');
  });

  test('the DEC-042 entry names only source ids that exist in model/sources', () => {
    const item = sectionBody('Source dates not stated on the page (DEC-042)')
      .split('\n')
      .find((line) => line.startsWith('- **Item:**'));
    const ids = [...(item ?? '').matchAll(/`([a-z][a-z0-9-]*)`/g)].map(
      (match) => match[1] as string,
    );
    expect(ids.length).toBeGreaterThanOrEqual(16);
    expect(ids.filter((id) => !sourceFileExists(id))).toEqual([]);
  });
});

describe('the topics the phase must log', () => {
  const REQUIRED: readonly (readonly [string, RegExp])[] = [
    ['the EORI level claims', /EORI level claims/],
    [
      'the mod 97 check of the Dutch sole-proprietor VAT number',
      /Mod 97 check of the Dutch sole-proprietor VAT number/,
    ],
    ['the Dutch EUID register identifier (the EUID annex)', /Dutch EUID register identifier/],
    [
      'the suffix after the B of the Dutch VAT number',
      /Suffix after the B of the Dutch VAT number/,
    ],
    ['the KBO equivalent-in relation', /KBO equivalent-in relation/],
    ['the Belgian enterprise-number check digit', /Belgian enterprise-number check digit/],
    ['the source dates not stated on the page', /Source dates not stated on the page/],
    [
      'the workbook hyperlinks whose target does not back their label',
      /Workbook hyperlinks whose target does not back their label/,
    ],
  ];

  for (const [label, pattern] of REQUIRED) {
    test(`logs ${label} as a heading`, () => {
      const headings = sections(gapsText()).map((section) => section.heading);
      expect(headings.some((heading) => pattern.test(heading))).toBe(true);
    });
  }
});

describe('the EAS certainty in the gap entries (DEC-052)', () => {
  test('the DAT-06 reading entry holds the Peppol EAS codes at likely', () => {
    const body = sectionBody(
      'DAT-06 reading: items in the model without a primary confirmation (DEC-051)',
    );
    expect(body).toContain('the Peppol EAS codes at likely as `peppol_eas`');
    expect(body).toContain('DEC-052');
    expect(body).not.toMatch(/EAS codes (at|sit at) certain/);
  });

  test('the ICD entry states the other EAS codes at likely and cites DEC-052', () => {
    const body = sectionBody('ICD codes stated only by the Peppol code list');
    expect(body).toContain('DEC-052');
    expect(body).not.toMatch(/EAS code[^.]*\bis certain\b/);
  });
});

describe('the peppol-id certainty in the gap entries (DEC-053)', () => {
  test('the DAT-06 reading entry lists the peppol-id components and contains relations at likely', () => {
    const body = sectionBody(
      'DAT-06 reading: items in the model without a primary confirmation (DEC-051)',
    );
    expect(body).toContain(
      'the `peppol-id` components 0106, 0190, 9944, 0088 and 0208 and their `contains` relations at likely (DEC-053, `peppol-code-lists-9-7` only)',
    );
    expect(body).toContain('supersedes DEC-053');
    expect(body).not.toMatch(/components[^.]* at certain/);
  });

  test('the ICD entry names the peppol-id components and their contains relations at likely and cites DEC-053', () => {
    const body = sectionBody('ICD codes stated only by the Peppol code list');
    expect(body).toContain('DEC-053');
    expect(body).toContain(
      'their `contains` relations to `kvk-number`, `oin`, `vat-nl`, `gln` and `kbo`',
    );
    expect(body).not.toMatch(/components[^.]* at certain/);
  });
});
