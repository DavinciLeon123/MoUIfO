import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { checkModel, checkModelFiles } from './check-model.ts';
import {
  discoverModelFiles,
  expectedHeader,
  MODEL_KINDS,
  parseModelFile,
  positionOf,
  schemaFileFor,
} from './load.ts';

const PATH = 'model/vocab/certainty.yaml';
const HEADER =
  '# yaml-language-server: $schema=../../tools/validate/schemas/vocab-certainty.schema.json';
const MAPPING_ONLY = 'a model file must contain a mapping';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-model-'));
  scratch.push(root);
  return root;
}

const parse = (text: string, path = PATH) => parseModelFile({ path, text });

describe('numeric scalars (D-05)', () => {
  const at = (value: string) => parse(`${HEADER}\nid: certainty\nextra: ${value}\n`).problems;

  test('an unquoted 001469630 is one problem at the scalar and never echoes the digits', () => {
    const problems = at('001469630');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: PATH, line: 3, column: 8 });
    const message = problems[0]?.message ?? '';
    expect(message).toContain('loses digits in YAML; quote it');
    expect(message).not.toContain('1469630');
  });

  test.for([['0106'], ['-0106'], ['12345678901234567890'], ['0x1F'], ['0o17']])(
    '%s gives one problem and is not echoed',
    ([value]) => {
      const problems = at(value as string);
      expect(problems).toHaveLength(1);
      expect(problems[0]?.message).toContain('loses digits in YAML; quote it');
      expect(problems[0]?.message).not.toContain(value as string);
    },
  );

  test.for([['0'], ['0.5'], ['1e3'], ['15'], ['123456789012345'], ['"001469630"'], ['"0106"']])(
    '%s gives no problem',
    ([value]) => {
      expect(at(value as string)).toEqual([]);
    },
  );

  test('the rule runs on every scalar, keys included', () => {
    const problems = parse(`${HEADER}\nid: certainty\n0106: x\n`).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3, column: 1 });
  });
});

describe('parser errors and warnings (D-06)', () => {
  test('a duplicate key is an error at the second key', () => {
    const problems = parse(`${HEADER}\nid: certainty\nid: certainty\n`).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3, column: 1 });
    expect(problems[0]?.message).toContain('duplicate');
  });

  test('an unquoted !NL is an error with the quoting hint', () => {
    const problems = parse(`${HEADER}\nid: certainty\nextra: !NL\n`).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3, column: 8 });
    expect(problems[0]?.message).toContain('Unresolved tag');
    expect(problems[0]?.message).toContain('quote values that start with "!"');
  });

  test('two documents in one file are an error', () => {
    const problems = parse(`${HEADER}\nid: certainty\n---\nid: certainty\n`).problems;
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]?.message).toContain('one YAML document');
  });

  test('a file with a parser error is not usable for schema validation', () => {
    expect(parse(`${HEADER}\nid: certainty\nid: certainty\n`).usable).toBe(false);
    expect(parse(`${HEADER}\nid: certainty\n`).usable).toBe(true);
  });
});

describe('empty and non-mapping files', () => {
  test.for([
    ['an empty file', ''],
    ['a comment-only file', `${HEADER}\n`],
    ['a sequence root', `${HEADER}\n- a\n- b\n`],
    ['a scalar root', `${HEADER}\njust text\n`],
  ])('%s fails at 1:1', ([, text]) => {
    const { problems, usable } = parse(text as string);
    expect(problems.filter((p) => p.message === MAPPING_ONLY)).toEqual([
      { file: PATH, line: 1, column: 1, message: MAPPING_ONLY },
    ]);
    expect(usable).toBe(false);
  });
});

describe('schema header (D-02)', () => {
  test('the expected line names the schema relative to the file', () => {
    expect(expectedHeader(PATH)).toBe(HEADER);
  });

  test.for([
    ['a missing first line', 'id: certainty\n'],
    [
      'another schema',
      '# yaml-language-server: $schema=../../tools/validate/schemas/common.schema.json\nid: certainty\n',
    ],
    [
      'extra spaces',
      '#  yaml-language-server: $schema=../../tools/validate/schemas/vocab-certainty.schema.json\nid: certainty\n',
    ],
  ])('%s fails at 1:1 and shows the expected line', ([, text]) => {
    const problems = parse(text as string).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: PATH, line: 1, column: 1 });
    expect(problems[0]?.message).toContain(HEADER);
  });

  test('a CRLF line ending after the header is accepted', () => {
    expect(parse(`${HEADER}\r\nid: certainty\r\n`).problems).toEqual([]);
  });
});

describe('id equals the file-name stem (encoding edge)', () => {
  test('Certainty in certainty.yaml fails at the id value', () => {
    const problems = parse(`${HEADER}\nid: Certainty\n`).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 2, column: 5 });
    expect(problems[0]?.message).toContain('certainty');
  });

  test('certainty in certainty.yaml passes', () => {
    expect(parse(`${HEADER}\nid: certainty\n`).problems).toEqual([]);
  });
});

