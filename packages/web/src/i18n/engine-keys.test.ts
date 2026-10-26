// D-12 and WEB-09: a conclusion key or warning code the engine can emit without an English and a
// Dutch dictionary entry fails here, proven three ways: the exact key lists, a static scan of the
// engine source (which also finds keys the model never makes the engine emit) and a runtime sweep
// over the real model. The only nine-digit run is the public example RSIN of SPEC section 10
// (allow-listed); every other value comes from the model's own examples.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vitest/node';
import { type Conclusion, createHost, type Warning } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { ENGINE_EN } from './engine.en.ts';
import { ENGINE_NL } from './engine.nl.ts';
import { CONCLUSION_KEYS, WARNING_CODES } from './engine-keys.ts';
import { conclusionText, warningText } from './text.ts';

const ENGINE_SRC = new URL('../../../engine/src/', import.meta.url);
const KEY_SHAPE = /^(?:recognise|derive|check|relate|applicability|describe)\.[a-z0-9-]+$/;

/** Every engine source file that ships: `.ts` under src except tests and `testing/`, sorted. */
function engineSourceFiles(): string[] {
  return readdirSync(ENGINE_SRC, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => file !== 'testing' && !file.startsWith('testing/'))
    .sort();
}

type AstNode = { type: string } & Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  if (isNode(node)) visit(node);
  for (const key of Object.keys(node)) walk((node as Record<string, unknown>)[key], visit);
}

function stringLiteral(node: unknown): string | null {
  return isNode(node) && node.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : null;
}

function identifierName(node: unknown): string | null {
  return isNode(node) && node.type === 'Identifier' && typeof node.name === 'string'
    ? node.name
    : null;
}

type Scan = {
  /** String literals shaped like a conclusion key, anywhere in the engine source. */
  keyLiterals: Set<string>;
  /** `describe.<key>` for the key argument of every `header(` and `take(` call in describe.ts. */
  describeKeys: Set<string>;
  /** Literals passed as `code:`, to `emptyResult(` or to `toWarning(`. */
  codes: Set<string>;
};

