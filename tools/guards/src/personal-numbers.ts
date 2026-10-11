// Personal-number guard (FND-07). This repository is public and so are its CI logs: an elfproef-valid
// 9-digit value (a possible BSN) must never be committed, and must never be printed in full by this
// tool. Every finding is shown masked (six asterisks plus the last three digits).
//
// Usage: node tools/guards/src/personal-numbers.ts [--allowlist <file>] [--allowlist-ref <commit>]
//        [--range <base>..<head>]
//   tree mode (default): scans every tracked and untracked-but-not-ignored text file. No path or file
//   name is skipped: installed dependencies are excluded only because .gitignore ignores them
//   (git's --exclude-standard).
//   --range mode: scans the added lines of every non-merge commit in <base>..<head>, so a value that
//   was added in one commit and removed in a later one is still caught (D-23). Added lines are read
//   with `git show --text`, so .gitattributes -diff/binary rules cannot hide them.
//   --allowlist-ref <commit>: reads the allow-list from that commit (CI passes the pull request base),
//   so an entry the change under review adds is not honoured, including the new line in the allow-list
//   file itself (DEC-025). An entry the change removes stays honoured for that run and is announced
//   with one masked notice. When the commit has no allow-list file, the working-tree copy (or
//   --allowlist) is used and the source line says so. The working-tree copy is always parsed. An
//   unresolvable ref, a path that is not a regular file in the commit or a malformed copy exits 2.
// Exit codes: 0 clean, 1 findings, 2 usage or configuration error (the message never contains a
// candidate value).
//
// Known gaps (accepted and documented, not fixed): merge-commit conflict resolutions are not scanned;
// numbers split across lines; grouped forms such as three groups of three digits or dotted groups;
// 8-digit BSNs written without the leading zero; full-width digits; encoded content. Tree mode skips
// files with a NUL byte in the first 8000 bytes, range mode reads every added line as text (so it is
// stricter than tree mode for such files); base64 and hex tokens are blanked in both modes. The guard
// code, the `guard` npm script and the workflow run from the change under review, so a change that
// edits them can neutralise the guard for its own run (owner-accepted residual risk, DEC-025).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type Finding, mask, parseAddedLines, parseAllowlist, scanText } from './scan.ts';

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

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // code-unit order, independent of locale
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

/** Message for a value in the allow-list file that the trusted allow-list does not hold. */
function untrustedEntryMessage(f: TreeFinding, trustedSha: string): string {
  return (
    `value ${mask(f.value)} in the allow-list file is not in the allow-list of ${trustedSha.slice(0, 7)}, ` +
    'which this run trusts: an entry added by the change under review is not honoured. ' +
    'Land a new entry as a separate change that the owner merges (DEC-025).'
  );
}

/** `trustedSha` is set only when this run uses the allow-list of a trusted commit. */
export function annotate(f: TreeFinding, trustedSha?: string): string {
  if (trustedSha !== undefined && f.path === ALLOWLIST_LABEL) {
    return `::error file=${escapeProperty(f.path)},line=${f.line},col=${f.col},title=${escapeProperty('personal-number guard (allow-list)')}::${escapeData(untrustedEntryMessage(f, trustedSha))}`;
  }
  const message =
    `elfproef-valid 9-digit value ${mask(f.value)} is not in ${ALLOWLIST_LABEL}. ` +
    'Remove it; allow-list it only if it is public or synthetic, with a reason.';
  return `::error file=${escapeProperty(f.path)},line=${f.line},col=${f.col},title=personal-number guard::${escapeData(message)}`;
}

export type RangeFinding = TreeFinding & { commit: string };

const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Validate a ref (no leading dash, no whitespace) and resolve it to a commit sha. */
function resolveCommit(
  root: string,
  ref: string,
  which: 'base' | 'head' | 'allowlist-ref',
): string {
  const what = which === 'allowlist-ref' ? 'the --allowlist-ref value' : `the ${which} of --range`;
  if (!REF.test(ref)) throw new UsageError(`${what} is not a plain ref name`);
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new UsageError(`${what} does not resolve to a commit`);
  }
}

/** Split `<base>..<head>`; rejects `...`, a missing side and more than one `..`. */
export function parseRange(spec: string): { base: string; head: string } {
  const parts = spec.split('..');
  const [base, head] = parts;
  if (spec.includes('...') || parts.length !== 2 || !base || !head) {
    throw new UsageError('--range must have the form <base>..<head>');
  }
  return { base, head };
}