describe('positionOf', () => {
  const parsed = parse(`${HEADER}\nid: certainty\nvalues:\n  - id: a\n`).parsed;

  test('resolves a key and a value', () => {
    expect(positionOf(parsed, '/id', 'key')).toEqual({ line: 2, column: 1 });
    expect(positionOf(parsed, '/id', 'value')).toEqual({ line: 2, column: 5 });
    expect(positionOf(parsed, '/values/0', 'key')).toEqual({ line: 4, column: 5 });
  });

  test('falls back to the nearest ancestor and finally to 1:1', () => {
    expect(positionOf(parsed, '/values/9/rank', 'value')).toEqual(
      positionOf(parsed, '/values', 'value'),
    );
    expect(positionOf(parsed, '/nope/deeper', 'value')).toEqual({ line: 1, column: 1 });
    expect(positionOf(parsed, '', 'value')).toEqual({ line: 1, column: 1 });
  });
});

describe('discovery', () => {
  test('the five kind directories are the closed set', () => {
    expect([...MODEL_KINDS]).toEqual([
      'vocab',
      'jurisdictions',
      'authorities',
      'sources',
      'schemes',
    ]);
  });

  test('files in the five kind directories are accepted; dot-files are ignored', () => {
    const root = tempRoot();
    for (const kind of MODEL_KINDS) {
      mkdirSync(join(root, 'model', kind), { recursive: true });
      writeFileSync(join(root, 'model', kind, 'x.yaml'), 'id: x\n');
    }
    writeFileSync(join(root, 'model', '.gitkeep'), '');
    writeFileSync(join(root, 'model', 'vocab', '.hidden'), '');
    const { files, problems } = discoverModelFiles(root);
    expect(problems).toEqual([]);
    expect(files.map((f) => f.path)).toEqual([
      'model/authorities/x.yaml',
      'model/jurisdictions/x.yaml',
      'model/schemes/x.yaml',
      'model/sources/x.yaml',
      'model/vocab/x.yaml',
    ]);
  });

  test.for([
    ['a file at the top level of model/', 'model/notes.yaml'],
    ['a .yml file', 'model/vocab/x.yml'],
    ['a non-YAML file', 'model/vocab/readme.md'],
    ['a directory that is not a kind', 'model/other/x.yaml'],
    ['a sub-directory inside a kind directory', 'model/vocab/sub/x.yaml'],
  ])('%s is a file-level error', ([, rel]) => {
    const root = tempRoot();
    const path = join(root, rel as string);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'id: x\n');
    const { problems } = discoverModelFiles(root);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem.line).toBeUndefined();
      expect(problem.file.startsWith('model/')).toBe(true);
    }
    expect(checkModel(root).length).toBeGreaterThan(0);
  });

  test('a symbolic link is reported and never followed', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'model', 'vocab'), { recursive: true });
    writeFileSync(join(root, 'outside.yaml'), 'id: x\n');
    symlinkSync(join(root, 'outside.yaml'), join(root, 'model', 'vocab', 'link.yaml'));
    const { files, problems } = discoverModelFiles(root);
    expect(files).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('model/vocab/link.yaml');
  });

  test('a missing model directory is not an error here', () => {
    expect(discoverModelFiles(tempRoot())).toEqual({ files: [], problems: [] });
  });
});

describe('schemaFileFor and unknown vocabulary files', () => {
  test('maps the certainty vocabulary and the other kinds', () => {
    expect(schemaFileFor('model/vocab/certainty.yaml')).toBe('vocab-certainty.schema.json');
    expect(schemaFileFor('model/jurisdictions/NL.yaml')).toBe('jurisdiction.schema.json');
    expect(schemaFileFor('model/authorities/kvk.yaml')).toBe('authority.schema.json');
    expect(schemaFileFor('model/sources/x.yaml')).toBe('source.schema.json');
    expect(schemaFileFor('model/schemes/eori.yaml')).toBe('scheme.schema.json');
    expect(schemaFileFor('model/vocab/mystery.yaml')).toBeUndefined();
  });

  test('a vocab file whose stem is not a known vocabulary is one file-level problem', () => {
    const problems = checkModelFiles([{ path: 'model/vocab/mystery.yaml', text: 'id: mystery\n' }]);
    expect(problems).toEqual([
      { file: 'model/vocab/mystery.yaml', message: 'not a known vocabulary file' },
    ]);
  });
});

describe('ordering (D-04)', () => {
  test('problems are sorted by file, line, column and message in code-unit order', () => {
    const unknownKeys = `${HEADER}\nid: certainty\nzz: 1\naa: 2\n`;
    const files = [
      { path: 'model/vocab/a.yaml', text: 'id: a\n' },
      { path: 'model/vocab/B.yaml', text: 'id: B\n' },
      { path: PATH, text: unknownKeys },
    ];
    const problems = checkModelFiles(files);
    expect(problems.map((p) => `${p.file}:${p.line ?? 0}:${p.column ?? 0}`)).toEqual([
      'model/vocab/B.yaml:0:0',
      'model/vocab/a.yaml:0:0',
      'model/vocab/certainty.yaml:1:1',
      'model/vocab/certainty.yaml:1:1',
      'model/vocab/certainty.yaml:3:1',
      'model/vocab/certainty.yaml:4:1',
    ]);
    expect(checkModelFiles(files)).toEqual(problems);
    expect(checkModelFiles([...files].reverse())).toEqual(problems);
  });
});
