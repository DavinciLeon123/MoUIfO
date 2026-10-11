import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { CONFIG_KEYS, ConfigError, loadConfig, parseConfig, toAnnotation } from './index.ts';

const GOOD = [
  'namespace: "https://example.org/ns/"',
  'npm_scope: "@example-scope"',
  'pages_base_path: "/site/"',
  'repository: "owner/name"',
  '',
].join('\n');

type Key = (typeof CONFIG_KEYS)[number];

function withValue(key: Key, value: string): string {
  return GOOD.split('\n')
    .map((line) => (line.startsWith(`${key}:`) ? `${key}: ${value}` : line))
    .join('\n');
}

function without(key: Key): string {
  return GOOD.split('\n')
    .filter((line) => !line.startsWith(`${key}:`))
    .join('\n');
}

function message(text: string): string {
  try {
    parseConfig(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error('parseConfig did not throw');
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseConfig: accepted input', () => {
  test('returns the four keys, in order, frozen', () => {
    const cfg = parseConfig(GOOD);
    expect(cfg).toEqual({
      namespace: 'https://example.org/ns/',
      npm_scope: '@example-scope',
      pages_base_path: '/site/',
      repository: 'owner/name',
    });
    expect(Object.keys(cfg)).toEqual([...CONFIG_KEYS]);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  test('the real config.yaml parses and is frozen', () => {
    const cfg = loadConfig();
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.keys(cfg)).toEqual([...CONFIG_KEYS]);
  });
});

describe('parseConfig: YAML level', () => {
  test('an unquoted scope fails with a quoting hint', () => {
    const text = GOOD.replace('npm_scope: "@example-scope"', 'npm_scope: @example-scope');
    expect(message(text)).toContain('quote');
  });

  test('a duplicate key fails', () => {
    expect(() => parseConfig(`${GOOD}repository: "other/name"\n`)).toThrow(ConfigError);
  });

  test('an unknown key fails and is named', () => {
    expect(message(`${GOOD}extra: "x"\n`)).toContain('extra');
  });

  test('an empty file names all four keys', () => {
    const text = message('');
    for (const key of CONFIG_KEYS) expect(text).toContain(key);
  });

  test('a comment-only file names all four keys', () => {
    const text = message('# nothing here\n');
    for (const key of CONFIG_KEYS) expect(text).toContain(key);
  });

  test('a root that is not a map fails', () => {
    expect(() => parseConfig('- a\n- b\n')).toThrow(ConfigError);
  });

  test('a single missing key is named', () => {
    const text = message(without('repository'));
    expect(text).toContain('repository');
    expect(text).not.toContain('namespace');
  });

  test('the source name prefixes the error', () => {
    expect(() => parseConfig('', 'some/file.yaml')).toThrow(/^some\/file\.yaml: /);
  });
});

describe('parseConfig: value types', () => {
  test('a number is rejected and the key named', () => {
    expect(message(withValue('repository', '123'))).toContain('repository');
  });

  test('an empty string is rejected and the key named', () => {
    expect(message(withValue('npm_scope', '""'))).toContain('npm_scope');
  });

  test('null is rejected', () => {
    expect(message(withValue('pages_base_path', 'null'))).toContain('pages_base_path');
  });
});

describe('parseConfig: namespace shape', () => {
  test.each(['https://example.org/ns/', 'https://example.org/'])('passes %s', (value) => {
    expect(parseConfig(withValue('namespace', `"${value}"`)).namespace).toBe(value);
  });

  test.each([
    'https://example.org/ns',
    'http://example.org/ns/',
    'https://example.org/ns/?q=1',
    'https://example.org/ns/#x',
    'not a url/',
  ])('fails %s', (value) => {
    expect(message(withValue('namespace', `"${value}"`))).toContain('namespace');
  });
});

describe('parseConfig: npm_scope shape', () => {
  test.each(['@example-scope', '@a', '@a1-b2'])('passes %s', (value) => {
    expect(parseConfig(withValue('npm_scope', `"${value}"`)).npm_scope).toBe(value);
  });

  test.each(['@Example', 'example', '@example/', '@', '@-x'])('fails %s', (value) => {
    expect(message(withValue('npm_scope', `"${value}"`))).toContain('npm_scope');
  });
});

describe('parseConfig: pages_base_path shape', () => {
  test.each(['/', '/Site/', '/a/b/'])('passes %s', (value) => {
    expect(parseConfig(withValue('pages_base_path', `"${value}"`)).pages_base_path).toBe(value);
  });

  test.each(['Site/', '/Site', '//', '/a//b/'])('fails %s', (value) => {
    expect(message(withValue('pages_base_path', `"${value}"`))).toContain('pages_base_path');
  });
});

describe('parseConfig: repository shape', () => {
  test('passes owner/name', () => {
    expect(parseConfig(withValue('repository', '"owner/name"')).repository).toBe('owner/name');
  });

  test.each(['owner', 'owner/name/extra', '/name', 'owner/'])('fails %s', (value) => {
    expect(message(withValue('repository', `"${value}"`))).toContain('repository');
  });
});

describe('loadConfig', () => {
  test('reads <root>/config.yaml', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-config-'));
    temps.push(root);
    writeFileSync(join(root, 'config.yaml'), GOOD);
    expect(loadConfig(root).npm_scope).toBe('@example-scope');
  });

  test('a missing file names the path', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-config-'));
    temps.push(root);
    expect(() => loadConfig(root)).toThrow(join(root, 'config.yaml'));
  });
});

describe('toAnnotation', () => {
  test('formats file and line', () => {
    expect(toAnnotation({ file: 'a/b.ts', line: 3, message: 'bad' })).toBe(
      '::error file=a/b.ts,line=3::bad',
    );
  });

  test('omits the line when absent', () => {
    expect(toAnnotation({ file: 'a.json', message: 'bad' })).toBe('::error file=a.json::bad');
  });

  test('escapes properties and message', () => {
    const out = toAnnotation({ file: 'a:b,c%.ts', line: 1, message: '50%\r\nnext' });
    expect(out).toBe('::error file=a%3Ab%2Cc%25.ts,line=1::50%25%0D%0Anext');
  });
});