function scanEngineSource(): Scan {
  const scan: Scan = { keyLiterals: new Set(), describeKeys: new Set(), codes: new Set() };
  for (const file of engineSourceFiles()) {
    const tree = parseAst(readFileSync(new URL(file, ENGINE_SRC), 'utf8'), { lang: 'ts' });
    walk(tree, (n) => {
      const text = stringLiteral(n);
      if (text !== null && KEY_SHAPE.test(text)) scan.keyLiterals.add(text);
      if (n.type === 'Property' && identifierName(n.key) === 'code' && n.computed !== true) {
        const code = stringLiteral(n.value);
        if (code !== null) scan.codes.add(code);
      }
      if (n.type === 'CallExpression') {
        const callee = identifierName(n.callee);
        const args = Array.isArray(n.arguments) ? (n.arguments as unknown[]) : [];
        if (callee === 'emptyResult' || callee === 'toWarning') {
          const code = stringLiteral(args[0]);
          if (code !== null) scan.codes.add(code);
        }
        if (callee === 'header' || callee === 'take') {
          const key = stringLiteral(args[callee === 'header' ? 1 : 3]);
          if (key !== null) scan.describeKeys.add(`describe.${key}`);
        }
      }
    });
  }
  return scan;
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();

describe('the canonical lists (D-12)', () => {
  test('hold 34 unique conclusion keys and 21 unique warning codes', () => {
    expect(new Set(CONCLUSION_KEYS).size).toBe(34);
    expect(CONCLUSION_KEYS).toHaveLength(34);
    expect(new Set(WARNING_CODES).size).toBe(21);
    expect(WARNING_CODES).toHaveLength(21);
  });

  test.for([
    ['English', ENGINE_EN],
    ['Dutch', ENGINE_NL],
  ] as const)(
    'the %s dictionary has exactly the listed keys and codes, each with a label',
    ([, dictionary]) => {
      expect(sorted(Object.keys(dictionary.conclusions))).toEqual(sorted(CONCLUSION_KEYS));
      expect(sorted(Object.keys(dictionary.warnings))).toEqual(sorted(WARNING_CODES));
      for (const entry of [
        ...Object.values(dictionary.conclusions),
        ...Object.values(dictionary.warnings),
      ]) {
        expect(entry.label.trim()).not.toBe('');
      }
    },
  );
});

describe('static scan of the engine source (D-12)', () => {
  const scan = scanEngineSource();

  test('every conclusion key literal and describe field key is in the list, and every listed key is found', () => {
    expect(scan.keyLiterals.size).toBeGreaterThan(10);
    expect(scan.describeKeys.size).toBeGreaterThan(15);
    const found = new Set([...scan.keyLiterals, ...scan.describeKeys]);
    const listed = new Set<string>(CONCLUSION_KEYS);
    const missing = sorted([...found].filter((key) => !listed.has(key)));
    expect(
      missing,
      `engine keys without an entry in CONCLUSION_KEYS: ${missing.join(', ')}`,
    ).toEqual([]);
    const stale = sorted([...listed].filter((key) => !found.has(key)));
    expect(stale, `listed keys the engine source no longer has: ${stale.join(', ')}`).toEqual([]);
  });

  test('every warning code literal is in the list, and every listed code is found', () => {
    expect(scan.codes.size).toBeGreaterThan(10);
    const listed = new Set<string>(WARNING_CODES);
    const missing = sorted([...scan.codes].filter((code) => !listed.has(code)));
    expect(
      missing,
      `engine codes without an entry in WARNING_CODES: ${missing.join(', ')}`,
    ).toEqual([]);
    const stale = sorted([...listed].filter((code) => !scan.codes.has(code)));
    expect(stale, `listed codes the engine source no longer has: ${stale.join(', ')}`).toEqual([]);
  });
});

type Seen = { conclusion: Conclusion; data: unknown };
type Sweep = { conclusions: Seen[]; warnings: { warning: Warning; data: unknown }[] };

/** Every call the plan names over the real model, plus odd inputs that make the engine warn. */
function sweep(): Sweep {
  const host = createHost(loadDistJson());
  const { engine, model } = host;
  const result: Sweep = { conclusions: [], warnings: [] };
  const take = (
    r: { data: unknown; conclusions: Conclusion[]; warnings: Warning[] },
    dataOf: (index: number) => unknown = () => r.data,
  ) => {
    r.conclusions.forEach((conclusion, index) => {
      result.conclusions.push({ conclusion, data: dataOf(index) });
    });
    for (const warning of r.warnings) result.warnings.push({ warning, data: r.data });
  };

  const schemeIds = Object.keys(model.schemes).sort();
  const jurisdictionIds = Object.keys(model.jurisdictions).sort();
  for (const id of schemeIds) take(engine.describe(id));
  for (const id of schemeIds) {
    for (const jurisdiction of jurisdictionIds) take(engine.applicability(id, jurisdiction));
  }
  for (const a of schemeIds) {
    for (const b of schemeIds) {
      const r = engine.relate(a, b);
      take(r, (index) => r.data[index]);
    }
  }
  for (const id of schemeIds) {
    for (const value of model.schemes[id]?.format?.examples_valid ?? []) {
      take(engine.recognise(value));
      take(engine.derive(value));
      take(engine.derive(value, id));
    }
  }
  const eori = 'NL001469630';
  const vat = 'NL001469630B01';
  const rsin = '001469630';
  take(engine.check([eori, vat, rsin]));

  // Odd inputs: the codes that normal use of the site never reaches.
  take(engine.recognise(''));
  take(engine.recognise('x'.repeat(300)));
  take(engine.recognise(7 as never));
  take(engine.derive(''));
  take(engine.derive('x'.repeat(300)));
  take(engine.derive(eori, 'no-such-scheme'));
  take(engine.derive('abc', 'eori'));
  take(engine.derive(eori, 'eori', { issuing_country: 'ZZ' }));
  take(engine.derive(eori, 'eori', { issuing_country: 'BE' }));
  take(engine.derive(eori, 'eori', { bogus: 'x' } as never));
  take(engine.derive(eori, 'eori', 'x' as never));
  take(engine.relate('eori', 'eori'));
  take(engine.relate('no-such-scheme', 'eori'));
  take(engine.relate('bsn', 'eori'));
  take(engine.applicability('eori', 'ZZ'));
  take(engine.applicability('no-such-scheme', 'NL'));
  take(engine.describe('no-such-scheme'));
  take(engine.check([eori, eori]));
  take(engine.check(['', 'x'.repeat(300), eori]));
  take(engine.check(Array.from({ length: 51 }, (_, index) => `value-${index}`)));
  take(engine.check('x' as never));
  return result;
}

describe('runtime sweep over the real model (D-12)', () => {
  const seen = sweep();
  const host = createHost(loadDistJson());

  test('every conclusion key and warning code the engine emits is in the lists', () => {
    const keys = new Set(seen.conclusions.map((each) => each.conclusion.key));
    const codes = new Set(seen.warnings.map((each) => each.warning.code));
    const listedKeys = new Set<string>(CONCLUSION_KEYS);
    const listedCodes = new Set<string>(WARNING_CODES);
    expect(sorted([...keys].filter((key) => !listedKeys.has(key)))).toEqual([]);
    expect(sorted([...codes].filter((code) => !listedCodes.has(code)))).toEqual([]);
    // The sweep is only a proof when it actually reaches most of the keys (the static scan covers
    // the rest, such as check.inconsistent).
    expect(keys.size).toBeGreaterThanOrEqual(32);
    expect(codes.size).toBeGreaterThanOrEqual(15);
  });

  test('English renders the engine sentence exactly', () => {
    for (const { conclusion, data } of seen.conclusions) {
      const rendered = conclusionText(conclusion, { host, lang: 'en', data });
      expect(rendered).toEqual({ text: conclusion.statement, lang: 'en', marker: null });
      expect(
        ENGINE_EN.conclusions[conclusion.key as keyof typeof ENGINE_EN.conclusions]?.render(
          conclusion,
          { host, data, label: (text) => text.en },
        ),
      ).toBe(conclusion.statement);
    }
    for (const { warning, data } of seen.warnings) {
      const rendered = warningText(warning, { host, lang: 'en', data });
      expect(rendered).toEqual({ text: warning.message, lang: 'en', marker: null });
      expect(
        ENGINE_EN.warnings[warning.code as keyof typeof ENGINE_EN.warnings]?.render(warning, {
          host,
          data,
          label: (text) => text.en,
        }),
      ).toBe(warning.message);
    }
  });

  test('every conclusion the sweep saw renders in Dutch: filled, not marked untranslated, no placeholder', () => {
    const problems: string[] = [];
    for (const { conclusion, data } of seen.conclusions) {
      const rendered = conclusionText(conclusion, { host, lang: 'nl', data });
      const text = rendered.text;
      // A pattern sentence quotes a regular expression, which may hold `{9}`; it is checked for
      // unresolved `{name}` placeholders only.
      const braces =
        conclusion.key === 'describe.pattern' ? /\{[A-Za-z_]\w*\}/.test(text) : /[{}]/.test(text);
      if (
        text.trim() === '' ||
        rendered.marker === 'untranslated' ||
        braces ||
        /undefined|null|NaN/.test(text)
      ) {
        problems.push(`${conclusion.key}: ${JSON.stringify(rendered)}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test('every warning the sweep saw renders in Dutch and is not marked untranslated', () => {
    const problems: string[] = [];
    for (const { warning, data } of seen.warnings) {
      const rendered = warningText(warning, { host, lang: 'nl', data });
      if (
        rendered.text.trim() === '' ||
        rendered.marker === 'untranslated' ||
        /[{}]|undefined|null|NaN/.test(rendered.text)
      ) {
        problems.push(`${warning.code}: ${JSON.stringify(rendered)}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test('a key or code the dictionary lacks falls back to the English text with the untranslated marker', () => {
    const conclusion: Conclusion = {
      key: 'recognise.future-key',
      params: {},
      statement: 'An English sentence.',
      certainty: 'certain',
      explanation: [],
    };
    expect(conclusionText(conclusion, { host, lang: 'nl' })).toEqual({
      text: 'An English sentence.',
      lang: 'en',
      marker: 'untranslated',
    });
    expect(
      warningText({ code: 'future-code', message: 'An English warning.' }, { host, lang: 'nl' }),
    ).toEqual({ text: 'An English warning.', lang: 'en', marker: 'untranslated' });
  });
});
