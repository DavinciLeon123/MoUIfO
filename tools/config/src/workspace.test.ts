import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  checkPackageNames,
  findConfigLiterals,
  listWorkspaceManifests,
  loadConfig,
  PACKAGE_SUFFIX,
  parseConfig,
  syncPackageNames,
} from './index.ts';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, content: string | Buffer): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function manifest(fields: Record<string, unknown>): string {
  return `${JSON.stringify({ version: '0.0.0', type: 'module', ...fields }, null, 2)}\n`;
}

/** A synthetic workspace whose package names use `@example-scope`. */
function makeRoot(configScope: string): string {
  const root = mkdtempSync(join(tmpdir(), 'uio-workspace-'));
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
  write(
    root,
    'package.json',
    manifest({ name: 'root', private: true, workspaces: ['packages/*', 'tools/*'] }),
  );
  write(root, 'packages/engine/package.json', manifest({ name: '@example-scope/engine' }));
  write(
    root,
    'packages/mcp/package.json',
    manifest({
      name: '@example-scope/mcp-server',
      dependencies: { '@example-scope/engine': '*' },
    }),
  );
  write(
    root,
    'packages/web/package.json',
    manifest({
      name: '@example-scope/web',
      private: true,
      dependencies: { '@vendor/web': '1.0.0' },
    }),
  );
  mkdirSync(join(root, 'tools/empty'), { recursive: true });
  return root;
}

describe('PACKAGE_SUFFIX / listWorkspaceManifests', () => {
  test('maps the three published directories to their suffixes', () => {
    expect(PACKAGE_SUFFIX).toEqual({
      'packages/engine': 'engine',
      'packages/mcp': 'mcp-server',
      'packages/web': 'web',
    });
  });

  test('expands dir/* globs one level, keeps only dirs with a package.json, sorted', () => {
    expect(listWorkspaceManifests(makeRoot('@other'))).toEqual([
      'packages/engine/package.json',
      'packages/mcp/package.json',
      'packages/web/package.json',
    ]);
  });

  test('the real repo lists its tool and package manifests', () => {
    const list = listWorkspaceManifests();
    expect(list).toContain('packages/engine/package.json');
    expect(list).toContain('tools/config/package.json');
    expect([...list].sort()).toEqual(list);
  });
});

