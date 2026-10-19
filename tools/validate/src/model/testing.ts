import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from 'uio-config';
import { discoverModelFiles, expectedHeader, type ModelFile } from './load.ts';

/**
 * Test helper: a model file with the exact header its path requires, followed by `body`.
 * A path without a known schema gets no header.
 */
export function fixture(path: string, body: string): ModelFile {
  const header = expectedHeader(path);
  return { path, text: header === undefined ? body : `${header}\n${body}` };
}

/** Test helper: every real model file under `root` with its text. */
export function realModelFiles(root: string = REPO_ROOT): ModelFile[] {
  return discoverModelFiles(root).files;
}

/** The six jurisdictions of the frozen Phase 2 seed, read as `model/jurisdictions/<id>.yaml`. */
export const SEED_JURISDICTIONS = ['BE', 'EU', 'GB', 'GR', 'NL', 'XI'] as const;

/** The five seed sources (four from Phase 2, the country table of DEC-057), read as `model/sources/<id>.yaml`. */
export const SEED_SOURCES = [
  // Joins the seed because the seed jurisdictions cite it through authority_table (DEC-057).
  'eu-country-authority-table',
  'hmrc-eori-introduction',
  'nia-1998-s1',
  'teu-art-52',
  'vat-directive-art-215',
] as const;

/** Test helper: one model file read from the repository at `path`. */
function readRepoFile(path: string): ModelFile {
  return { path, text: readFileSync(join(REPO_ROOT, path), 'utf8') };
}

/**
 * Test helper: the frozen Phase 2 seed with `extra` added, or replacing the file of the same path.
 * The seed is every file under `model/vocab/`, the `SEED_JURISDICTIONS` and the `SEED_SOURCES`.
 * Fixture tests run on this seed, not on the real model, so real Phase 3 schemes, authorities,
 * jurisdictions and sources cannot add problems to or remove references from a fixture's expected
 * result. The seed fixes which files are read (the ids above); their text comes from the
 * repository, so an edit to a seed file would reach the fixtures too.
 */
export function withSeedModel(extra: ModelFile | readonly ModelFile[]): ModelFile[] {
  const added = Array.isArray(extra) ? extra : [extra as ModelFile];
  const paths = new Set(added.map((file) => file.path));
  const seed = [
    ...realModelFiles().filter((file) => file.path.startsWith('model/vocab/')),
    ...SEED_JURISDICTIONS.map((id) => readRepoFile(`model/jurisdictions/${id}.yaml`)),
    ...SEED_SOURCES.map((id) => readRepoFile(`model/sources/${id}.yaml`)),
  ];
  return [...seed.filter((file) => !paths.has(file.path)), ...added];
}

/** Test helper: a register-doc source with a placeholder url, for fixtures to cite. */
export function fixtureSource(id = 'fixture-source'): ModelFile {
  return fixture(
    `model/sources/${id}.yaml`,
    `id: ${id}\ntitle: Fixture register documentation\ntype: register-doc\ndate: 2026-01-01\nurl: https://example.org/${id}\n`,
  );
}

/** Test helper: an authority class `fixture-authority` and its NL instance `fixture-authority-nl`. */
export function fixtureAuthorities(): ModelFile[] {
  return [
    fixture(
      'model/authorities/fixture-authority.yaml',
      'id: fixture-authority\nkind: class\nlabel:\n  en: Fixture authority\ndefinition:\n  en: An authority that exists only in tests.\n',
    ),
    fixture(
      'model/authorities/fixture-authority-nl.yaml',
      'id: fixture-authority-nl\nkind: instance\nlabel:\n  en: Fixture authority NL\ninstance_of: fixture-authority\njurisdiction: NL\nsource: fixture-source\ncertainty: certain\n',
    ),
  ];
}

/** Test helper: a scheme file `model/schemes/<id>.yaml` with the exact header and `body`. */
export function schemeFixture(id: string, body: string): ModelFile {
  return fixture(`model/schemes/${id}.yaml`, body);
}

/**
 * Test helper: the header fields of a minimal valid scheme, one per line, with `overrides`
 * replacing the line of the same key (a value of `undefined` drops the line; a multi-line value
 * is allowed). `extra` is appended unchanged.
 */
export function minimalSchemeBody(
  id: string,
  overrides: Readonly<Record<string, string | undefined>> = {},
  extra = '',
): string {
  const fields: Record<string, string | undefined> = {
    id,
    label: '\n  en: Fixture scheme',
    kind: 'identifier',
    issuer: 'fixture-authority',
    jurisdiction: 'NL',
    sources: '\n  default: fixture-source',
    abbreviation: 'FIX',
    availability: 'public',
    iso6523_icd: '"0106"',
    peppol_eas: 'null',
    ...overrides,
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
  return `${lines}${extra}`;
}

const CLI = fileURLToPath(new URL('../index.ts', import.meta.url));

const copies: string[] = [];

/** Test helper: the process environment without the `GIT_*` variables a git hook may have set. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

/**
 * Test helper: a git-initialised copy of every tracked and untracked-but-not-ignored file of the
 * repository, in a fresh temporary directory registered for `cleanupCopies`.
 */
export function copyOfRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-cli-'));
  copies.push(root);
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: REPO_ROOT, env: cleanEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  for (const rel of listed.split('\0').filter((entry) => entry !== '')) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REPO_ROOT, rel), join(root, rel));
  }
  execFileSync('git', ['init', '-q'], { cwd: root, env: cleanEnv() });
  return root;
}

/** Test helper: remove every copy made by `copyOfRepo` (call from `afterAll`). */
export function cleanupCopies(): void {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
}

function cliInvocation(
  root: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): { args: string[]; env: NodeJS.ProcessEnv } {
  const childEnv = cleanEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  return {
    args: ['--conditions=uio-source', CLI, ...(root === undefined ? [] : ['--root', root])],
    env: childEnv,
  };
}

/**
 * Test helper: run the validate CLI on `root` (default: the real repository). `env` overrides the
 * cleaned environment; an `undefined` value deletes the key (the GitHub runner sets
 * GITHUB_ACTIONS=true while `npm test` runs there too).
 */
export function runValidateCli(
  root?: string,
  env: Readonly<Record<string, string | undefined>> = {},
): { status: number | null; stdout: string } {
  const invocation = cliInvocation(root, env);
  const result = spawnSync(process.execPath, invocation.args, {
    cwd: REPO_ROOT,
    env: invocation.env,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

/** Test helper: like `runValidateCli`, asynchronous, so two runs can overlap. */
export function runValidateCliAsync(
  root?: string,
  env: Readonly<Record<string, string | undefined>> = {},
): Promise<{ status: number | null; stdout: string }> {
  const invocation = cliInvocation(root, env);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, invocation.args, {
      cwd: REPO_ROOT,
      env: invocation.env,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout }));
  });
}

/** Test helper: the 1-based line and column of the first character of the `occurrence`-th `token`. */
export function positionOfToken(
  text: string,
  token: string,
  occurrence = 1,
): { line: number; column: number } {
  let index = -1;
  for (let seen = 0; seen < occurrence; seen++) {
    index = text.indexOf(token, index + 1);
    if (index < 0)
      throw new Error(`token ${JSON.stringify(token)} occurrence ${occurrence} not found`);
  }
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}
