import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { escapeData, escapeProperty } from './personal-numbers.ts';
import { firstSyntheticValid } from './testing.ts';

vi.setConfig({ testTimeout: 30_000 });

const CLI = fileURLToPath(new URL('./personal-numbers.ts', import.meta.url));
const v = firstSyntheticValid();
const masked = `******${v.slice(6)}`;

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

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=guard-test', '-c', 'user.email=guard-test@example.invalid', ...args],
    { cwd, env: cleanEnv(), encoding: 'utf8' },
  );
}

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guard-test-'));
  scratch.push(dir);
  return dir;
}

type Files = Record<string, string | Buffer>;

function write(dir: string, files: Files): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

/** A throwaway git repo; `committed` files are committed, `extra` files stay untracked. */
function makeRepo(committed: Files, extra: Files = {}): string {
  const dir = makeDir();
  git(dir, 'init', '-q');
  write(dir, committed);
  git(dir, 'add', '-A');
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'base');
  write(dir, extra);
  return dir;
}

function guard(cwd: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...cleanEnv(), GIT_CEILING_DIRECTORIES: dirname(cwd) },
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, all: `${r.stdout}${r.stderr}` };
}

describe('escaping', () => {
  test('escapeProperty escapes %, CR, LF, colon and comma', () => {
    expect(escapeProperty('a%b:c,d\r\ne')).toBe('a%25b%3Ac%2Cd%0D%0Ae');
  });
  test('escapeData escapes %, CR and LF only', () => {
    expect(escapeData('a%b:c,d\r\ne')).toBe('a%25b:c,d%0D%0Ae');
  });
});

