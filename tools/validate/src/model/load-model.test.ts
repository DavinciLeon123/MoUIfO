import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import { loadValidatedModel, type RawModel } from './load-model.ts';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const TABLES: readonly (keyof RawModel)[] = [
  'schemes',
  'authorities',
  'jurisdictions',
  'sources',
  'vocab',
];

function stems(directory: string): string[] {
  // Sort the file names (code-unit order, as discovery does), then strip the extension: "vat-nl.yaml"
  // comes before "vat.yaml" although the stem "vat" sorts before "vat-nl".
  return readdirSync(join(REPO_ROOT, 'model', directory))
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => name.slice(0, -'.yaml'.length));
}

describe('loadValidatedModel', () => {
  test('loads the real model with no problem and no warning', () => {
    const result = loadValidatedModel(REPO_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    for (const table of TABLES) {
      expect(Object.keys(result.model[table])).toEqual(stems(table));
    }
  });

  test('every table holds the plain data of its files, keyed by id', () => {
    const result = loadValidatedModel(REPO_ROOT);
    if (!result.ok) throw new Error('the real model must load');
    const eori = result.model.schemes.eori as { id: string };
    expect(eori.id).toBe('eori');
    expect(Object.keys(result.model.jurisdictions)).toContain('NL');
  });

  test('the model is plain JSON data (no Date objects, no class instances)', () => {
    const result = loadValidatedModel(REPO_ROOT);
    if (!result.ok) throw new Error('the real model must load');
    expect(JSON.parse(JSON.stringify(result.model))).toEqual(result.model);
  });

  test('a model with an id that differs from its file name is refused with that file named', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-load-model-'));
    scratch.push(root);
    cpSync(join(REPO_ROOT, 'model'), join(root, 'model'), { recursive: true });
    const path = join(root, 'model', 'schemes', 'eori.yaml');
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/^id: eori$/m);
    writeFileSync(path, text.replace(/^id: eori$/m, 'id: not-eori'));
    const result = loadValidatedModel(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const problem = result.problems.find((p) => p.file === 'model/schemes/eori.yaml');
    expect(problem?.message).toContain('the id must equal the file name');
  });
});
