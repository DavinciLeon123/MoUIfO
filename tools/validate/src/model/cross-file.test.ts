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
      'the value is not a known jurisdiction',
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
        message: 'the value is not a known jurisdiction',
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

const CLASS = 'model/authorities/national-customs-authority.yaml';
const INSTANCE = 'model/authorities/douane-nl.yaml';

const authorityClass = (extra = '', kind = 'class'): ModelFile =>
  fixture(
    CLASS,
    `id: national-customs-authority\nkind: ${kind}\nlabel:\n  en: National customs authority\ndefinition:\n  en: The customs authority of one country.\n${extra}`,
  );

const authorityInstance = (overrides: Record<string, string | undefined> = {}): ModelFile => {
  const fields: Record<string, string | undefined> = {
    instance_of: 'national-customs-authority',
    jurisdiction: 'NL',
    source: 'teu-art-52',
    certainty: 'certain',
    ...overrides,
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
  return fixture(INSTANCE, `id: douane-nl\nkind: instance\nlabel:\n  en: Douane\n${lines}`);
};

/** Position of the value after `key: ` on its line. */
const atValue = (file: ModelFile, key: string, value: string) => {
  const at = where(file.text, `${key}: ${value}`);
  return { line: at.line, column: at.column + key.length + 2 };
};

describe('authority classes and instances', () => {
  test('a class plus an instance of it, with a real jurisdiction and source, give no problem', () => {
    expect(check([authorityClass(), authorityInstance()])).toEqual([]);
  });

  test('instance_of naming no class is an error at that value', () => {
    const instance = authorityInstance({ instance_of: 'no-such-class' });
    expect(check([authorityClass(), instance])).toEqual([
      {
        file: INSTANCE,
        ...atValue(instance, 'instance_of', 'no-such-class'),
        message: 'the value is not a known authority class',
      },
    ]);
  });

  test('instance_of naming an instance, not a class, is an error at that value', () => {
    const other = fixture(
      'model/authorities/douane-be.yaml',
      'id: douane-be\nkind: instance\nlabel:\n  en: Douane BE\ninstance_of: douane-nl\njurisdiction: NL\nsource: teu-art-52\ncertainty: certain\n',
    );
    expect(check([authorityClass(), authorityInstance(), other])).toEqual([
      {
        file: 'model/authorities/douane-be.yaml',
        ...atValue(other, 'instance_of', 'douane-nl'),
        message: 'the value is not a known authority class',
      },
    ]);
  });

  test('an instance in a jurisdiction that does not exist is an error at that value', () => {
    const instance = authorityInstance({ jurisdiction: 'DE' });
    expect(check([authorityClass(), instance])).toEqual([
      {
        file: INSTANCE,
        ...atValue(instance, 'jurisdiction', 'DE'),
        message: 'the value is not a known jurisdiction',
      },
    ]);
  });

  test.each(['source', 'certainty', 'jurisdiction', 'instance_of'])(
    'an instance without %s is a missing-property error',
    (field) => {
      const problems = check([authorityClass(), authorityInstance({ [field]: undefined })]).filter(
        (problem) => problem.file === INSTANCE,
      );
      expect(problems.map((problem) => problem.message)).toEqual([
        `missing required property "${field}"`,
      ]);
    },
  );

  test('a class carrying instance_of is an error at that key', () => {
    const file = authorityClass('instance_of: national-customs-authority\n');
    const problems = check(file);
    expect(problems).toEqual([
      {
        file: CLASS,
        ...where(file.text, 'instance_of'),
        message: 'this property is not allowed for this kind',
      },
    ]);
  });

  test('a class without a definition is a missing-property error', () => {
    const file = fixture(
      CLASS,
      'id: national-customs-authority\nkind: class\nlabel:\n  en: National customs authority\n',
    );
    expect(check(file).map((problem) => problem.message)).toEqual([
      'missing required property "definition"',
    ]);
  });

  test('kind agency is an enum error at the value and nothing else', () => {
    const file = authorityClass('', 'agency');
    expect(check(file)).toEqual([
      {
        file: CLASS,
        ...atValue(file, 'kind', 'agency'),
        message: 'must be one of: class, instance',
      },
    ]);
  });
});

describe('source types (DEC-030)', () => {
  const SRC = 'model/sources/fixture-src.yaml';
  const source = (fields: string): ModelFile =>
    fixture(SRC, `id: fixture-src\ntitle: Fixture source\ndate: 2026-01-01\n${fields}`);
  /** A fixture jurisdiction that cites the fixture source so no uncited warning appears. */
  const citing = (): ModelFile =>
    fixture(
      'model/jurisdictions/ZZ.yaml',
      'id: ZZ\nlabel:\n  en: Fixture\npart_of:\n  - jurisdiction: EU\n    source: fixture-src\n    certainty: certain\n',
    );
  const own = (file: ModelFile) =>
    check([file, citing()]).filter((problem) => problem.file === SRC);

  test.each([
    ['law with a url', 'type: law\nurl: https://example.org/law\n'],
    ['law with an eli', 'type: law\neli: http://data.europa.eu/eli/reg/2013/952/oj\n'],
    ['standard', 'type: standard\npublisher: ISO\nreference: ISO 17442\n'],
    ['register-doc', 'type: register-doc\nurl: https://example.org/register\n'],
    ['analysis', 'type: analysis\nmethod: Checksum verified computationally\n'],
    ['expert', 'type: expert\nrole: Customs policy adviser\norganisation: Example Authority\n'],
  ])('a valid %s source passes, and its citation clears the warning', (_name, fields) => {
    expect(check([source(fields), citing()])).toEqual([]);
  });

  test.each([
    ['a law with neither eli nor url', 'type: law\n', 'must match at least one allowed form'],
    [
      'a standard without reference',
      'type: standard\npublisher: ISO\n',
      'missing required property "reference"',
    ],
    [
      'a standard without publisher',
      'type: standard\nreference: ISO 17442\n',
      'missing required property "publisher"',
    ],
    ['a register-doc without url', 'type: register-doc\n', 'missing required property "url"'],
    ['an analysis without method', 'type: analysis\n', 'missing required property "method"'],
    [
      'an expert without organisation',
      'type: expert\nrole: Adviser\n',
      'missing required property "organisation"',
    ],
    [
      'an expert without role',
      'type: expert\norganisation: Example Authority\n',
      'missing required property "role"',
    ],
  ])('%s fails at the file root', (_name, fields, message) => {
    expect(own(source(fields))).toEqual([{ file: SRC, line: 1, column: 1, message }]);
  });

  test('an impossible date fails at the date value', () => {
    const file = source('type: register-doc\nurl: https://example.org/r\n').text.replace(
      '2026-01-01',
      '2026-13-40',
    );
    const found = own({ path: SRC, text: file });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject(atValue({ path: SRC, text: file }, 'date', '2026-13-40'));
  });

  test('an unknown key such as retrieved fails as an unknown property', () => {
    const file = source('type: register-doc\nurl: https://example.org/r\nretrieved: 2026-01-01\n');
    expect(own(file)).toEqual([
      {
        file: SRC,
        ...where(file.text, 'retrieved'),
        message: 'unknown property "retrieved"',
      },
    ]);
  });
});
