import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { checkModel, checkModelFiles } from './check-model.ts';
import { type ModelFile, parseModelFile } from './load.ts';
import { buildRegistry, refKeyword } from './refs.ts';
import { SCHEMA_DIR } from './schema.ts';
import { fixture, realModelFiles, withRealModel } from './testing.ts';

const RELATION_KIND = 'model/vocab/relation-kind.yaml';
const CERTAINTY = 'model/vocab/certainty.yaml';

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const HEAD = 'id: relation-kind\nlabel:\n  en: Relation kind\nvalues:\n';
const member = (id: string, extra = ''): string =>
  `  - id: ${id}\n    label:\n      en: Label\n    definition:\n      en: Definition\n${extra}`;

const relationKind = (members: string): ModelFile => fixture(RELATION_KIND, `${HEAD}${members}`);
const check = (file: ModelFile) => checkModelFiles(withRealModel(file));
const realFile = (path: string): ModelFile => {
  const found = realModelFiles().find((file) => file.path === path);
  if (found === undefined) throw new Error(`missing real file ${path}`);
  return found;
};

describe('the real relation-kind vocabulary', () => {
  test('the repository validates and lists the nine kinds in SPEC order with specializes last', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
    const data = parse(realFile(RELATION_KIND).text, { schema: 'core' }) as {
      values: { id: string }[];
    };
    expect(data.values.map((value) => value.id)).toEqual([
      'derived-from',
      'contains',
      'prerequisite',
      'same-level',
      'different-level',
      'equivalent-in',
      'may-identify-same-party',
      'references',
      'specializes',
    ]);
  });

  test('no member of the real vocabulary carries a source (DEC-019)', () => {
    expect(realFile(RELATION_KIND).text).not.toMatch(/^\s+source:/m);
  });
});

