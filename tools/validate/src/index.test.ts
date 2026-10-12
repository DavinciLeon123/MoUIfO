import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { parse, stringify } from 'yaml';
import { RULE_COUNT, report, runValidation } from './index.ts';
import { EXPECTED_RUN_STEPS } from './workflow-rules.ts';

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

/**
 * Run the validate CLI. `env` overrides the clean environment; an `undefined` value deletes the
 * key (the GitHub runner sets GITHUB_ACTIONS=true while `npm test` runs there too).
 */
function runCli(
  root?: string,
  env: Record<string, string | undefined> = {},
): { status: number | null; stdout: string } {
  const args = ['--conditions=uio-source', CLI, ...(root === undefined ? [] : ['--root', root])];
  const childEnv = cleanEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

describe('runValidation', () => {
  test('returns no problems on the real repository', () => {
    expect(runValidation(REPO_ROOT)).toEqual([]);
  });
});

describe('report', () => {
  const passed = `validate: repository rules passed (${RULE_COUNT} rules)`;
  const plain = { github: false };

  test('no problems gives exactly the passed summary and exit code 0', () => {
    expect(report([], plain)).toEqual({ lines: [passed], exitCode: 0 });
  });

  test('a warning alone exits 0 and counts the warning after the passed summary', () => {
    const warning = { file: 'a.yaml', line: 2, severity: 'warning', message: 'soft' } as const;
    expect(report([warning], plain)).toEqual({
      lines: ['a.yaml:2 warning: soft', passed, 'validate: 1 warnings'],
      exitCode: 0,
    });
  });

  test('an error plus a warning exits 1 and counts both', () => {
    const error = { file: 'a.yaml', line: 1, column: 4, message: 'hard' } as const;
    const warning = { file: 'b.yaml', severity: 'warning', message: 'soft' } as const;
    expect(report([error, warning], plain)).toEqual({
      lines: ['a.yaml:1:4 hard', 'b.yaml warning: soft', 'validate: 1 problems, 1 warnings'],
      exitCode: 1,
    });
  });

  test('two errors exit 1 and keep the input order', () => {
    const second = { file: 'z.yaml', message: 'two' } as const;
    const first = { file: 'a.yaml', message: 'one' } as const;
    expect(report([second, first], plain)).toEqual({
      lines: ['z.yaml two', 'a.yaml one', 'validate: 2 problems'],
      exitCode: 1,
    });
  });

  test('github mode renders every problem as an annotation without changing the exit code', () => {
    const error = { file: 'a.yaml', line: 1, column: 4, message: 'hard' } as const;
    const warning = { file: 'b.yaml', severity: 'warning', message: 'soft' } as const;
    expect(report([error, warning], { github: true })).toEqual({
      lines: [
        '::error file=a.yaml,line=1,col=4::hard',
        '::warning file=b.yaml::soft',
        'validate: 1 problems, 1 warnings',
      ],
      exitCode: 1,
    });
  });
});

describe('validate CLI', () => {
  test('exits 0 and prints the passed summary on the real repository, plain mode', () => {
    const { status, stdout } = runCli(undefined, { GITHUB_ACTIONS: undefined });
    expect(status).toBe(0);
    expect(stdout).toContain('validate: repository rules passed (10 rules)');
    expect(stdout).not.toMatch(/^::/m);
  });

  test('exits 0 and prints the passed summary on the real repository, annotation mode', () => {
    const { status, stdout } = runCli(undefined, { GITHUB_ACTIONS: 'true' });
    expect(status).toBe(0);
    expect(stdout).toContain('validate: repository rules passed (10 rules)');
  });

  test('a copy of the repository passes too', () => {
    const { status, stdout } = runCli(copyOfRepo());
    expect(stdout).toContain('validate: repository rules passed (10 rules)');
    expect(status).toBe(0);
  });

  test('exits 1 and prints a GitHub error annotation when DECISIONS.md is broken', () => {
    const root = copyOfRepo();
    const path = join(root, 'DECISIONS.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('| id | date |', '| identifier | date |'),
    );
    const { status, stdout } = runCli(root, { GITHUB_ACTIONS: 'true' });
    expect(status).toBe(1);
    expect(stdout).toContain('::error file=DECISIONS.md');
    expect(stdout).toMatch(/validate: \d+ problems/);
  });

  test('prints plain path lines locally, with the same exit code and problem count as CI mode', () => {
    const root = copyOfRepo();
    const path = join(root, 'DECISIONS.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('| id | date |', '| identifier | date |'),
    );
    const annotated = runCli(root, { GITHUB_ACTIONS: 'true' });
    const plain = runCli(root, { GITHUB_ACTIONS: undefined });
    expect(plain.status).toBe(1);
    expect(plain.stdout.split('\n').some((line) => line.startsWith('DECISIONS.md'))).toBe(true);
    expect(plain.stdout).not.toContain('::error');
    expect(plain.status).toBe(annotated.status);
    const problemLines = (out: string): number =>
      out.split('\n').filter((line) => line !== '' && !line.startsWith('validate:')).length;
    expect(problemLines(plain.stdout)).toBe(problemLines(annotated.stdout));
    expect(problemLines(plain.stdout)).toBeGreaterThan(0);
  });

  describe('a certainty vocabulary with an unknown key', () => {
    function brokenCopy(): string {
      const root = copyOfRepo();
      const path = join(root, 'model/vocab/certainty.yaml');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace('rank: 3\n', 'rank: 3\n    rnak: 1\n'),
      );
      return root;
    }

    test('CI mode prints a GitHub annotation with file, line and column', () => {
      const { status, stdout } = runCli(brokenCopy(), { GITHUB_ACTIONS: 'true' });
      expect(status).toBe(1);
      expect(stdout).toContain('::error file=model/vocab/certainty.yaml,line=');
      expect(stdout).toContain(',col=');
    });

    test('plain mode prints path:line:col and no annotation', () => {
      const { status, stdout } = runCli(brokenCopy(), { GITHUB_ACTIONS: undefined });
      expect(status).toBe(1);
      expect(stdout).toMatch(/^model\/vocab\/certainty\.yaml:\d+:\d+ /m);
      expect(stdout).not.toContain('::error');
    });
  });

  test('exits 1 when ci.yml merges every run step into one run: |- step (CR-01, verifier reproduction)', () => {
    const root = copyOfRepo();
    const path = join(root, '.github/workflows/ci.yml');
    // An expression opener, spelled out so the source holds no literal placeholder.
    const sha = `${'$' + '{{'} github.sha }}`;
    // biome-ignore lint/suspicious/noExplicitAny: the test rewrites arbitrary parsed YAML
    const doc = parse(readFileSync(path, 'utf8'), { schema: 'core' }) as any;
    doc.jobs.ci.steps = [
      ...doc.jobs.ci.steps.slice(0, 2),
      {
        name: 'All',
        env: { ALLOWLIST_REF: sha, BASE_SHA: sha, HEAD_SHA: sha },
        run: EXPECTED_RUN_STEPS.join('\n'),
      },
    ];
    const written = stringify(doc, { schema: 'core', blockQuote: 'literal' });
    expect(written).toContain('run: |-');
    writeFileSync(path, written);
    const { status, stdout } = runCli(root, { GITHUB_ACTIONS: 'true' });
    expect(status).toBe(1);
    expect(stdout).toContain('::error file=.github/workflows/ci.yml::run steps must be, in order');
    expect(stdout).toContain('the tree guard step is missing');
    expect(stdout).toContain('the PR-commit guard step is missing');
  });

  test('a broken config.yaml becomes one problem for config.yaml', () => {
    const root = copyOfRepo();
    writeFileSync(join(root, 'config.yaml'), 'namespace: nope\n');
    const problems = runValidation(root);
    expect(problems.some((p) => p.file === 'config.yaml')).toBe(true);
  });
});
