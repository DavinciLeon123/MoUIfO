import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_CONTRACT } from '@uio/engine';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { afterEach, describe, expect, test } from 'vitest';
import { renderArtefacts } from './build.ts';
import { cleanupBuildRoots, makeBuildRoot } from './testing.ts';

const CLI = fileURLToPath(new URL('./index.ts', import.meta.url));

afterEach(() => cleanupBuildRoots());

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function stems(directory: string): string[] {
  return readdirSync(join(REPO_ROOT, 'model', directory))
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .sort(compare);
}

function runCli(root: string, extra: string[] = []) {
  return spawnSync(process.execPath, ['--conditions=uio-source', CLI, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: undefined },
  });
}

describe('renderArtefacts', () => {
  test('renders the real model into one model.json output without a problem', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(result.problems).toEqual([]);
    const outputs = result.outputs.filter((output) => output.name === 'model.json');
    expect(outputs).toHaveLength(1);
    const text = outputs[0]?.text ?? '';
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    const model = JSON.parse(text);
    const rootVersion = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;
    expect(model.contract).toBe(MODEL_CONTRACT);
    expect(model.model_version).toBe(rootVersion);
    expect(Object.keys(model.schemes)).toEqual(stems('schemes'));
    expect(Object.keys(model)).toEqual([
      'authorities',
      'contract',
      'jurisdictions',
      'model_version',
      'schemes',
      'sources',
      'vocab',
    ]);
    expect(result.notes.join('\n')).toContain('build: model loaded (');
  });
});

describe('build CLI model.json', () => {
  test('writes dist/model.json and prints its path', () => {
    const root = makeBuildRoot();
    const result = runCli(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist/model.json');
    const model = JSON.parse(readFileSync(join(root, 'dist', 'model.json'), 'utf8'));
    expect(model.contract).toBe(MODEL_CONTRACT);
    expect(existsSync(join(root, 'dist', 'build-info.json'))).toBe(true);
  });

  test('a root package.json version that is not x.y.z exits 1 and writes no model.json', () => {
    const root = makeBuildRoot();
    const path = join(root, 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, `${JSON.stringify({ ...pkg, version: 'x' })}\n`);
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('package.json');
    expect(existsSync(join(root, 'dist', 'model.json'))).toBe(false);
  });

  test('a model with a problem exits 1 and writes nothing at all', () => {
    const root = makeBuildRoot();
    const path = join(root, 'model', 'schemes', 'eori.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^id: eori$/m, 'id: not-eori'));
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
});
