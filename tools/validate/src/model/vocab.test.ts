import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { checkModel, checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { fixture, realModelFiles, withRealModel } from './testing.ts';

const APPLICABILITY_STATUS = 'model/vocab/applicability-status.yaml';

type Member = {
  id: string;
  label: { en: string; nl?: string };
  definition: { en: string };
  inherits_down?: boolean;
  rationale?: { en: string };
  source?: string;
};
type Vocab = { id: string; label: { en: string; nl?: string }; values: Member[] };

const realFile = (path: string): ModelFile => {
  const found = realModelFiles().find((file) => file.path === path);
  if (found === undefined) throw new Error(`missing real file ${path}`);
  return found;
};
const realVocab = (id: string): Vocab =>
  parse(realFile(`model/vocab/${id}.yaml`).text, { schema: 'core' }) as Vocab;
const idsOf = (id: string): string[] => realVocab(id).values.map((value) => value.id);

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const HEAD = 'id: applicability-status\nlabel:\n  en: Applicability status\nvalues:\n';
const member = (id: string, extra = ''): string =>
  `  - id: ${id}\n    label:\n      en: Label\n    definition:\n      en: Definition\n${extra}`;
const applicability = (members: string): ModelFile =>
  fixture(APPLICABILITY_STATUS, `${HEAD}${members}`);
const check = (file: ModelFile) => checkModelFiles(withRealModel(file));

const copies: string[] = [];
afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the real `model/` directory, returned as a repository root. */
function modelCopy(): string {
  const root = mkdtempSync(join(tmpdir(), 'uio-vocab-'));
  copies.push(root);
  cpSync(join(REPO_ROOT, 'model'), join(root, 'model'), { recursive: true });
  return root;
}

describe('the real applicability-status vocabulary (DEC-041)', () => {
  test('the four statuses are in SPEC order', () => {
    expect(idsOf('applicability-status')).toEqual([
      'issued',
      'recognised',
      'verifiable',
      'not-applicable',
    ]);
  });

  test('inherits_down is issued false, recognised true, verifiable true, not-applicable false', () => {
    const flags = Object.fromEntries(
      realVocab('applicability-status').values.map((value) => [value.id, value.inherits_down]),
    );
    expect(flags).toEqual({
      issued: false,
      recognised: true,
      verifiable: true,
      'not-applicable': false,
    });
  });

  test('every rationale cites DEC-041 and no member cites a source', () => {
    for (const value of realVocab('applicability-status').values) {
      expect(value.rationale?.en).toContain('DEC-041');
      expect(value.rationale?.en).toContain('no external source');
      expect(value.source).toBeUndefined();
    }
  });

  test('the repository validates with no problem', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });
});

describe('the applicability-status schema', () => {
  test('a member without inherits_down is one error at that member', () => {
    const file = applicability(member('issued'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: APPLICABILITY_STATUS,
      ...where(file.text, 'id: issued'),
    });
    expect(problems[0]?.message).toBe('missing required property "inherits_down"');
  });

  test('a non-boolean inherits_down is one error at the value', () => {
    const file = applicability(member('issued', '    inherits_down: "yes"\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: APPLICABILITY_STATUS,
      ...where(file.text, '"yes"'),
    });
    expect(problems[0]?.message).toBe('must be boolean');
  });

  test('a member with a boolean inherits_down and a rationale is valid', () => {
    const file = applicability(
      member('issued', '    inherits_down: false\n    rationale:\n      en: Because.\n'),
    );
    expect(check(file)).toEqual([]);
  });

  test('an unknown key on a member is reported at the key', () => {
    const file = applicability(member('issued', '    inherits_down: false\n    bogus: 1\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(file.text, 'bogus'));
    expect(problems[0]?.message).toBe('unknown property "bogus"');
  });
});

describe('the required-file rule for applicability-status', () => {
  test('a model without the file reports it as missing', () => {
    const root = modelCopy();
    rmSync(join(root, APPLICABILITY_STATUS));
    const problems = checkModel(root);
    expect(problems).toContainEqual(
      expect.objectContaining({
        file: APPLICABILITY_STATUS,
        message: 'required vocabulary file is missing',
      }),
    );
  });
});
