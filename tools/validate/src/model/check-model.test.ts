import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parseDocument } from 'yaml';
import { checkModel, checkModelFiles } from './check-model.ts';

const PATH = 'model/vocab/certainty.yaml';
const REAL = readFileSync(join(REPO_ROOT, PATH), 'utf8');

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

describe('checkModel on the real repository', () => {
  test('the certainty vocabulary produces no problem', () => {
    expect(checkModelFiles([{ path: PATH, text: REAL }])).toEqual([]);
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });
});

describe('checkModelFiles positions', () => {
  test('an unknown key is one problem at the key itself', () => {
    const text = REAL.replace('rank: 2\n', 'rank: 2\n    rnak: 3\n');
    const problems = checkModelFiles([{ path: PATH, text }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: PATH, ...where(text, 'rnak') });
    expect(problems[0]?.message).toContain('rnak');
  });

  test('a wrong type is one problem at the value', () => {
    const text = REAL.replace('rank: 2\n', 'rank: high\n');
    const problems = checkModelFiles([{ path: PATH, text }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: PATH, ...where(text, 'high\n') });
  });

  test('a missing required key is one problem on the mapping that lacks it', () => {
    const doc = parseDocument(REAL, { schema: 'core' });
    doc.deleteIn(['values', 1, 'definition']);
    const text = doc.toString({ lineWidth: 0 });
    const problems = checkModelFiles([{ path: PATH, text }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('definition');
    expect(problems[0]).toMatchObject({ file: PATH, ...where(text, 'id: likely') });
  });
});