describe('uioRef on a vocabulary member', () => {
  test('an unknown certainty and an unknown source are reported at their values', () => {
    const file = relationKind(member('contains', '    certainty: sure\n    source: no-such-source\n'));
    const problems = check(file);
    expect(problems).toHaveLength(2);
    const certainty = problems.find((p) => p.message.includes('vocabulary certainty'));
    const source = problems.find((p) => p.message.includes('source'));
    expect(certainty).toMatchObject({ file: RELATION_KIND, ...where(file.text, 'sure') });
    expect(certainty?.message).toBe('"sure" is not a known member of vocabulary certainty');
    expect(source).toMatchObject({ file: RELATION_KIND, ...where(file.text, 'no-such-source') });
    expect(source?.message).toBe('"no-such-source" is not a known source');
  });

  test('a source without a certainty is one error at the member naming certainty', () => {
    const file = relationKind(member('contains', '    source: x\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: RELATION_KIND, ...where(file.text, 'id: contains') });
    expect(problems[0]?.message).toContain('certainty');
  });

  test('a certainty without a source is one error at the member naming source', () => {
    const file = relationKind(member('contains', '    certainty: likely\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: RELATION_KIND, ...where(file.text, 'id: contains') });
    expect(problems[0]?.message).toContain('source');
  });

  test('a file with a structural error is not reference-checked (no cascade)', () => {
    const file = relationKind(
      member('contains', '    certainty: sure\n    source: no-such-source\n    bogus: 1\n'),
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('unknown property "bogus"');
  });

  test('a broken referenced file does not vouch for its members', () => {
    const real = realFile(CERTAINTY);
    const broken = { path: CERTAINTY, text: real.text.replace('rank: 2\n', 'rank: 2\n    rnak: 3\n') };
    const file = relationKind(member('contains', '    certainty: likely\n    source: no-such-source\n'));
    const problems = checkModelFiles(withRealModel([broken, file]));
    expect(problems.map((p) => p.message)).toContain('unknown property "rnak"');
    const likely = problems.find((p) => p.file === RELATION_KIND && p.message.includes('"likely"'));
    expect(likely).toMatchObject(where(file.text, 'likely'));
    expect(likely?.message).toBe('"likely" is not a known member of vocabulary certainty');
  });

  test('a reference value that is not id-shaped is reported without being echoed', () => {
    const file = relationKind(member('contains', '    certainty: "12 34"\n    source: x\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('the value is not a known member of vocabulary certainty');
    expect(problems[0]?.message).not.toContain('12 34');
  });
});

describe('refKeyword', () => {
  const registry = buildRegistry(
    [
      { path: 'model/jurisdictions/nl.yaml', text: 'id: nl\n' },
      { path: 'model/jurisdictions/NL.yaml', text: 'id: NL\n' },
    ].map((file) => ({ parsed: parseModelFile(file).parsed })),
  );

  function compile(kind: string, cited = new Set<string>(), withRegistry = true) {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addKeyword(refKeyword(withRegistry ? registry : undefined, cited));
    return ajv.compile({ type: 'string', uioRef: kind });
  }

  test('a leading ! is accepted only for jurisdiction-negatable', () => {
    expect(compile('jurisdiction-negatable')('!NL')).toBe(true);
    expect(compile('jurisdiction-negatable')('NL')).toBe(true);
    const plain = compile('jurisdiction');
    expect(plain('NL')).toBe(true);
    expect(plain('!NL')).toBe(false);
    expect(plain.errors?.[0]?.message).toBe('"!NL" is not a known jurisdiction');
    expect(compile('jurisdiction-negatable')('!!NL')).toBe(false);
  });

  test('with no registry every value passes and nothing is recorded', () => {
    const cited = new Set<string>();
    expect(compile('source', cited, false)('anything')).toBe(true);
    expect(cited.size).toBe(0);
  });

  test('with a registry every source value is recorded as cited, known or not', () => {
    const cited = new Set<string>();
    const validate = compile('source', cited);
    validate('one');
    validate('two');
    expect([...cited].sort()).toEqual(['one', 'two']);
  });

  test('an error carries the instance path of the referring value', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addKeyword(refKeyword(registry, new Set()));
    const validate = ajv.compile({
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string', uioRef: 'scheme' } } },
    });
    expect(validate({ list: ['a'] })).toBe(false);
    expect(validate.errors?.[0]?.instancePath).toBe('/list/0');
  });
});

describe('buildRegistry', () => {
  const parsed = (path: string, text: string) => ({ parsed: parseModelFile({ path, text }).parsed });

  test('collects ids by kind, authority classes and vocabulary members', () => {
    const registry = buildRegistry([
      parsed('model/sources/s1.yaml', 'id: s1\n'),
      parsed('model/jurisdictions/nl.yaml', 'id: nl\n'),
      parsed('model/authorities/kvk.yaml', 'id: kvk\nkind: instance\n'),
      parsed('model/authorities/registry.yaml', 'id: registry\nkind: class\n'),
      parsed('model/schemes/vat.yaml', 'id: vat\n'),
      parsed('model/vocab/level.yaml', 'id: level\nvalues:\n  - id: a\n  - id: b\n'),
      parsed(
        'model/vocab/country-prefix.yaml',
        'id: country-prefix\nvalues:\n  - prefix: NL\n  - prefix: EL\n',
      ),
    ]);
    expect([...(registry.get('source') ?? [])]).toEqual(['s1']);
    expect([...(registry.get('jurisdiction') ?? [])]).toEqual(['nl']);
    expect([...(registry.get('authority') ?? [])].sort()).toEqual(['kvk', 'registry']);
    expect([...(registry.get('authority-class') ?? [])]).toEqual(['registry']);
    expect([...(registry.get('scheme') ?? [])]).toEqual(['vat']);
    expect([...(registry.get('vocab') ?? [])].sort()).toEqual(['country-prefix', 'level']);
    expect([...(registry.get('vocab:level') ?? [])]).toEqual(['a', 'b']);
    expect([...(registry.get('vocab:country-prefix') ?? [])]).toEqual(['NL', 'EL']);
  });
});

describe('schema hygiene', () => {
  test('no schema places uioRef inside an if subschema (its errors would be swallowed)', () => {
    const dir = fileURLToPath(SCHEMA_DIR);
    const mentions = (node: unknown): boolean => JSON.stringify(node).includes('"uioRef"');
    const offenders: string[] = [];
    const walk = (name: string, node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(name, item);
      } else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'if' && mentions(value)) offenders.push(name);
          walk(name, value);
        }
      }
    };
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.schema.json'))) {
      walk(name, JSON.parse(readFileSync(`${dir}${name}`, 'utf8')));
    }
    expect(offenders).toEqual([]);
  });
});
