import { describe, expect, test } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import { checkPartOf } from './cross-file.ts';
import { type ModelFile, parseModelFile } from './load.ts';
import { fixture, withRealModel } from './testing.ts';

const check = (files: ModelFile | readonly ModelFile[]) => checkModelFiles(withRealModel(files));

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const jurisdiction = (id: string, parents: readonly string[]): ModelFile =>
  fixture(
    `model/jurisdictions/${id}.yaml`,
    `id: ${id}\nlabel:\n  en: Fixture ${id}\n${
      parents.length === 0
        ? ''
        : `part_of:\n${parents
            .map((p) => `  - jurisdiction: ${p}\n    source: teu-art-52\n    certainty: certain\n`)
            .join('')}`
    }`,
  );

/** Position of the value `target` on a `jurisdiction:` line of `file`. */
const atParent = (file: ModelFile, target: string) => {
  const marker = `jurisdiction: ${target}`;
  const at = where(file.text, marker);
  return { line: at.line, column: at.column + 'jurisdiction: '.length };
};

describe('part_of cycles', () => {
  test('EU part_of NL against the real NL part_of EU is one cycle, at the first file of the cycle', () => {
    const eu = jurisdiction('EU', ['NL']);
    expect(check(eu)).toEqual([
      {
        file: 'model/jurisdictions/EU.yaml',
        ...atParent(eu, 'NL'),
        message: 'part_of forms a cycle: EU -> NL -> EU',
      },
    ]);
  });

  test('a three-jurisdiction cycle is reported once, starting at the smallest id', () => {
    const xa = jurisdiction('XA', ['XB']);
    const xb = jurisdiction('XB', ['XC']);
    const xc = jurisdiction('XC', ['XA']);
    for (const order of [
      [xa, xb, xc],
      [xc, xb, xa],
      [xb, xa, xc],
    ]) {
      expect(check(order)).toEqual([
        {
          file: 'model/jurisdictions/XA.yaml',
          ...atParent(xa, 'XB'),
          message: 'part_of forms a cycle: XA -> XB -> XC -> XA',
        },
      ]);
    }
  });

  test('a self-reference is not also reported as a cycle', () => {
    const zz = jurisdiction('ZZ', ['ZZ']);
    expect(check(zz).map((problem) => problem.message)).toEqual([
      'a jurisdiction cannot be part of itself',
    ]);
  });

  test('an unknown parent is left to the reference check and forms no cycle', () => {
    const zz = jurisdiction('ZZ', ['XX']);
    expect(check(zz).map((problem) => problem.message)).toEqual([
      '"XX" is not a known jurisdiction',
    ]);
  });

  test('checkPartOf is deterministic: the same input gives deep-equal output', () => {
    const files = withRealModel([jurisdiction('XA', ['XB']), jurisdiction('XB', ['XA'])])
      .filter((file) => file.path.startsWith('model/jurisdictions/'))
      .map((file) => parseModelFile(file).parsed);
    const first = checkPartOf(files);
    expect(first).toHaveLength(1);
    expect(checkPartOf(files)).toEqual(first);
    expect(checkPartOf([...files].reverse())).toEqual(first);
  });
});

describe('several parents and GLOBAL', () => {
  test('a jurisdiction may name several distinct parents', () => {
    expect(check(jurisdiction('ZZ', ['EU', 'NL']))).toEqual([]);
  });

  test('a GLOBAL.yaml file is a valid jurisdiction', () => {
    expect(check(jurisdiction('GLOBAL', []))).toEqual([]);
  });

  test('a reference to GLOBAL fails as an unknown jurisdiction while no GLOBAL file exists', () => {
    const zy = jurisdiction('ZY', ['GLOBAL']);
    expect(check(zy)).toEqual([
      {
        file: 'model/jurisdictions/ZY.yaml',
        ...atParent(zy, 'GLOBAL'),
        message: '"GLOBAL" is not a known jurisdiction',
      },
    ]);
  });

  test.each(['NLD', 'nl'])('the id %s fails the id pattern', (id) => {
    const file = jurisdiction(id, []);
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: `model/jurisdictions/${id}.yaml`,
      ...where(file.text, `id: ${id}`),
      column: where(file.text, `id: ${id}`).column + 'id: '.length,
    });
    expect(problems[0]?.message).toContain('pattern');
  });
});
