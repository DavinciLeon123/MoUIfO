// Personal-number guard (FND-07). This repository is public and so are its CI logs: an elfproef-valid
// 9-digit value (a possible BSN) must never be committed, and must never be printed in full by this
// tool. Every finding is shown masked (six asterisks plus the last three digits).
//
// Usage: node tools/guards/src/personal-numbers.ts [--allowlist <file>]
// Exit codes: 0 clean, 1 findings, 2 usage or configuration error (the message never contains a
// candidate value).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type Finding, mask, parseAllowlist, scanText } from './scan.ts';

const DEFAULT_ALLOWLIST = fileURLToPath(
  new URL('../personal-number-allowlist.txt', import.meta.url),
);
const ALLOWLIST_LABEL = 'tools/guards/personal-number-allowlist.txt';
const NUL_PROBE_BYTES = 8000;

export class UsageError extends Error {}

export type TreeFinding = Finding & { path: string };

/** Escape a workflow-command property value (file=, title=). */
export function escapeProperty(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

/** Escape the message part of a workflow command. */
export function escapeData(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  });
}

export function skipPath(path: string): boolean {
  const segments = path.split('/');
  return segments.includes('node_modules') || segments.at(-1) === 'package-lock.json';
}

/** Scan every tracked and untracked-but-not-ignored text file of the working tree. */
export function runTreeScan(
  root: string,
  allow: ReadonlySet<string>,
): { scanned: number; findings: TreeFinding[] } {
  const listing = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const paths = [...new Set(listing.split('\0').filter((p) => p !== ''))].sort();
  const findings: TreeFinding[] = [];
  let scanned = 0;
  for (const path of paths) {
    if (skipPath(path)) continue;
    const full = join(root, path);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(full);
    } catch {
      continue; // listed but deleted from the working tree
    }
    if (!stat.isFile()) continue; // symlinks, directories (submodules)
    const bytes = readFileSync(full);
    if (bytes.subarray(0, NUL_PROBE_BYTES).includes(0)) continue; // binary
    scanned++;
    for (const f of scanText(bytes.toString('utf8'), allow)) findings.push({ path, ...f });
  }
  return { scanned, findings };
}

export function annotate(f: TreeFinding): string {
  const message =
    `elfproef-valid 9-digit value ${mask(f.value)} is not in ${ALLOWLIST_LABEL}. ` +
    'Remove it; allow-list it only if it is public or synthetic, with a reason.';
  return `::error file=${escapeProperty(f.path)},line=${f.line},col=${f.col},title=personal-number guard::${escapeData(message)}`;
}

function loadAllowlist(path: string): Set<string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new UsageError(`cannot read allow-list file ${path}`);
  }
  try {
    return parseAllowlist(text);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'invalid allow-list');
  }
}

function repoRoot(): string {
  try {
    return git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  } catch {
    throw new UsageError('not inside a git repository');
  }
}

function main(argv: string[]): number {
  let allowlistPath = DEFAULT_ALLOWLIST;
  try {
    const { values } = parseArgs({
      args: argv,
      options: { allowlist: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    if (values.allowlist !== undefined) allowlistPath = values.allowlist;
  } catch {
    throw new UsageError('invalid arguments; usage: personal-numbers.ts [--allowlist <file>]');
  }
  const allow = loadAllowlist(allowlistPath);
  const root = repoRoot();
  const { scanned, findings } = runTreeScan(root, allow);
  for (const f of findings) console.log(annotate(f));
  console.log(`personal-number guard: scanned ${scanned} files, ${findings.length} findings`);
  return findings.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`personal-number guard: ${error.message}`);
    process.exitCode = 2;
  }
}
