import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig } from 'uio-config';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildDist } from './index.ts';
import { cleanupBuildRoots, makeBuildRoot } from './testing.ts';

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
// Each test here renders or spawns the whole build (six outputs plus the BLD-06 proof); under a
// loaded full-suite run the 5 s default is too tight.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  cleanupBuildRoots();
});

function runCli(root: string, extra: string[] = []) {
  return spawnSync(process.execPath, ['--conditions=uio-source', CLI, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: undefined },
  });
}

function count(root: string, directory: string): number {
  return readdirSync(join(root, 'model', directory)).filter((name) => name.endsWith('.yaml'))
    .length;
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

  test('an explicit output directory receives the file', () => {
    const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
    temps.push(root);
    const out = join(root, 'elsewhere');
    expect(buildDist(root, cfg, out)).toBe(join(out, 'build-info.json'));
  });
});

describe('build CLI', () => {
  test('exits 1 and prints annotations when package names drift from config.yaml', () => {
    const root = makeBuildRoot({ configScope: '@other' });
    const result = spawnSync(process.execPath, ['--conditions=uio-source', CLI, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true' },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error file=packages/engine/package.json');
  });

  test('exits 0, prints the model counts and writes dist/build-info.json', () => {
    const root = makeBuildRoot();
    const result = runCli(root);
    expect(result.status).toBe(0);
    const counts = [
      `${count(root, 'schemes')} schemes`,
      `${count(root, 'authorities')} authorities`,
      `${count(root, 'jurisdictions')} jurisdictions`,
      `${count(root, 'sources')} sources`,
      `${count(root, 'vocab')} vocabularies`,
    ].join(', ');
    expect(result.stdout).toContain(`build: model loaded (${counts})`);
    expect(result.stdout).toContain('dist/build-info.json');
    expect(JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8')).npm_scope).toBe(
      JSON.parse(readFileSync(join(root, 'packages', 'engine', 'package.json'), 'utf8')).name.split(
        '/',
      )[0],
    );
  });

  test('refuses a model with problems, names the file and writes no dist directory', () => {
    const root = makeBuildRoot();
    const path = join(root, 'model', 'schemes', 'eori.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^id: eori$/m, 'id: not-eori'));
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('model/schemes/eori.yaml');
    expect(result.stdout).toMatch(/build: the model has \d+ problems; run npm run validate/);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('--out writes build-info.json into that directory', () => {
    const root = makeBuildRoot();
    const out = join(root, 'custom-out');
    const result = runCli(root, ['--out', out]);
    expect(result.status).toBe(0);
    expect(existsSync(join(out, 'build-info.json'))).toBe(true);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
});

describe('build CLI targets (D-12)', () => {
  test('the default dist target writes nothing under docs/', () => {
    const root = makeBuildRoot();
    const before = readFileSync(join(root, 'docs', 'gaps.md'), 'utf8');
    const result = runCli(root);
    expect(result.status).toBe(0);
    expect(readdirSync(join(root, 'docs'))).toEqual(['gaps.md']);
    expect(readFileSync(join(root, 'docs', 'gaps.md'), 'utf8')).toBe(before);
  });

  test('--target dist behaves like the default and never writes docs/model.md', () => {
    const root = makeBuildRoot();
    const result = runCli(root, ['--target', 'dist']);
    expect(result.status).toBe(0);
    expect(existsSync(join(root, 'docs', 'model.md'))).toBe(false);
    expect(existsSync(join(root, 'dist', 'model.json'))).toBe(true);
  });

  test('--target docs --docs-out writes that file and nothing under --out', () => {
    const root = makeBuildRoot();
    const out = join(root, 'custom-out');
    const docsOut = join(root, 'elsewhere', 'model.md');
    const result = runCli(root, ['--target', 'docs', '--out', out, '--docs-out', docsOut]);
    expect(result.status).toBe(0);
    expect(readFileSync(docsOut, 'utf8').startsWith('# Model documentation\n')).toBe(true);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('--target docs writes docs/model.md under the root by default', () => {
    const root = makeBuildRoot();
    const result = runCli(root, ['--target', 'docs']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('docs/model.md');
    expect(existsSync(join(root, 'docs', 'model.md'))).toBe(true);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('--target all writes the dist files, build-info.json and docs/model.md', () => {
    const root = makeBuildRoot();
    const result = runCli(root, ['--target', 'all']);
    expect(result.status).toBe(0);
    expect(existsSync(join(root, 'dist', 'model.json'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'build-info.json'))).toBe(true);
    expect(existsSync(join(root, 'docs', 'model.md'))).toBe(true);
  });

  test('an unknown --target is a usage problem and exits 1', () => {
    const root = makeBuildRoot();
    const result = runCli(root, ['--target', 'everything']);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('--target');
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(existsSync(join(root, 'docs', 'model.md'))).toBe(false);
  });

  test('--target docs reports a missing docs/gaps.md as a problem and writes nothing', () => {
    const root = makeBuildRoot();
    rmSync(join(root, 'docs', 'gaps.md'));
    const result = runCli(root, ['--target', 'docs']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('docs/gaps.md');
    expect(existsSync(join(root, 'docs', 'model.md'))).toBe(false);
  });
});