describe('tree mode', () => {
  test('a committed value fails with a masked annotation and never leaks the value', () => {
    const repo = makeRepo({ 'notes.txt': `intro\nx ${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('::error file=notes.txt,line=2,col=3,title=personal-number guard::');
    expect(r.stdout).toContain(masked);
    expect(r.all).not.toContain(v);
    expect(r.stdout).toMatch(/personal-number guard: scanned 1 files, 1 findings/);
  });

  test('a value only in an untracked, non-ignored file also fails', () => {
    const repo = makeRepo({ 'ok.txt': 'fine\n' }, { 'new.txt': `${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('file=new.txt');
    expect(r.all).not.toContain(v);
  });

  test('a value only in a gitignored file passes', () => {
    const repo = makeRepo({ '.gitignore': 'secret.txt\n' }, { 'secret.txt': `${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/scanned 1 files, 0 findings/);
  });

  test('binary files are skipped; node_modules and package-lock.json paths are scanned', () => {
    const repo = makeRepo({
      'blob.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`${v}\n`)]),
      'package-lock.json': `${v}\n`,
      'sub/package-lock.json': `${v}\n`,
      'node_modules/pkg/index.js': `${v}\n`,
      'readme.txt': 'clean\n',
    });
    const r = guard(repo);
    expect(r.code).toBe(1);
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('::error'));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('file=node_modules/pkg/index.js,');
    expect(lines[1]).toContain('file=package-lock.json,');
    expect(lines[2]).toContain('file=sub/package-lock.json,');
    expect(r.stdout).toContain(masked);
    expect(r.stdout).toMatch(/scanned 4 files, 3 findings/);
    expect(r.all).not.toContain(v);
  });

  test('a committed file below a node_modules segment at any depth is a finding', () => {
    const repo = makeRepo({ 'docs/node_modules/x.txt': `id ${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      '::error file=docs/node_modules/x.txt,line=1,col=4,title=personal-number guard::',
    );
    expect(r.stdout).toContain(masked);
    expect(r.stdout).toMatch(/scanned 1 files, 1 findings/);
    expect(r.all).not.toContain(v);
  });

  test('an untracked, non-ignored file below a node_modules segment is a finding', () => {
    const repo = makeRepo({ 'ok.txt': 'fine\n' }, { 'docs/node_modules/y.txt': `${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('file=docs/node_modules/y.txt');
    expect(r.all).not.toContain(v);
  });

  test('an untracked file inside a gitignored node_modules directory is not scanned', () => {
    const repo = makeRepo(
      { '.gitignore': 'node_modules/\n' },
      { 'node_modules/pkg/index.js': `${v}\n` },
    );
    const r = guard(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/scanned 1 files, 0 findings/);
  });

  test('a -diff attribute does not hide a committed value in tree mode', () => {
    const repo = makeRepo({ '.gitattributes': '*.txt -diff\n', 'b.txt': `${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('file=b.txt,');
    expect(r.all).not.toContain(v);
  });

  test('a committed file with a NUL byte is skipped in tree mode', () => {
    const repo = makeRepo({
      'blob.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`\n${v}\n`)]),
    });
    const r = guard(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/scanned 0 files, 0 findings/);
  });

  test('symlinks and files deleted from the working tree are skipped', () => {
    const repo = makeRepo({ 'gone.txt': 'x\n', 'real.txt': 'clean\n' });
    symlinkSync('real.txt', join(repo, 'link.txt'));
    rmSync(join(repo, 'gone.txt'));
    const r = guard(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/scanned 1 files, 0 findings/);
  });

  test('a clean repo exits 0 and prints the summary line', () => {
    const repo = makeRepo({ 'a.txt': 'one\n', 'b.txt': 'two\n' });
    const r = guard(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('personal-number guard: scanned 2 files, 0 findings');
  });

  test('an empty file and an empty repository exit 0', () => {
    expect(guard(makeRepo({ 'empty.txt': '' })).code).toBe(0);
    expect(guard(makeRepo({})).code).toBe(0);
  });

  test('findings are ordered by path, line, column', () => {
    const repo = makeRepo({ 'b.txt': `${v}\n`, 'a.txt': `\n\n${v}\n` });
    const lines = guard(repo)
      .stdout.split('\n')
      .filter((l) => l.startsWith('::error'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('file=a.txt,line=3');
    expect(lines[1]).toContain('file=b.txt,line=1');
  });

  test('paths with workflow-command metacharacters are escaped in the annotation', () => {
    const repo = makeRepo({ 'a,b%c.txt': `${v}\n` });
    const r = guard(repo);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('file=a%2Cb%25c.txt,');
  });

  test('the allow-listed public example passes by default', () => {
    expect(guard(makeRepo({ 'a.txt': 'RSIN 001469630\n' })).code).toBe(0);
  });
});

describe('allow-list handling', () => {
  test('--allowlist accepts a synthetic value that has a reason', () => {
    const repo = makeRepo({ 'a.txt': `${v}\n` });
    const list = join(makeDir(), 'list.txt');
    writeFileSync(list, `${v}  # synthetic test value\n`);
    expect(guard(repo, '--allowlist', list).code).toBe(0);
  });

  test('an allow-list with only comments exits 0 on a clean repo', () => {
    const repo = makeRepo({ 'a.txt': 'clean\n' });
    const list = join(makeDir(), 'list.txt');
    writeFileSync(list, '# only a comment\n\n');
    expect(guard(repo, '--allowlist', list).code).toBe(0);
  });

  test('a malformed allow-list line exits 2 and names the line, never the value', () => {
    const repo = makeRepo({ 'a.txt': 'clean\n' });
    const list = join(makeDir(), 'list.txt');
    writeFileSync(list, `# header\n${v}\n`);
    const r = guard(repo, '--allowlist', list);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('allow-list line 2');
    expect(r.all).not.toContain(v);
  });

  test('a duplicate allow-list entry exits 2', () => {
    const repo = makeRepo({ 'a.txt': 'clean\n' });
    const list = join(makeDir(), 'list.txt');
    writeFileSync(list, `${v}  # one\n${v}  # two\n`);
    const r = guard(repo, '--allowlist', list);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('allow-list line 2');
  });

  test('a missing allow-list file exits 2', () => {
    const repo = makeRepo({ 'a.txt': 'clean\n' });
    expect(guard(repo, '--allowlist', join(makeDir(), 'nope.txt')).code).toBe(2);
  });
});

describe('usage errors', () => {
  test('an unknown flag exits 2', () => {
    const r = guard(makeRepo({ 'a.txt': 'x\n' }), '--bogus');
    expect(r.code).toBe(2);
    expect(r.stderr).not.toBe('');
  });

  test('running outside a git repository exits 2', () => {
    const r = guard(makeDir());
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('git repository');
  });
});

function commit(dir: string, message: string): string {
  git(dir, 'add', '-A');
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

const short = (sha: string) => sha.slice(0, 7);

describe('range mode', () => {
  test('a value added in one commit and removed in a later one: tree green, range red', () => {
    const repo = makeRepo({ 'notes.txt': 'one\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    write(repo, { 'notes.txt': `one\nid ${v}\n` });
    const added = commit(repo, 'add');
    write(repo, { 'notes.txt': 'one\n' });
    const head = commit(repo, 'remove');

    expect(guard(repo).code).toBe(0);
    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      `::error file=notes.txt,line=2,col=4,title=personal-number guard (commit ${short(added)})::`,
    );
    expect(r.stdout).toContain(masked);
    expect(r.stdout).toContain(
      `personal-number guard: scanned 2 commits (${short(base)}..${short(head)}), 1 findings`,
    );
    expect(r.all).not.toContain(v);
  });

  test('a value added then removed below node_modules and in a nested lockfile is reported', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    write(repo, {
      'docs/node_modules/x.txt': `id ${v}\n`,
      'sub/package-lock.json': `id ${v}\n`,
    });
    const added = commit(repo, 'add');
    rmSync(join(repo, 'docs/node_modules/x.txt'));
    rmSync(join(repo, 'sub/package-lock.json'));
    const head = commit(repo, 'remove');

    expect(guard(repo).code).toBe(0);
    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(1);
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('::error'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('file=docs/node_modules/x.txt,');
    expect(lines[1]).toContain('file=sub/package-lock.json,');
    for (const line of lines) {
      expect(line).toContain(`title=personal-number guard (commit ${short(added)})::`);
    }
    expect(r.stdout).toContain(masked);
    expect(r.stdout).toContain(
      `personal-number guard: scanned 2 commits (${short(base)}..${short(head)}), 2 findings`,
    );
    expect(r.all).not.toContain(v);
  });

  test.each([
    ['-diff added in the same commit', { attributes: '*.txt -diff\n', inBase: false }],
    ['binary added in the same commit', { attributes: '*.txt binary\n', inBase: false }],
    ['-diff already present in the base', { attributes: '*.txt -diff\n', inBase: true }],
  ])('a value added then removed in a file marked %s is reported once', (_name, row) => {
    const repo = makeRepo(row.inBase ? { '.gitattributes': row.attributes } : { 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    write(
      repo,
      row.inBase
        ? { 'b.txt': `id ${v}\n` }
        : { '.gitattributes': row.attributes, 'b.txt': `id ${v}\n` },
    );
    const added = commit(repo, 'add');
    rmSync(join(repo, 'b.txt'));
    commit(repo, 'remove');

    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      `::error file=b.txt,line=1,col=4,title=personal-number guard (commit ${short(added)})::`,
    );
    expect(r.stdout).toContain(masked);
    expect(r.stdout).toMatch(/, 1 findings/);
    expect(r.all).not.toContain(v);
  });

  test('range mode reads a file with a NUL byte as text, unlike tree mode', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    write(repo, { 'blob.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`\n${v}\n`)]) });
    const added = commit(repo, 'add');
    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      `file=blob.bin,line=2,col=1,title=personal-number guard (commit ${short(added)})::`,
    );
    expect(r.all).not.toContain(v);
    expect(guard(repo).code).toBe(0);
  });

  test('findings are ordered by commit, oldest first', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    const w = firstSyntheticValid(String(Number(v.slice(0, 8)) + 1));
    write(repo, { 'z.txt': `${w}\n` });
    const first = commit(repo, 'first');
    write(repo, { 'a.txt': `${v}\n` });
    const second = commit(repo, 'second');
    const lines = guard(repo, '--range', `${base}..HEAD`)
      .stdout.split('\n')
      .filter((l) => l.startsWith('::error'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`commit ${short(first)}`);
    expect(lines[0]).toContain('file=z.txt');
    expect(lines[1]).toContain(`commit ${short(second)}`);
  });

  test('an empty range exits 0 with zero commits', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const r = guard(repo, '--range', 'HEAD..HEAD');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('scanned 0 commits');
  });

  test('an allow-listed value added in the range exits 0', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    write(repo, { 'a.txt': 'RSIN 001469630\n' });
    commit(repo, 'public example');
    expect(guard(repo, '--range', `${base}..HEAD`).code).toBe(0);
  });

  test('a rename of a file that contains a value is reported', () => {
    const repo = makeRepo({ 'old.txt': `${v}\n` });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    git(repo, 'mv', 'old.txt', 'new.txt');
    commit(repo, 'rename');
    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('file=new.txt');
    expect(r.all).not.toContain(v);
  });

  test('merge commits are not scanned themselves', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    git(repo, 'checkout', '-q', '-b', 'side');
    write(repo, { 'side.txt': 'side\n' });
    commit(repo, 'side');
    git(repo, 'checkout', '-q', '-');
    write(repo, { 'main.txt': 'main\n' });
    commit(repo, 'main');
    git(repo, '-c', 'commit.gpgsign=false', 'merge', '-q', '--no-ff', '-m', 'merge', 'side');
    const r = guard(repo, '--range', `${base}..HEAD`);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('scanned 2 commits');
  });

  test.each([
    ['a leading dash', '-x..HEAD'],
    ['whitespace', 'HEAD ..HEAD'],
    ['three dots', 'HEAD...HEAD'],
    ['no separator', 'HEAD'],
    ['a missing side', '..HEAD'],
    ['two separators', 'HEAD..HEAD..HEAD'],
    ['an unknown ref', 'no-such-ref..HEAD'],
    ['an unknown head', 'HEAD..no-such-ref'],
  ])('%s exits 2', (_name, range) => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const r = guard(repo, '--range', range);
    expect(r.code).toBe(2);
    expect(r.stderr).not.toBe('');
  });

  test('an option-shaped range is rejected without reaching git', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const target = join(makeDir(), 'pwned.txt');
    const r = guard(repo, '--range', `--output=${target}..HEAD`);
    expect(r.code).toBe(2);
    expect(existsSync(target)).toBe(false);
  });
});
