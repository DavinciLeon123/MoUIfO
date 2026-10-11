import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMap, parseDocument } from 'yaml';

/** The four keys of `config.yaml`, in the order the loader returns them. */
export const CONFIG_KEYS = ['namespace', 'npm_scope', 'pages_base_path', 'repository'] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export type UioConfig = Readonly<Record<ConfigKey, string>>;

/** A finding that a check reports; `toAnnotation` renders it as a GitHub workflow command. */
export type Problem = { file: string; line?: number; message: string };

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export const REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

const SHAPES: Readonly<Record<Exclude<ConfigKey, 'namespace'>, [RegExp, string]>> = {
  npm_scope: [/^@[a-z0-9][a-z0-9-]*$/, 'must look like "@scope" (lowercase letters, digits, "-")'],
  pages_base_path: [/^\/([A-Za-z0-9._-]+\/)*$/, 'must start and end with "/", e.g. "/site/"'],
  repository: [/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, 'must be shaped owner/name'],
};

function namespaceProblem(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'namespace must be an absolute https URL ending in "/"';
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '' || !value.endsWith('/')) {
    return 'namespace must be an https URL ending in "/", without query or fragment';
  }
  return undefined;
}

/** Parse and validate the text of `config.yaml`. Throws ConfigError on any deviation. */
export function parseConfig(text: string, source = 'config.yaml'): UioConfig {
  const fail = (detail: string): never => {
    throw new ConfigError(`${source}: ${detail}`);
  };

  const doc = parseDocument(text, { schema: 'core', uniqueKeys: true, prettyErrors: true });
  const firstError = doc.errors[0];
  if (firstError) {
    const atSign = /^\s*[A-Za-z_][\w-]*\s*:\s+@/m.test(text) || firstError.message.includes('@');
    const hint = atSign ? ' (quote values that start with @, e.g. npm_scope: "@scope")' : '';
    return fail(`${firstError.message}${hint}`);
  }

  const contents = doc.contents;
  if (contents !== null && !isMap(contents)) {
    return fail('the file must contain a mapping of keys to values');
  }
  const raw: unknown = contents === null ? {} : doc.toJS();
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const known = new Set<string>(CONFIG_KEYS);
  const unknown = Object.keys(record).filter((key) => !known.has(key));
  if (unknown.length > 0) fail(`unknown key(s): ${unknown.join(', ')}`);

  const missing = CONFIG_KEYS.filter((key) => !(key in record));
  if (missing.length > 0) fail(`missing key(s): ${missing.join(', ')}`);

  const out = {} as Record<ConfigKey, string>;
  for (const key of CONFIG_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || value === '') fail(`${key} must be a non-empty string`);
    out[key] = value as string;
  }

  const nsProblem = namespaceProblem(out.namespace);
  if (nsProblem) fail(nsProblem);
  for (const key of ['npm_scope', 'pages_base_path', 'repository'] as const) {
    const [pattern, hint] = SHAPES[key];
    if (!pattern.test(out[key])) fail(`${key} ${hint}`);
  }

  return Object.freeze({
    namespace: out.namespace,
    npm_scope: out.npm_scope,
    pages_base_path: out.pages_base_path,
    repository: out.repository,
  });
}

/** The only reader of `config.yaml`. */
export function loadConfig(root: string = REPO_ROOT): UioConfig {
  const path = join(root, 'config.yaml');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`cannot read ${path}: ${reason}`);
  }
  return parseConfig(text, path);
}

const escapeData = (s: string): string =>
  s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (s: string): string =>
  escapeData(s).replaceAll(':', '%3A').replaceAll(',', '%2C');

/** Render a problem as a GitHub Actions `::error` workflow command. */
export function toAnnotation(p: Problem): string {
  const line = p.line === undefined ? '' : `,line=${p.line}`;
  return `::error file=${escapeProperty(p.file)}${line}::${escapeData(p.message)}`;
}

export * from './workspace.ts';