/** Scan the added lines of every non-merge commit in base..head, oldest commit first. */
export function runRangeScan(
  root: string,
  base: string,
  head: string,
  allow: ReadonlySet<string>,
): { commits: string[]; baseSha: string; headSha: string; findings: RangeFinding[] } {
  const baseSha = resolveCommit(root, base, 'base');
  const headSha = resolveCommit(root, head, 'head');
  const commits = git(root, ['rev-list', '--no-merges', '--reverse', `${baseSha}..${headSha}`])
    .split('\n')
    .filter((c) => c !== '');
  const findings: RangeFinding[] = [];
  for (const commit of commits) {
    const diff = git(root, [
      '-c',
      'core.quotePath=false',
      'show',
      '--format=',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--text',
      '--unified=0',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      commit,
    ]);
    const found: RangeFinding[] = [];
    for (const added of parseAddedLines(diff)) {
      for (const f of scanText(added.text, allow)) {
        found.push({ commit, path: added.path, line: added.line, col: f.col, value: f.value });
      }
    }
    found.sort((a, b) => comparePath(a.path, b.path) || a.line - b.line || a.col - b.col);
    findings.push(...found);
  }
  return { commits, baseSha, headSha, findings };
}

export function annotateRange(f: RangeFinding, trustedSha?: string): string {
  const sha7 = f.commit.slice(0, 7);
  if (trustedSha !== undefined && f.path === ALLOWLIST_LABEL) {
    const title = escapeProperty(`personal-number guard (allow-list, commit ${sha7})`);
    return `::error file=${escapeProperty(f.path)},line=${f.line},col=${f.col},title=${title}::${escapeData(untrustedEntryMessage(f, trustedSha))}`;
  }
  const message =
    `elfproef-valid 9-digit value ${mask(f.value)} was added in commit ${sha7}. ` +
    'Removing it in a later commit is not enough: rewrite the pull request history so that no commit contains it.';
  return `::error file=${escapeProperty(f.path)},line=${f.line},col=${f.col},title=${escapeProperty(`personal-number guard (commit ${sha7})`)}::${escapeData(message)}`;
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

/**
 * The allow-list of a trusted commit. `allow` is null only when the commit has no allow-list file
 * (the caller then falls back to the working-tree copy); every other problem throws, so an unreadable
 * or malformed trusted copy can never turn into a silent fallback.
 */
export function loadAllowlistAt(
  root: string,
  ref: string,
): { sha: string; allow: Set<string> | null } {
  const sha = resolveCommit(root, ref, 'allowlist-ref');
  const sha7 = sha.slice(0, 7);
  let text: string;
  try {
    const entry = git(root, ['ls-tree', '-z', sha, '--', ALLOWLIST_LABEL]).split('\0')[0] ?? '';
    if (entry === '') return { sha, allow: null };
    const m = /^(100644|100755) blob ([0-9a-f]+)\t/.exec(entry);
    if (!m?.[2]) throw new UsageError(`the allow-list in ${sha7} is not a regular file`);
    text = git(root, ['cat-file', 'blob', m[2]]);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`cannot read the allow-list from ${sha7}`);
  }
  try {
    return { sha, allow: parseAllowlist(text) };
  } catch (error) {
    throw new UsageError(
      `allow-list at ${sha7}: ${error instanceof Error ? error.message : 'invalid allow-list'}`,
    );
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
  let allowlistRef: string | undefined;
  let range: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        allowlist: { type: 'string' },
        'allowlist-ref': { type: 'string' },
        range: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values.allowlist !== undefined) allowlistPath = values.allowlist;
    allowlistRef = values['allowlist-ref'];
    range = values.range;
  } catch {
    throw new UsageError(
      'invalid arguments; usage: personal-numbers.ts [--allowlist <file>] [--allowlist-ref <commit>] [--range <base>..<head>]',
    );
  }
  const parsedRange = range === undefined ? undefined : parseRange(range);
  let allow = loadAllowlist(allowlistPath);
  const root = repoRoot();
  let trustedSha: string | undefined;
  if (allowlistRef !== undefined) {
    const trusted = loadAllowlistAt(root, allowlistRef);
    const sha7 = trusted.sha.slice(0, 7);
    if (trusted.allow === null) {
      console.log(
        `personal-number guard: allow-list source: working tree (${sha7} has no ${ALLOWLIST_LABEL})`,
      );
    } else {
      console.log(`personal-number guard: allow-list source: ${sha7}`);
      for (const value of trusted.allow) {
        if (allow.has(value)) continue;
        const message = `entry ${mask(value)} is removed by this change; it stays honoured until the change is merged`;
        console.log(
          `::notice file=${escapeProperty(ALLOWLIST_LABEL)},title=${escapeProperty('personal-number guard (allow-list)')}::${escapeData(message)}`,
        );
      }
      allow = trusted.allow;
      trustedSha = trusted.sha;
    }
  }
  if (parsedRange) {
    const { commits, baseSha, headSha, findings } = runRangeScan(
      root,
      parsedRange.base,
      parsedRange.head,
      allow,
    );
    for (const f of findings) console.log(annotateRange(f, trustedSha));
    console.log(
      `personal-number guard: scanned ${commits.length} commits (${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}), ${findings.length} findings`,
    );
    return findings.length > 0 ? 1 : 0;
  }
  const { scanned, findings } = runTreeScan(root, allow);
  for (const f of findings) console.log(annotate(f, trustedSha));
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
