import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { type Finding, scanSource } from './testing/ast-scan.ts';

/**
 * ENG-11 / SPEC 6.3: the engine bundle contains no network API, no dynamic code and no third-party
 * import, proven on the syntax tree (not by a text search). The ban list also covers clock,
 * randomness and locale APIs, which guards determinism (ENG-10).
 */

const SRC_DIR = new URL('./', import.meta.url);
const PACKAGE_JSON = new URL('../package.json', import.meta.url);

/** Every engine source file that ships: all `.ts` under src except tests and `testing/`, sorted. */
function engineSourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => file !== 'testing' && !file.startsWith('testing/'))
    .sort();
}

function describeFindings(findings: readonly Finding[]): string {
  return findings.map((f) => `${f.file}: ${f.rule} ${f.name}`).join('\n');
}

describe('engine source scan', () => {
  const files = engineSourceFiles();

  test('the scanned file list holds the core engine files', () => {
    for (const expected of [
      'index.ts',
      'engine.ts',
      'recognise.ts',
      'format.ts',
      'checksum/elfproef.ts',
    ]) {
      expect(files, `source list lacks ${expected}`).toContain(expected);
    }
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    expect(files.some((f) => f.startsWith('testing/'))).toBe(false);
  });

  test('no engine source file uses a banned API, dynamic import, import.meta or a non-relative import', () => {
    const findings: Finding[] = [];
    for (const file of files) {
      findings.push(...scanSource(readFileSync(new URL(file, SRC_DIR), 'utf8'), 'ts', file));
    }
    expect(findings, `findings:\n${describeFindings(findings)}`).toEqual([]);
  });
});

describe('scanner self-test', () => {
  const HOSTILE = [
    "import x from 'node:fs';",
    "export { y } from 'left-pad';",
    "fetch('https://example.invalid');",
    "new Function('return 1');",
    "const lazy = import('x');",
    "const g = globalThis['fe' + 'tch'];",
    "eval('1');",
    "require('fs');",
    "console.log('x');",
    'const now = Date.now();',
    'const r = Math.random();',
    'const u = import.meta.url;',
    "const s = 'XMLHttpRequest';",
    "'abc'.localeCompare('abd');",
    'const n: number = 1;',
  ].join('\n');

  const findings = scanSource(HOSTILE, 'ts', 'hostile.ts');
  const has = (rule: string, name?: string): boolean =>
    findings.some((f) => f.rule === rule && (name === undefined || f.name === name));

  test('reports every hostile form by rule and name', () => {
    expect(has('banned-identifier', 'fetch')).toBe(true);
    expect(has('banned-identifier', 'Function')).toBe(true);
    expect(has('dynamic-import')).toBe(true);
    expect(has('banned-identifier', 'globalThis')).toBe(true);
    expect(has('banned-identifier', 'eval')).toBe(true);
    expect(has('banned-identifier', 'require')).toBe(true);
    expect(has('banned-identifier', 'console')).toBe(true);
    expect(has('banned-identifier', 'Date')).toBe(true);
    expect(has('banned-identifier', 'localeCompare')).toBe(true);
    expect(has('random', 'Math.random')).toBe(true);
    expect(has('import-meta')).toBe(true);
    expect(has('banned-string', 'XMLHttpRequest')).toBe(true);
  });

  test('reports non-relative import and export sources', () => {
    expect(has('non-relative-import', 'node:fs')).toBe(true);
    expect(has('non-relative-import', 'left-pad')).toBe(true);
  });

  test('accepts relative imports and plain code, and sorts findings deterministically', () => {
    const clean = "import { a } from './a.ts';\nexport * from '../b.ts';\nconst c = a + 1;";
    expect(scanSource(clean, 'ts', 'clean.ts')).toEqual([]);
    const keys = findings.map((f) => `${f.file}\u0000${f.rule}\u0000${f.name}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('engine package manifest', () => {
  test('declares no runtime dependency of any kind', () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as Record<string, unknown>;
    for (const key of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundleDependencies',
      'bundledDependencies',
    ]) {
      const value = manifest[key];
      const entries = Array.isArray(value) ? value : Object.keys((value ?? {}) as object);
      expect(entries, `${key} must be empty`).toEqual([]);
    }
  });
});
