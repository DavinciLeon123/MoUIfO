import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from 'uio-config';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * BLD-05 (DEC-062): the repository is built twice in two separate processes, the second with
 * `LC_ALL=C`, `LANG=C` and `TZ=Asia/Tokyo`, and every output must be byte-identical. CI runs this
 * through the pinned `npm test` step on Node 22 and 24; ci.yml has no separate diff step.
 */
const CLI = fileURLToPath(new URL('./index.ts', import.meta.url));

const EXPECTED_FILES = [
  'build-info.json',
  'landscape-table.csv',
  'landscape-table.md',
  'model.json',
  'model.md',
  'uio-def.ttl',
  'uio.jsonld',
  'uio.ttl',
];

// Two full builds (each loads the model, validates SHACL and serialises JSON-LD) in sequence.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const temps: string[] = [];

function buildInto(out: string, extraEnv: Record<string, string>): void {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=uio-source',
      CLI,
      '--root',
      REPO_ROOT,
      '--target',
      'all',
      '--out',
      out,
      '--docs-out',
      join(out, 'model.md'),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: undefined, ...extraEnv },
    },
  );
  if (result.status !== 0) {
    throw new Error(`build exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
}

let dirA = '';
let dirB = '';

beforeAll(() => {
  dirA = mkdtempSync(join(tmpdir(), 'uio-determinism-a-'));
  dirB = mkdtempSync(join(tmpdir(), 'uio-determinism-b-'));
  temps.push(dirA, dirB);
  buildInto(dirA, {});
  buildInto(dirB, { LC_ALL: 'C', LANG: 'C', TZ: 'Asia/Tokyo' });
});

afterAll(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const list = (dir: string): string[] => readdirSync(dir).sort();
const read = (dir: string, name: string): Buffer => readFileSync(join(dir, name));

describe('BLD-05 byte-identical double build', () => {
  test('both builds write the same eight files', () => {
    expect(list(dirA)).toEqual(EXPECTED_FILES);
    expect(list(dirB)).toEqual(list(dirA));
  });

  test('every file is byte-identical between the two processes', () => {
    for (const name of list(dirA)) {
      const equal = read(dirA, name).equals(read(dirB, name));
      expect(equal, `${name} differs between the two builds`).toBe(true);
    }
  });

  test('every file ends with exactly one LF', () => {
    for (const name of list(dirA)) {
      const text = read(dirA, name).toString('utf8');
      expect(text.endsWith('\n'), `${name} lacks a final LF`).toBe(true);
      expect(text.endsWith('\n\n'), `${name} ends with more than one LF`).toBe(false);
    }
  });

  test('no file holds a date-time stamp', () => {
    for (const name of list(dirA)) {
      const text = read(dirA, name).toString('utf8');
      expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text), `${name} holds a date-time stamp`).toBe(
        false,
      );
    }
  });

  test('the RDF outputs hold no blank node and no RDF-star', () => {
    for (const name of ['uio.ttl', 'uio-def.ttl']) {
      const text = read(dirA, name).toString('utf8');
      expect(text.includes('_:'), `${name} holds a blank node`).toBe(false);
      expect(text.includes('<<'), `${name} holds RDF-star`).toBe(false);
    }
    const jsonld = read(dirA, 'uio.jsonld').toString('utf8');
    expect(jsonld.includes('"_:'), 'uio.jsonld holds a blank node').toBe(false);
  });

  test('model.md equals the committed docs/model.md', () => {
    expect(read(dirA, 'model.md').equals(readFileSync(join(REPO_ROOT, 'docs', 'model.md')))).toBe(
      true,
    );
  });
});
