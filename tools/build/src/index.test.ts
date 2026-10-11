import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig } from 'uio-config';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDist } from './index.ts';

const CLI = fileURLToPath(new URL('./index.ts', import.meta.url));
const cfg = parseConfig(
  [
    'namespace: "https://example.org/ns/"',
    'npm_scope: "@example-scope"',
    'pages_base_path: "/site/"',
    'repository: "owner/name"',
  ].join('\n'),
);

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** A synthetic root whose config scope is `configScope` and whose packages use `@example-scope`. */
function makeRoot(configScope: string): string {
  const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
  temps.push(root);
  write(
    root,
    'config.yaml',
    [
      'namespace: "https://example.org/ns/"',
      `npm_scope: "${configScope}"`,
      'pages_base_path: "/site/"',
      'repository: "owner/name"',
      '',
    ].join('\n'),
  );
  write(root, 'package.json', `${JSON.stringify({ name: 'root', workspaces: ['packages/*'] })}\n`);
  for (const [dir, suffix] of [
    ['engine', 'engine'],
    ['mcp', 'mcp-server'],
    ['web', 'web'],
  ] as const) {
    write(
      root,
      `packages/${dir}/package.json`,
      `${JSON.stringify({ name: `@example-scope/${suffix}`, version: '0.0.0' }, null, 2)}\n`,
    );
  }
  return root;
}

function runCli(root: string) {
  return spawnSync(process.execPath, ['--conditions=uio-source', CLI, '--root', root], {
    encoding: 'utf8',
  });
}

describe('buildDist', () => {
  test('writes dist/build-info.json with the configured namespace and scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
    temps.push(root);
    const path = buildDist(root, cfg);
    expect(path).toBe(join(root, 'dist', 'build-info.json'));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      generator: 'uio-build',
      namespace: cfg.namespace,
      npm_scope: cfg.npm_scope,
    });
  });

  test('two runs are byte-identical, end in one LF and keep a fixed key order', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
    temps.push(root);
    const first = readFileSync(buildDist(root, cfg), 'utf8');
    const second = readFileSync(buildDist(root, cfg), 'utf8');
    expect(second).toBe(first);
    expect(first.endsWith('}\n')).toBe(true);
    expect(first.endsWith('\n\n')).toBe(false);
    expect(Object.keys(JSON.parse(first))).toEqual(['generator', 'namespace', 'npm_scope']);
  });
});

describe('build CLI', () => {
  test('exits 1 and prints annotations when package names drift from config.yaml', () => {
    const root = makeRoot('@other');
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error file=packages/engine/package.json');
  });

  test('exits 0 and writes dist/build-info.json when everything matches', () => {
    const root = makeRoot('@example-scope');
    const result = runCli(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist/build-info.json');
    expect(JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8')).npm_scope).toBe(
      '@example-scope',
    );
  });
});
