import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Problem, REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parseDocument } from 'yaml';
import { checkModel, checkModelFiles } from './check-model.ts';
import {
  expectOnlyPendingWarningLines,
  expectRealModelClean,
  PENDING_CITATION,
} from './testing.ts';

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
  test('the certainty vocabulary produces no problem, and the repository none but pending citations', () => {
    expect(checkModelFiles([{ path: PATH, text: REAL }])).toEqual([]);
    expectRealModelClean(checkModel(REPO_ROOT));
  });
});

describe('the pending-citation helpers (self-test with an explicit pending list)', () => {
  const PENDING = ['pending-source'];
  const uncited = (id: string, file = `model/sources/${id}.yaml`): Problem => ({
    file,
    line: 3,
    column: 1,
    severity: 'warning',
    message: `source "${id}" is not cited by any statement`,
  });
  const error: Problem = {
    file: 'model/schemes/fixture-scheme.yaml',
    line: 1,
    column: 1,
    message: 'the value is not a known scheme',
  };

  test('an empty problem list passes', () => {
    expect(() => expectRealModelClean([], PENDING)).not.toThrow();
  });

  test('an error fails, alone or next to a pending warning', () => {
    expect(() => expectRealModelClean([error], PENDING)).toThrow();
    expect(() => expectRealModelClean([uncited('pending-source'), error], PENDING)).toThrow();
  });

  test('an uncited-source warning for a pending id passes', () => {
    expect(() => expectRealModelClean([uncited('pending-source')], PENDING)).not.toThrow();
  });

  test('an uncited-source warning for an id outside the pending list fails', () => {
    expect(() => expectRealModelClean([uncited('other-source')], PENDING)).toThrow();
  });

  test('a warning with any other message fails, even for a pending id', () => {
    const other: Problem = {
      file: 'model/sources/pending-source.yaml',
      line: 3,
      column: 1,
      severity: 'warning',
      message: 'something else',
    };
    expect(() => expectRealModelClean([other], PENDING)).toThrow();
  });

  test('a pending warning whose file does not match its id fails', () => {
    const misplaced = uncited('pending-source', 'model/sources/elsewhere.yaml');
    expect(() => expectRealModelClean([misplaced], PENDING)).toThrow();
  });

  test('the default pending list is PENDING_CITATION: the 20 registered workbook-link sources', () => {
    expect(PENDING_CITATION).toHaveLength(20);
    expect(PENDING_CITATION).toContain('kvk-zoeken');
    expect(() => expectRealModelClean([uncited('pending-source')])).toThrow();
  });

  const pendingLine =
    'model/sources/pending-source.yaml:3:1 warning: source "pending-source" is not cited by any statement';
  const cleanRun = 'validate: repository rules passed (10 rules)\n';

  test('CLI output without a warning line passes', () => {
    expect(() => expectOnlyPendingWarningLines(cleanRun, PENDING)).not.toThrow();
  });

  test('CLI output whose warning lines are pending uncited-source warnings passes', () => {
    const stdout = `${pendingLine}\nvalidate: repository rules passed (10 rules)\nvalidate: 1 warnings\n`;
    expect(() => expectOnlyPendingWarningLines(stdout, PENDING)).not.toThrow();
  });

  test('CLI output with an uncited-source warning for an id outside the list fails', () => {
    const outside =
      'model/sources/other-source.yaml:3:1 warning: source "other-source" is not cited by any statement';
    expect(() => expectOnlyPendingWarningLines(`${outside}\n${cleanRun}`, PENDING)).toThrow();
  });

  test('CLI output with any other warning line fails', () => {
    const stdout = `model/schemes/fixture-scheme.yaml:1:1 warning: something else\n${cleanRun}`;
    expect(() => expectOnlyPendingWarningLines(stdout, PENDING)).toThrow();
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
