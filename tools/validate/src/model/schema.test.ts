import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parseDocument } from 'yaml';
import { checkModelFiles, uniqueProblems } from './check-model.ts';
import { parseModelFile } from './load.ts';
import { createAjv, schemaProblems } from './schema.ts';

const PATH = 'model/vocab/certainty.yaml';
const REAL = readFileSync(join(REPO_ROOT, PATH), 'utf8');
const HEADER = REAL.split('\n', 1)[0] ?? '';

function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const check = (text: string) => checkModelFiles([{ path: PATH, text }]);

describe('certainty schema messages', () => {
  test('a missing values key is reported at the file root', () => {
    const text = `${HEADER}\nid: certainty\nlabel:\n  en: Certainty\n`;
    expect(check(text)).toEqual([
      { file: PATH, line: 1, column: 1, message: 'missing required property "values"' },
    ]);
  });

  test('a missing rank is reported at the start of that value', () => {
    const doc = parseDocument(REAL, { schema: 'core' });
    doc.deleteIn(['values', 1, 'rank']);
    const text = doc.toString({ lineWidth: 0 });
    expect(check(text)).toEqual([
      {
        file: PATH,
        ...where(text, 'id: likely'),
        message: 'missing required property "rank"',
      },
    ]);
  });

  test('an id other than certainty gives the const error and the id-equals-file-name error', () => {
    const text = REAL.replace('id: certainty\n', 'id: level\n');
    const problems = check(text);
    const position = where(text, 'level');
    expect(problems.map((p) => p.message)).toEqual(
      expect.arrayContaining([
        'must be "certainty"',
        'the id must equal the file name without .yaml: "certainty"',
      ]),
    );
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toMatchObject(position);
  });

  test('rank 0 reports the minimum', () => {
    const problems = check(REAL.replace('rank: 2\n', 'rank: 0\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('>= 1');
  });

  test('an unquoted 0106 as a rank is exactly one problem (the number rule)', () => {
    const text = REAL.replace('rank: 2\n', 'rank: 0106\n');
    const problems = check(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(text, '0106'));
    expect(problems[0]?.message).toContain('quote it');
  });

  test('an unquoted 0106 as a value id drops the schema type error at the same position', () => {
    const text = REAL.replace('id: likely\n', 'id: 0106\n');
    const problems = check(text);
    const position = where(text, '0106');
    expect(
      problems.filter((p) => p.line === position.line && p.column === position.column),
    ).toHaveLength(1);
    expect(problems.some((p) => p.message === 'must be string')).toBe(false);
  });

  test('an unknown key is named in a closed object message', () => {
    const text = REAL.replace('rank: 2\n', 'rank: 2\n    rnak: 3\n');
    expect(check(text)).toEqual([
      { file: PATH, ...where(text, 'rnak'), message: 'unknown property "rnak"' },
    ]);
  });

  test('no schema message contains the failing instance value', () => {
    const problems = check(REAL.replace('rank: 2\n', 'rank: high-ish\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('must be integer');
    for (const problem of problems) expect(problem.message).not.toContain('high-ish');
  });

  test('a wrong value type for a label is one message per failing rule', () => {
    const problems = check(REAL.replace('en: Certainty\n', 'en: ""\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('fewer than 1');
  });
});

describe('error shaping on an inline schema', () => {
  const ajv = createAjv();
  // Written as JSON text: a `then` key in an object literal trips the thenable lint rule.
  ajv.addSchema(
    JSON.parse(`{
      "$id": "shape-test.schema.json",
      "type": "object",
      "properties": {
        "one": { "oneOf": [{ "type": "string", "minLength": 3 }, { "type": "integer" }] },
        "any": { "anyOf": [{ "type": "string" }, { "type": "integer" }] },
        "pick": { "enum": ["x", "y"] },
        "cond": {
          "if": { "type": "object" },
          "then": { "type": "object", "required": ["k"], "properties": { "k": { "type": "string" } } },
          "else": { "type": "string" }
        }
      },
      "unevaluatedProperties": false
    }`) as object,
  );

  const run = (body: string) => {
    const { parsed } = parseModelFile({ path: 'model/vocab/shape.yaml', text: body });
    return schemaProblems(ajv, 'shape-test.schema.json', parsed);
  };

  test('oneOf gives one message and drops its branch errors', () => {
    expect(run('one: true\n')).toEqual([
      {
        file: 'model/vocab/shape.yaml',
        line: 1,
        column: 6,
        message: 'must match exactly one allowed form',
      },
    ]);
  });

  test('anyOf gives one message and drops its branch errors', () => {
    expect(run('any: true\n')).toEqual([
      {
        file: 'model/vocab/shape.yaml',
        line: 1,
        column: 6,
        message: 'must match at least one allowed form',
      },
    ]);
  });

  test('enum lists the allowed values', () => {
    expect(run('pick: z\n').map((p) => p.message)).toEqual(['must be one of: x, y']);
  });

  test('an if keyword error is dropped and the real failure stays', () => {
    expect(run('cond: 5\n').map((p) => p.message)).toEqual(['must be string']);
    expect(run('cond: {}\n').map((p) => p.message)).toEqual(['missing required property "k"']);
  });

  test('an unavailable schema is one file-level problem', () => {
    const { parsed } = parseModelFile({ path: 'model/vocab/shape.yaml', text: 'a: 1\n' });
    expect(schemaProblems(ajv, 'nope.schema.json', parsed)).toEqual([
      { file: 'model/vocab/shape.yaml', message: 'schema nope.schema.json is not available' },
    ]);
  });
});

describe('uniqueProblems', () => {
  test('keeps one of identical problems and keeps problems that differ in any field', () => {
    const a = { file: 'f', line: 1, column: 2, message: 'm' };
    expect(uniqueProblems([a, { ...a }, { ...a, column: 3 }, { ...a, message: 'n' }])).toEqual([
      a,
      { ...a, column: 3 },
      { ...a, message: 'n' },
    ]);
  });
});
