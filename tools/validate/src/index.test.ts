import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { runValidation } from './index.ts';

vi.setConfig({ testTimeout: 60_000 });

const CLI = fileURLToPath(new URL('./index.ts', import.meta.url));

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

/** A git-initialised copy of every tracked and untracked-but-not-ignored file of the repository. */
function copyOfRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-cli-'));
  scratch.push(root);
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO_ROOT,
      env: cleanEnv(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  for (const rel of listed.split('\0').filter((entry) => entry !== '')) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REPO_ROOT, rel), join(root, rel));
  }
  execFileSync('git', ['init', '-q'], { cwd: root, env: cleanEnv() });
  return root;
}

function runCli(root?: string): { status: number | null; stdout: string } {
  const args = ['--conditions=uio-source', CLI, ...(root === undefined ? [] : ['--root', root])];
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    env: cleanEnv(),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

describe('runValidation', () => {
  test('returns no problems on the real repository', () => {
    expect(runValidation(REPO_ROOT)).toEqual([]);
  });
});

describe('validate CLI', () => {
  test('exits 0 and prints the passed summary on the real repository', () => {
    const { status, stdout } = runCli();
    expect(status).toBe(0);
    expect(stdout).toContain('validate: repository rules passed (9 rules)');
  });

  test('a copy of the repository passes too', () => {
    const { status, stdout } = runCli(copyOfRepo());
    expect(stdout).toContain('validate: repository rules passed (9 rules)');
    expect(status).toBe(0);
  });

  test('exits 1 and prints a GitHub error annotation when DECISIONS.md is broken', () => {
    const root = copyOfRepo();
    const path = join(root, 'DECISIONS.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('| id | date |', '| identifier | date |'),
    );
    const { status, stdout } = runCli(root);
    expect(status).toBe(1);
    expect(stdout).toContain('::error file=DECISIONS.md');
    expect(stdout).toMatch(/validate: \d+ problems/);
  });

  test('a broken config.yaml becomes one problem for config.yaml', () => {
    const root = copyOfRepo();
    writeFileSync(join(root, 'config.yaml'), 'namespace: nope\n');
    const problems = runValidation(root);
    expect(problems.some((p) => p.file === 'config.yaml')).toBe(true);
  });
});
