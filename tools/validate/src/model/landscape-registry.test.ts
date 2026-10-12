import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { PENDING_CITATION } from './testing.ts';

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
  test('PENDING_CITATION is the sorted list of the 20 registered source ids of the snapshot', () => {
    expect(registeredIds()).toHaveLength(20);
    expect(PENDING_CITATION).toEqual(registeredIds());
  });

  test('every pending id is a registered source id of the snapshot', () => {
    const registered = registeredIds();
    for (const id of PENDING_CITATION) expect(registered, id).toContain(id);
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

  test('for every registered link whose source file exists, the file url equals the link URL exactly', () => {
    for (const link of snapshotLinks().filter((candidate) => candidate.registered)) {
      const id = link.source as string;
      if (!existsSync(sourceFilePath(id))) continue;
      expect(sourceFileOf(id).url, id).toBe(link.url);
    }
  });

  test('kvk-zoeken is a register-doc whose url is the URL of the F25 link', () => {
    const f25 = snapshotLinks().find((link) => link.cell === 'F25');
    const file = sourceFileOf('kvk-zoeken');
    expect(file.type).toBe('register-doc');
    expect(file.url).toBe('https://www.kvk.nl/zoeken/');
    expect(file.url).toBe(f25?.url);
  });
});
