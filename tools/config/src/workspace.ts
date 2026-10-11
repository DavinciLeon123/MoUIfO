import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem, UioConfig } from './index.ts';
import { REPO_ROOT } from './index.ts';

/** Published package directories and the package-name suffix each must carry. */
export const PACKAGE_SUFFIX = {
  'packages/engine': 'engine',
  'packages/mcp': 'mcp-server',
  'packages/web': 'web',
} as const;

const SUFFIXES: readonly string[] = Object.values(PACKAGE_SUFFIX);
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const byFileThenMessage = (a: Problem, b: Problem): number =>
  a.file < b.file
    ? -1
    : a.file > b.file
      ? 1
      : a.message < b.message
        ? -1
        : a.message > b.message
          ? 1
          : 0;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Manifest = Record<string, unknown>;

function readManifest(root: string, file: string): Manifest | undefined {
  const path = join(root, file);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function scopeOf(name: unknown): string | undefined {
  return typeof name === 'string' ? /^(@[^/]+)\//.exec(name)?.[1] : undefined;
}

/** Scopes the three published packages currently use, plus the configured one. */
function ownScopes(cfg: UioConfig, root: string): Set<string> {
  const scopes = new Set<string>([cfg.npm_scope]);
  for (const dir of Object.keys(PACKAGE_SUFFIX)) {
    const scope = scopeOf(readManifest(root, `${dir}/package.json`)?.name);
    if (scope) scopes.add(scope);
  }
  return scopes;
}

/** Repo-relative paths of the package.json of every workspace, sorted. */
export function listWorkspaceManifests(root: string = REPO_ROOT): string[] {
  const rootManifest = readManifest(root, 'package.json');
  const globs = Array.isArray(rootManifest?.workspaces)
    ? (rootManifest.workspaces as string[])
    : [];
  const found: string[] = [];
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const dir = glob.slice(0, -2);
      const base = join(root, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base)) {
        const rel = `${dir}/${entry}/package.json`;
        if (existsSync(join(root, rel)) && statSync(join(base, entry)).isDirectory())
          found.push(rel);
      }
    } else if (existsSync(join(root, glob, 'package.json'))) {
      found.push(`${glob}/package.json`);
    }
  }
  return [...new Set(found)].sort();
}

/** Package names and own-scope dependency keys that disagree with `cfg.npm_scope`. */
export function checkPackageNames(cfg: UioConfig, root: string = REPO_ROOT): Problem[] {
  const problems: Problem[] = [];
  const scopes = ownScopes(cfg, root);

  for (const [dir, suffix] of Object.entries(PACKAGE_SUFFIX)) {
    const file = `${dir}/package.json`;
    const manifest = readManifest(root, file);
    if (!manifest) {
      problems.push({ file, message: 'package.json is missing' });
      continue;
    }
    const expected = `${cfg.npm_scope}/${suffix}`;
    if (manifest.name !== expected) {
      problems.push({
        file,
        message: `package name is ${JSON.stringify(manifest.name)}, expected "${expected}" (npm_scope in config.yaml; run npm run config:sync)`,
      });
    }
  }

  for (const file of listWorkspaceManifests(root)) {
    const manifest = readManifest(root, file);
    if (!manifest) continue;
    for (const section of DEPENDENCY_SECTIONS) {
      const deps = manifest[section];
      if (typeof deps !== 'object' || deps === null) continue;
      for (const key of Object.keys(deps)) {
        const match = /^(@[^/]+)\/(.+)$/.exec(key);
        const scope = match?.[1];
        const suffix = match?.[2];
        if (!scope || !suffix || !SUFFIXES.includes(suffix)) continue;
        if (scope === cfg.npm_scope || !scopes.has(scope)) continue;
        problems.push({
          file,
          message: `${section} key is "${key}", expected "${cfg.npm_scope}/${suffix}" (npm_scope in config.yaml; run npm run config:sync)`,
        });
      }
    }
  }

  return problems.sort(byFileThenMessage);
}

/**
 * Rewrite package names and own-scope dependency keys to `cfg.npm_scope`, textually so npm's
 * formatting is kept. Returns the repo-relative files that changed, sorted.
 */
export function syncPackageNames(cfg: UioConfig, root: string = REPO_ROOT): string[] {
  const scopes = ownScopes(cfg, root);
  const oldScopes = [...scopes].filter((scope) => scope !== cfg.npm_scope);
  const changed: string[] = [];

  for (const file of listWorkspaceManifests(root)) {
    const path = join(root, file);
    const original = readFileSync(path, 'utf8');
    let text = original;

    for (const [dir, suffix] of Object.entries(PACKAGE_SUFFIX)) {
      if (file !== `${dir}/package.json`) continue;
      const name = (JSON.parse(original) as Manifest).name;
      const expected = `${cfg.npm_scope}/${suffix}`;
      if (typeof name === 'string' && name !== expected) {
        const pattern = new RegExp(`("name"\\s*:\\s*)"${escapeRegExp(name)}"`);
        text = text.replace(pattern, (_whole, lead: string) => `${lead}"${expected}"`);
      }
    }

    for (const scope of oldScopes) {
      for (const suffix of SUFFIXES) {
        const pattern = new RegExp(`"${escapeRegExp(`${scope}/${suffix}`)}"`, 'g');
        text = text.replace(pattern, `"${cfg.npm_scope}/${suffix}"`);
      }
    }

    if (text !== original) {
      writeFileSync(path, text);
      changed.push(file);
    }
  }

  return changed.sort();
}

function isScanned(file: string): boolean {
  const segments = file.split('/');
  const base = segments[segments.length - 1] ?? '';
  if (segments.includes('node_modules')) return false;
  if (base === 'package.json' || base === 'package-lock.json') return false;
  if (segments.length === 1) return base.endsWith('.ts') || base.endsWith('.json');
  const top = segments[0];
  return top === 'tools' || top === 'packages' || top === '.github';
}

function listRepoFiles(root: string): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out.split('\0').filter((entry) => entry !== '');
}

/**
 * Find hard-coded copies of the namespace or the npm scope that should be read through
 * `loadConfig()` instead. Scans tools/, packages/, .github/ and root .ts/.json files.
 */
export function findConfigLiterals(
  cfg: UioConfig,
  root: string = REPO_ROOT,
  files?: string[],
): Problem[] {
  const needles = [cfg.namespace.replace(/\/$/, ''), `${cfg.npm_scope}/`];
  const problems: Problem[] = [];

  for (const file of (files ?? listRepoFiles(root)).filter(isScanned)) {
    let buffer: Buffer;
    try {
      buffer = readFileSync(join(root, file));
    } catch {
      continue;
    }
    if (buffer.subarray(0, 8000).includes(0)) continue;
    const lines = buffer.toString('utf8').split('\n');
    lines.forEach((text, index) => {
      const needle = needles.find((n) => text.includes(n));
      if (needle !== undefined) {
        problems.push({
          file,
          line: index + 1,
          message: `hard-coded "${needle}"; read the value through loadConfig() from uio-config`,
        });
      }
    });
  }

  return problems.sort(
    (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line ?? 0) - (b.line ?? 0),
  );
}
