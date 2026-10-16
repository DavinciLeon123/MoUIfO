import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, REPO_ROOT } from 'uio-config';

export type BuildRootOptions = {
  /** The `npm_scope` written to the root's config.yaml; defaults to the real scope. */
  configScope?: string;
  /** The scope of the three package names; defaults to the real scope. */
  packageScope?: string;
  /** `'copy'` (default) copies the real `model/`; `'none'` leaves the root without a model. */
  model?: 'copy' | 'none';
};

const roots: string[] = [];

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Test helper: a temporary repository root for build CLI tests. config.yaml is the real one with
 * only its `npm_scope` replaced; the three package manifests carry `packageScope`; `model/`,
 * `ontology/`, `shapes/` and `docs/gaps.md` are copied from the real repository when they exist.
 * The namespace is never written as a literal here: it comes from the real config.yaml text.
 */
export function makeBuildRoot(options: BuildRootOptions = {}): string {
  const real = loadConfig(REPO_ROOT);
  const configScope = options.configScope ?? real.npm_scope;
  const packageScope = options.packageScope ?? real.npm_scope;
  const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
  roots.push(root);

  const configText = readFileSync(join(REPO_ROOT, 'config.yaml'), 'utf8');
  write(
    root,
    'config.yaml',
    configText.replace(/^npm_scope:.*$/m, () => `npm_scope: "${configScope}"`),
  );

  const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  write(
    root,
    'package.json',
    `${JSON.stringify({ name: rootPackage.name, version: rootPackage.version, workspaces: ['packages/*'] })}\n`,
  );
  for (const [dir, suffix] of [
    ['engine', 'engine'],
    ['mcp', 'mcp-server'],
    ['web', 'web'],
  ] as const) {
    write(
      root,
      `packages/${dir}/package.json`,
      `${JSON.stringify({ name: `${packageScope}/${suffix}`, version: '0.0.0' }, null, 2)}\n`,
    );
  }

  const copy = (rel: string): void => {
    if (existsSync(join(REPO_ROOT, rel))) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      cpSync(join(REPO_ROOT, rel), join(root, rel), { recursive: true });
    }
  };
  if ((options.model ?? 'copy') === 'copy') copy('model');
  copy('ontology');
  copy('shapes');
  copy('docs/gaps.md');
  return root;
}

/** Test helper: remove every root made by `makeBuildRoot` (call from `afterEach` or `afterAll`). */
export function cleanupBuildRoots(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** A small RFC 4180 reader: quoted cells with doubled quotes, LF or CRLF records. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(cell);
      cell = '';
    } else if (c === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else cell += c;
  }
  return records;
}
