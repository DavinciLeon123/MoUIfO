import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { Problem } from './index.ts';
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

  test('rewrites own import and export specifiers in packages/*/src and tools/*/src', () => {
    const root = makeRoot('@other');
    write(
      root,
      'tools/x/src/a.ts',
      "import { a } from '@example-scope/engine';\nexport const b = a;\n",
    );
    write(
      root,
      'packages/mcp/src/b.ts',
      'export * from "@example-scope/engine";\nconst m = await import(\'@example-scope/web\');\n',
    );
    write(root, 'tools/x/src/third.ts', "import { v } from '@vendor/engine';\n");
    const changed = syncPackageNames(loadConfig(root), root);
    expect(changed).toEqual([
      'packages/engine/package.json',
      'packages/mcp/package.json',
      'packages/mcp/src/b.ts',
      'packages/web/package.json',
      'tools/x/src/a.ts',
    ]);
    expect(readFileSync(join(root, 'tools/x/src/a.ts'), 'utf8')).toContain("from '@other/engine'");
    expect(readFileSync(join(root, 'packages/mcp/src/b.ts'), 'utf8')).toBe(
      'export * from "@other/engine";\nconst m = await import(\'@other/web\');\n',
    );
    expect(readFileSync(join(root, 'tools/x/src/third.ts'), 'utf8')).toContain("'@vendor/engine'");
    expect(syncPackageNames(loadConfig(root), root)).toEqual([]);
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
    write(root, 'tools/z/src/a.ts', '// @example-scope/engine\nconst y = 2;\n');
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

  describe('own package-name specifiers (DEC-010)', () => {
    const scan = (content: string, file = 'tools/q/src/s.ts'): Problem[] => {
      const root = mkdtempSync(join(tmpdir(), 'uio-specifiers-'));
      temps.push(root);
      write(root, file, content);
      return findConfigLiterals(cfg, root, [file]);
    };

    test.for([
      "import { a } from '@example-scope/engine';\n",
      "export * from '@example-scope/engine';\n",
      'export { b } from "@example-scope/mcp-server";\n',
      "const m = await import('@example-scope/web');\n",
      "import '@example-scope/engine';\n",
    ])('an import or export specifier is not reported: %s', (line) => {
      expect(scan(line)).toEqual([]);
    });

    test.for([
      ['a comment', '// @example-scope/engine\n'],
      ['a sub-path', "import { a } from '@example-scope/engine/sub';\n"],
      ['a plain string', "const s = '@example-scope/engine';\n"],
      [
        'the namespace',
        "import { a } from '@example-scope/engine'; const n = 'https://example.org/ns';\n",
      ],
      [
        'a second scope literal on the line',
        "import { a } from '@example-scope/engine'; // @example-scope/x\n",
      ],
    ])('%s is still reported', ([, content]) => {
      expect(scan(content as string)).toHaveLength(1);
    });

    test('a JSON file containing a package name is still reported', () => {
      expect(scan('{"x":"@example-scope/engine"}\n', 'tools/q/data.json')).toHaveLength(1);
    });

    test('a specifier in a non-ts file is still reported', () => {
      expect(scan("import { a } from '@example-scope/engine';\n", 'tools/q/src/s.js')).toHaveLength(
        1,
      );
    });
  });

  test('the real repo contains no hard-coded namespace or scope literal', () => {
    expect(findConfigLiterals(loadConfig())).toEqual([]);
  });
});
