import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createEngine } from '@uio/engine';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadModelFile } from './model-file.ts';
import { loadDistModel } from './testing/load-model.ts';

/**
 * Package shape and startup (D-04, D-05, DEC-008, MCP-01): the manifest, the build output the
 * globalSetup produced, the tarball file list, the refusal of a wrong model, and one run of the bin
 * from a copied packed layout through its shebang. Nothing here runs npm install or npx (T-06-20).
 */

const MCP_DIR = fileURLToPath(new URL('../', import.meta.url));
const MCP_DIST = join(MCP_DIR, 'dist');
const REPO_DIST_MODEL = join(REPO_ROOT, 'dist', 'model.json');
const SCOPE = loadConfig(REPO_ROOT).npm_scope;
const SPAWN_TIMEOUT = 60_000;

const pkg = JSON.parse(readFileSync(join(MCP_DIR, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'));

const temporaryDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uio-mcp-package-'));
  temporaryDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('loadModelFile', () => {
  const real = readFileSync(REPO_DIST_MODEL, 'utf8');

  function writeModel(dir: string, text: string): URL {
    const file = join(dir, 'model.json');
    writeFileSync(file, text);
    return pathToFileURL(file);
  }

  test('a copy of dist/model.json yields the same engine as the one over loadDistModel()', () => {
    const dir = makeTempDir();
    const loaded = loadModelFile(writeModel(dir, real));
    const direct = createEngine(loadDistModel());
    expect(loaded.engine.derive('NL001469630', 'eori')).toEqual(
      direct.derive('NL001469630', 'eori'),
    );
    expect(loaded.model.model_version).toBe(loadDistModel().model_version);
  });

  test('a missing file throws and creates no file', () => {
    const dir = makeTempDir();
    expect(() => loadModelFile(pathToFileURL(join(dir, 'model.json')))).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });

  test('a file that is not JSON throws', () => {
    const dir = makeTempDir();
    expect(() => loadModelFile(writeModel(dir, 'not json {'))).toThrow();
  });

  test('a model with contract 999 is refused', () => {
    const dir = makeTempDir();
    const model = JSON.parse(real);
    model.contract = 999;
    expect(() => loadModelFile(writeModel(dir, JSON.stringify(model)))).toThrow(/contract/);
  });

  test('a model whose compile fails (an invalid scheme pattern) is refused', () => {
    const dir = makeTempDir();
    const model = JSON.parse(real);
    const first = Object.keys(model.schemes).find((id) => model.schemes[id].format?.patterns?.[0]);
    expect(first).toBeDefined();
    model.schemes[first as string].format.patterns[0].regex = '([unclosed';
    expect(() => loadModelFile(writeModel(dir, JSON.stringify(model)))).toThrow();
    expect(readdirSync(dir)).toEqual(['model.json']);
  });
});

describe('package.json', () => {
  test('name, dependency, bin, engines, files, type, licence and build script (D-05, DEC-008)', () => {
    expect(pkg.name).toBe(`${SCOPE}/mcp-server`);
    expect(pkg.dependencies[`${SCOPE}/engine`]).toBe('*');
    expect(pkg.bin).toEqual({ 'mcp-server': 'dist/cli.js' });
    expect(pkg.engines.node).toBe('>=22.12');
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.type).toBe('module');
    expect(pkg.license).toBe('EUPL-1.2');
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.build.json && node copy-model.ts');
  });

  test('the lockfile records the same bin for the workspace', () => {
    expect(lock.packages['packages/mcp'].bin).toEqual(pkg.bin);
  });
});

describe('build output (after the globalSetup build)', () => {
  test('dist/cli.js starts with the shebang line', () => {
    const first = readFileSync(join(MCP_DIST, 'cli.js'), 'utf8').split('\n')[0];
    expect(first).toBe('#!/usr/bin/env node');
  });

  test('dist/model.json is byte-equal to dist/model.json of the repository and carries the package version (D-04)', () => {
    const copied = readFileSync(join(MCP_DIST, 'model.json'));
    expect(copied.equals(readFileSync(REPO_DIST_MODEL))).toBe(true);
    expect(JSON.parse(copied.toString('utf8')).model_version).toBe(pkg.version);
  });
});

type PackedFile = { path: string };

function packList(): string[] {
  const result = spawnSync(
    'npm',
    ['pack', '--dry-run', '--json', '--offline', '-w', 'packages/mcp'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed (${String(result.status)})\n${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { files: PackedFile[] }[];
  return (parsed[0]?.files ?? []).map((file) => file.path).sort();
}

describe('tarball file list', () => {
  const files = packList();

  test('holds the built code, the model and the manifest', () => {
    for (const expected of [
      'dist/cli.js',
      'dist/server.js',
      'dist/tools.js',
      'dist/schemas.js',
      'dist/model-file.js',
      'dist/model.json',
      'package.json',
    ]) {
      expect(files, `the pack list lacks ${expected}`).toContain(expected);
    }
  });

  test('holds no test, no testing helper, no copy script and no source file', () => {
    expect(files.filter((f) => f.includes('.test.'))).toEqual([]);
    expect(files.filter((f) => f.includes('testing/'))).toEqual([]);
    expect(files.filter((f) => f.includes('copy-model'))).toEqual([]);
    expect(files.filter((f) => f.startsWith('src/'))).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')(
  'installed layout (MCP-01, POSIX: npm uses shebangs)',
  () => {
    let layout = '';

    beforeAll(() => {
      layout = makeTempDir();
      for (const file of packList()) {
        const target = join(layout, file);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(MCP_DIR, file), target);
      }
      // The packed layout resolves its dependencies through the repository's node_modules.
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(layout, 'node_modules'), 'dir');
      // npm packs every file as 0644 and its install makes the bin target executable; do the same.
      const copied = JSON.parse(readFileSync(join(layout, 'package.json'), 'utf8'));
      for (const target of Object.values(copied.bin as Record<string, string>)) {
        chmodSync(join(layout, target), 0o755);
      }
    });

    test(
      'the bin target, started through its shebang, serves uio_derive like the engine',
      async () => {
        const copied = JSON.parse(readFileSync(join(layout, 'package.json'), 'utf8'));
        const bin = join(layout, copied.bin['mcp-server'] as string);
        expect(existsSync(bin)).toBe(true);
        const transport = new StdioClientTransport({
          command: bin,
          args: [],
          stderr: 'pipe',
          env: {
            ...getDefaultEnvironment(),
            PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
          },
        });
        let stderr = '';
        transport.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        const client = new Client({ name: 'uio-mcp-test', version: '0.0.0' });
        try {
          await client.connect(transport);
          const { tools } = await client.listTools();
          expect(tools.map((t) => t.name)).toContain('uio_derive');
          const reply = await client.callTool({
            name: 'uio_derive',
            arguments: { value: 'NL001469630', scheme: 'eori' },
          });
          expect(reply.isError).toBeFalsy();
          expect(reply.structuredContent).toEqual(
            createEngine(loadDistModel()).derive('NL001469630', 'eori'),
          );
          expect(stderr).toBe('');
        } finally {
          await client.close();
        }
      },
      SPAWN_TIMEOUT,
    );
  },
);

describe('startup failure (T-06-07)', () => {
  test(
    'without a usable model.json next to cli.js the server writes one static line to stderr and exits 1',
    () => {
      const layout = makeTempDir();
      mkdirSync(join(layout, 'dist'));
      for (const name of readdirSync(MCP_DIST)) {
        if (name.endsWith('.js') && !name.endsWith('.test.js')) {
          copyFileSync(join(MCP_DIST, name), join(layout, 'dist', name));
        }
      }
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(layout, 'node_modules'), 'dir');
      const result = spawnSync(process.execPath, [join(layout, 'dist', 'cli.js')], {
        cwd: layout,
        encoding: 'utf8',
        input: '',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain('model.json is missing or unusable');
      expect(result.stderr).not.toContain(layout);
    },
    SPAWN_TIMEOUT,
  );
});
