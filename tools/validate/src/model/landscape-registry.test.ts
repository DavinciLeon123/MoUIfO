import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

// Coverage between the committed landscape snapshot and the model sources (DAT-05, DEC-043).

const SNAPSHOT = join(REPO_ROOT, 'sources', 'landscape-snapshot-v1.2.json');
const SOURCES_DIR = join(REPO_ROOT, 'model', 'sources');

type SnapshotLink = {
  cell: string;
  url: string;
  registered: boolean;
  source?: string;
  reason?: string;
};

type SourceFile = { id?: string; type?: string; url?: string; eli?: string };

function snapshotLinks(): SnapshotLink[] {
  return (JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { links: SnapshotLink[] }).links;
}

/** The distinct registered source ids of the snapshot, sorted. */
function registeredIds(): string[] {
  const ids = snapshotLinks()
    .filter((link) => link.registered)
    .map((link) => link.source as string);
  return [...new Set(ids)].sort();
}

function sourceFilePath(id: string): string {
  return join(SOURCES_DIR, `${id}.yaml`);
}

function sourceFileOf(id: string): SourceFile {
  return parse(readFileSync(sourceFilePath(id), 'utf8')) as SourceFile;
}

function sourceIds(): string[] {
  return readdirSync(SOURCES_DIR)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .sort();
}

describe('landscape snapshot and model sources (DAT-05, DEC-043)', () => {
  test('the snapshot registers 20 distinct workbook-link sources', () => {
    expect(registeredIds()).toHaveLength(20);
  });

  test('every model source whose url is a workbook link URL is the registered source of that link and is a law or register-doc', () => {
    const links = snapshotLinks();
    for (const id of sourceIds()) {
      const file = sourceFileOf(id);
      const link = links.find((candidate) => candidate.url === file.url);
      if (link === undefined) continue;
      expect(link.registered, id).toBe(true);
      expect(link.source, id).toBe(id);
      expect(['law', 'register-doc'], id).toContain(file.type);
    }
  });

  test('every registered link has its source file, and that file url equals the link URL exactly', () => {
    for (const link of snapshotLinks().filter((candidate) => candidate.registered)) {
      const id = link.source as string;
      expect(existsSync(sourceFilePath(id)), id).toBe(true);
      expect(sourceFileOf(id).url, id).toBe(link.url);
    }
  });

  test('no workbook link URL is the url of two model sources (one source per URL, DEC-043)', () => {
    const linkUrls = new Set(snapshotLinks().map((link) => link.url));
    const cited = sourceIds()
      .map((id) => sourceFileOf(id).url)
      .filter((url): url is string => url !== undefined && linkUrls.has(url));
    expect(new Set(cited).size, 'a workbook URL is the url of two sources').toBe(cited.length);
  });

  test('kvk-zoeken is a register-doc whose url is the URL of the F25 link', () => {
    const f25 = snapshotLinks().find((link) => link.cell === 'F25');
    const file = sourceFileOf('kvk-zoeken');
    expect(file.type).toBe('register-doc');
    expect(file.url).toBe('https://www.kvk.nl/zoeken/');
    expect(file.url).toBe(f25?.url);
  });
});

// The six law sources of the workbook links (rows 13: F, I, J, M, P, R), each with its link URL.
const LAW_SOURCES: readonly (readonly [id: string, cell: string])[] = [
  ['handelsregisterwet-2007', 'F13'],
  ['handelsregisterbesluit-2008', 'I13'],
  ['wet-op-de-omzetbelasting-1968', 'J13'],
  ['csdr-its-2017-394', 'M13'],
  ['ucc-952-2013', 'P13'],
  ['wabb', 'R13'],
];

function linkUrlAt(cell: string): string | undefined {
  return snapshotLinks().find((link) => link.cell === cell)?.url;
}

describe('the law sources of the workbook links (DAT-05, DEC-042, DEC-043)', () => {
  test.each(LAW_SOURCES)('%s is a law whose url is the URL of cell %s exactly', (id, cell) => {
    const file = sourceFileOf(id);
    expect(file.type).toBe('law');
    expect(file.url).toBe(linkUrlAt(cell));
  });

  test('the two EUR-Lex laws carry an ELI under http://data.europa.eu/eli/', () => {
    for (const id of ['ucc-952-2013', 'csdr-its-2017-394']) {
      expect(sourceFileOf(id).eli, id).toMatch(/^http:\/\/data\.europa\.eu\/eli\//);
    }
  });

  test('no workbook link URL carries a tracking parameter or a text fragment', () => {
    const tracking =
      /[?&](utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|_gl|_ga|mc_cid|mc_eid)=/i;
    for (const link of snapshotLinks()) {
      expect(link.url, link.cell).not.toMatch(tracking);
      expect(link.url, link.cell).not.toContain('#:~:');
    }
  });
});

describe('docs/gaps.md entries of plan 03-04', () => {
  const gaps = readFileSync(join(REPO_ROOT, 'docs', 'gaps.md'), 'utf8');
  const FOUR_PARTS = [
    '- **Item:**',
    '- **Why it is not in the model:**',
    '- **Open question:**',
    '- **Owner or next step:**',
  ];

  test.each([
    'Workbook hyperlinks whose target does not back their label',
    'Source dates not stated on the page (DEC-042)',
    'EUR-Lex ELI of Commission Implementing Regulation (EU) 2017/394 not confirmed',
  ])('the entry "%s" is in the four-part form', (heading) => {
    const start = gaps.indexOf(`## ${heading}`);
    expect(start, heading).toBeGreaterThanOrEqual(0);
    const section = gaps.slice(start).split('\n## ')[0] ?? '';
    let at = 0;
    for (const part of FOUR_PARTS) {
      const found = section.indexOf(part, at);
      expect(found, `${heading}: ${part}`).toBeGreaterThanOrEqual(0);
      at = found + part.length;
    }
  });
});