describe('checkPackageNames', () => {
  test('the real repo is consistent with config.yaml', () => {
    expect(checkPackageNames(loadConfig())).toEqual([]);
  });

  test('a matching synthetic root has no problems', () => {
    const root = makeRoot('@example-scope');
    expect(checkPackageNames(loadConfig(root), root)).toEqual([]);
  });

  test('reports the three names and the dependency key, sorted by file then message', () => {
    const root = makeRoot('@other');
    const problems = checkPackageNames(loadConfig(root), root);
    expect(problems).toHaveLength(4);
    expect(problems.map((p) => p.file)).toEqual([
      'packages/engine/package.json',
      'packages/mcp/package.json',
      'packages/mcp/package.json',
      'packages/web/package.json',
    ]);
    const mcpMessages = problems
      .filter((p) => p.file === 'packages/mcp/package.json')
      .map((p) => p.message);
    expect([...mcpMessages].sort()).toEqual(mcpMessages);
    expect(problems[0]?.message).toContain('@other/engine');
    expect(problems[0]?.message).toContain('@example-scope/engine');
  });

  test('a third-party scope with an own suffix is not reported', () => {
    const root = makeRoot('@other');
    const problems = checkPackageNames(loadConfig(root), root);
    expect(problems.some((p) => p.message.includes('@vendor/web'))).toBe(false);
  });

  test('a missing package manifest is reported', () => {
    const root = makeRoot('@example-scope');
    rmSync(join(root, 'packages/web/package.json'));
    const problems = checkPackageNames(loadConfig(root), root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('packages/web/package.json');
  });
});

describe('syncPackageNames', () => {
  test('rewrites names and own dependency keys, returns the changed files sorted', () => {
    const root = makeRoot('@other');
    const before = Object.fromEntries(
      listWorkspaceManifests(root).map((f) => [f, readFileSync(join(root, f), 'utf8')]),
    );
    const changed = syncPackageNames(loadConfig(root), root);
    expect(changed).toEqual([
      'packages/engine/package.json',
      'packages/mcp/package.json',
      'packages/web/package.json',
    ]);
    for (const file of changed) {
      const after = readFileSync(join(root, file), 'utf8');
      expect(after).toBe((before[file] ?? '').replaceAll('@example-scope/', '@other/'));
    }
    expect(checkPackageNames(loadConfig(root), root)).toEqual([]);
  });

  test('a second run changes nothing', () => {
    const root = makeRoot('@other');
    syncPackageNames(loadConfig(root), root);
    expect(syncPackageNames(loadConfig(root), root)).toEqual([]);
  });

  test('leaves third-party dependency keys alone', () => {
    const root = makeRoot('@other');
    syncPackageNames(loadConfig(root), root);
    const web = JSON.parse(readFileSync(join(root, 'packages/web/package.json'), 'utf8'));
    expect(web.dependencies).toEqual({ '@vendor/web': '1.0.0' });
  });

  test('returns an empty list when nothing needs to change', () => {
    const root = makeRoot('@example-scope');
    expect(syncPackageNames(loadConfig(root), root)).toEqual([]);
  });

  test('the real repo needs no changes', () => {
    expect(syncPackageNames(loadConfig())).toEqual([]);
  });
});

describe('findConfigLiterals', () => {
  const cfg = parseConfig(
    [
      'namespace: "https://example.org/ns/"',
      'npm_scope: "@example-scope"',
      'pages_base_path: "/site/"',
      'repository: "owner/name"',
    ].join('\n'),
  );

  function literalRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'uio-literals-'));
    temps.push(root);
    write(root, 'tools/z/src/b.ts', "const a = 1;\nconst ns = 'https://example.org/ns';\n");
    write(root, 'tools/z/src/a.ts', "import x from '@example-scope/engine';\nconst y = 2;\n");
    write(root, 'tools/z/package.json', '{"name":"@example-scope/z"}\n');
    write(root, 'package-lock.json', '{"@example-scope/engine":{}}\n');
    write(root, 'tools/z/blob.bin', Buffer.from('@example-scope/engine\0binary'));
    write(root, 'packages/p/src/clean.ts', 'export const ok = true;\n');
    return root;
  }

  test('reports file:line for both needles, sorted by file then line', () => {
    const root = literalRoot();
    const files = [
      'tools/z/src/b.ts',
      'tools/z/src/a.ts',
      'tools/z/package.json',
      'package-lock.json',
      'tools/z/blob.bin',
      'packages/p/src/clean.ts',
    ];
    const problems = findConfigLiterals(cfg, root, files);
    expect(problems.map((p) => [p.file, p.line])).toEqual([
      ['tools/z/src/a.ts', 1],
      ['tools/z/src/b.ts', 2],
    ]);
    expect(problems[0]?.message).toContain('loadConfig()');
  });

  test('sorts multiple hits in one file by line', () => {
    const root = literalRoot();
    write(root, 'tools/m.ts', '@example-scope/x\nok\nhttps://example.org/ns/foo\n');
    const problems = findConfigLiterals(cfg, root, ['tools/m.ts']);
    expect(problems.map((p) => p.line)).toEqual([1, 3]);
  });

  test('ignores files outside tools/, packages/, .github/ and root ts/json', () => {
    const root = literalRoot();
    write(root, 'docs/notes.md', '@example-scope/engine\n');
    write(root, 'root.ts', '@example-scope/engine\n');
    write(root, 'README.md', '@example-scope/engine\n');
    write(root, '.github/workflows/ci.yml', 'run: @example-scope/engine\n');
    write(root, 'tools/node_modules/dep/index.js', '@example-scope/engine\n');
    const problems = findConfigLiterals(cfg, root, [
      'docs/notes.md',
      'root.ts',
      'README.md',
      '.github/workflows/ci.yml',
      'tools/node_modules/dep/index.js',
    ]);
    expect(problems.map((p) => p.file)).toEqual(['.github/workflows/ci.yml', 'root.ts']);
  });

  test('an empty file list returns []', () => {
    expect(findConfigLiterals(cfg, literalRoot(), [])).toEqual([]);
  });

  test('a listed file that no longer exists is skipped', () => {
    expect(findConfigLiterals(cfg, literalRoot(), ['tools/gone.ts'])).toEqual([]);
  });

  test('the real repo contains no hard-coded namespace or scope literal', () => {
    expect(findConfigLiterals(loadConfig())).toEqual([]);
  });
});
