import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Problem } from 'uio-config';
import { listWorkspaceManifests } from 'uio-config';

const LICENSE_SHA256 = '6fc9e709ccbfe0d77fbffa2427a983282be2eb88e47b1cdb49f21a83b4d1e665';
const LICENSE_MODEL_SHA256 = '9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411';
const SPEC_NL_SHA256 = 'e4b133ddf76817af05e6e3b92b7382fe4860fd0838c90445b64a49a8590f0812';

const DECISIONS_HEADER = '| id | date | decision | rationale | SPEC section affected |';

/** Override-list strings that must stay in `.claude/CLAUDE.md` above the first GSD marker. */
const INSTRUCTION_OVERRIDE_STRINGS: readonly string[] = [
  'Overridden by DECISIONS.md',
  '>=22.18',
  '>=22.12',
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/sdk',
  '--error-on-warnings',
  'DEC-006',
  'DEC-008',
  'DEC-009',
  'DEC-010',
  'DEC-014',
];

export type RequiredDecision = { topic: string; patterns: RegExp[] };

/** Topics the decision log must cover; a topic passes when one row matches all its patterns. */
export const REQUIRED_DECISIONS: readonly RequiredDecision[] = [
  { topic: 'eori-from-rsin', patterns: [/EORI/, /RSIN/, /two-step/] },
  { topic: 'any-of-checksum', patterns: [/any-of/] },
  { topic: 'bare-9-digit', patterns: [/9-digit/, /check/] },
  { topic: 'mcp-server-package', patterns: [/@modelcontextprotocol\/server/] },
  { topic: 'typescript-biome', patterns: [/TypeScript 7/, /Biome/] },
  { topic: 'node-engines', patterns: [/>=22\.18/, />=22\.12/] },
  { topic: 'biome-warnings', patterns: [/--error-on-warnings/] },
  { topic: 'npm-scope', patterns: [/npm scope/, /config\.yaml/] },
  { topic: 'w3id-deferred', patterns: [/w3id/, /Phase 8/] },
  { topic: 'repo-and-pages', patterns: [/DavinciLeon123\/MoUIfO/, /pages_base_path/] },
  { topic: 'licence-scope', patterns: [/LICENSE-model/, /sources\//, /docs\//] },
  { topic: 'excel-as-csv', patterns: [/CSV/, /gitignored/] },
  { topic: 'licence-gate', patterns: [/Pending:/, /Davinci Conclusion/] },
  { topic: 'davinci-only', patterns: [/Davinci Conclusion/, /attribution/] },
  { topic: 'ontology-input', patterns: [/uio:def#/] },
  { topic: 'ontology-location', patterns: [/sources\/uio-ontology-v0\.9\.ttl/] },
  { topic: 'strict-sourcing', patterns: [/docs\/gaps\.md/] },
  { topic: 'kbo-only', patterns: [/KBO/] },
  { topic: 'nomoscli', patterns: [/NomosCLI/] },
  { topic: 'spec-authority', patterns: [/SPEC\.nl\.md/, /authoritative/] },
  { topic: 'instruction-file', patterns: [/\.claude\/CLAUDE\.md/] },
  { topic: 'guard-commit-scan', patterns: [/base\.\.head/, /mask/] },
  { topic: 'spec9-corrections', patterns: [/Overview UIDs/, /14 scheme columns/] },
];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sorted(problems: Problem[]): Problem[] {
  return problems.sort(
    (a, b) =>
      compare(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compare(a.message, b.message),
  );
}

function readText(root: string, rel: string): string | undefined {
  const path = join(root, rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function sha256(root: string, rel: string): string | undefined {
  const path = join(root, rel);
  return existsSync(path)
    ? createHash('sha256').update(readFileSync(path)).digest('hex')
    : undefined;
}

type Manifest = {
  license?: unknown;
  engines?: { node?: unknown };
  dependencies?: Record<string, unknown>;
};

function readManifest(root: string, rel: string): Manifest | undefined {
  const text = readText(root, rel);
  return text === undefined ? undefined : (JSON.parse(text) as Manifest);
}

function expectedEngine(rel: string): string {
  return rel === 'packages/engine/package.json' || rel === 'packages/mcp/package.json'
    ? '>=22.12'
    : '>=22.18';
}

/** Licence, engines, `.nvmrc` and the dependency-free engine (FND-02, D-05). */
export function checkPackageMetadata(root: string): Problem[] {
  const problems: Problem[] = [];
  for (const rel of ['package.json', ...listWorkspaceManifests(root)]) {
    const manifest = readManifest(root, rel);
    if (!manifest) {
      problems.push({ file: rel, message: 'package.json is missing' });
      continue;
    }
    if (manifest.license !== 'EUPL-1.2') {
      problems.push({
        file: rel,
        message: `license is ${JSON.stringify(manifest.license)}, expected "EUPL-1.2" (DEC-013)`,
      });
    }
    const wanted = expectedEngine(rel);
    if (manifest.engines?.node !== wanted) {
      problems.push({
        file: rel,
        message: `engines.node is ${JSON.stringify(manifest.engines?.node)}, expected "${wanted}" (DEC-008)`,
      });
    }
  }

  const nvmrc = readText(root, '.nvmrc');
  if (nvmrc?.trim() !== '24') {
    problems.push({ file: '.nvmrc', message: '.nvmrc must contain exactly "24" (DEC-008)' });
  }

  const engine = readManifest(root, 'packages/engine/package.json');
  if (engine && Object.keys(engine.dependencies ?? {}).length > 0) {
    problems.push({
      file: 'packages/engine/package.json',
      message: 'dependencies must be empty: the engine has no runtime dependencies (SPEC §6)',
    });
  }
  return sorted(problems);
}

function hasTestFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasTestFile(join(dir, entry.name))) return true;
    } else if (entry.name.endsWith('.test.ts')) {
      return true;
    }
  }
  return false;
}

/** Every workspace has at least one `src/**\/*.test.ts` (FND-01). */
export function checkWorkspaceTests(root: string): Problem[] {
  const problems: Problem[] = [];
  for (const rel of listWorkspaceManifests(root)) {
    if (!hasTestFile(join(root, dirname(rel), 'src'))) {
      problems.push({
        file: rel,
        message: `workspace ${dirname(rel)} has no src/**/*.test.ts file`,
      });
    }
  }
  return sorted(problems);
}

/** Licence texts are pinned by hash and the licence scope is stated in both READMEs (FND-02, D-21). */
export function checkLicences(root: string): Problem[] {
  const problems: Problem[] = [];
  for (const [file, expected] of [
    ['LICENSE', LICENSE_SHA256],
    ['LICENSE-model', LICENSE_MODEL_SHA256],
  ] as const) {
    const actual = sha256(root, file);
    if (actual === undefined) problems.push({ file, message: `${file} is missing` });
    else if (actual !== expected) {
      problems.push({ file, message: `${file} SHA-256 is ${actual}, expected ${expected}` });
    }
  }

  const requirements: [string, string[]][] = [
    ['README.md', ['LICENSE-model', 'sources/', 'docs/']],
    ['sources/README.md', ['LICENSE-model']],
  ];
  for (const [file, needles] of requirements) {
    const text = readText(root, file);
    if (text === undefined) {
      problems.push({ file, message: `${file} is missing` });
      continue;
    }
    for (const needle of needles) {
      if (!text.includes(needle)) {
        problems.push({
          file,
          message: `${file} must state the licence scope: "${needle}" not found (DEC-013)`,
        });
      }
    }
  }
  return sorted(problems);
}

const ID_PATTERN = /^DEC-[0-9]{3}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const SPEC_ITEM = /^(§[0-9]+(\.[0-9]+)?|Appendix [AB]|n\/a)$/;

function splitRow(line: string): string[] {
  const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'));
  cells.shift();
  cells.pop();
  return cells;
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Ids and rows of the decision table; shared by `checkDecisions` and `checkSpecPair`. */
function decisionIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const line of text.split('\n')) {
    const id = /^\|\s*(DEC-[0-9]{3})\s*\|/.exec(line)?.[1];
    if (id) ids.add(id);
  }
  return ids;
}

/** Shape of DECISIONS.md and coverage of the seed topics (FND-05, D-15, D-16, D-24). */
export function checkDecisions(root: string): Problem[] {
  const file = 'DECISIONS.md';
  const text = readText(root, file);
  if (text === undefined) return [{ file, message: 'DECISIONS.md is missing' }];

  const lines = text.split('\n');
  const headerIndex = lines.findIndex((line) => line.trim() === DECISIONS_HEADER);
  if (headerIndex < 0) {
    return [{ file, message: `table header must be exactly: ${DECISIONS_HEADER}` }];
  }

  const problems: Problem[] = [];
  const seen = new Set<string>();
  const texts: string[] = [];
  let previous = 0;

  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('|')) break;
    const lineNo = i + 1;
    const cells = splitRow(line);
    if (cells.length !== 5) {
      problems.push({ file, line: lineNo, message: `row has ${cells.length} cells, expected 5` });
      continue;
    }
    const [id = '', date = '', decision = '', rationale = '', specCell = ''] = cells;

    if (!ID_PATTERN.test(id)) {
      problems.push({ file, line: lineNo, message: `id "${id}" must match DEC-NNN` });
    } else {
      const number = Number(id.slice(4));
      if (seen.has(id)) {
        problems.push({ file, line: lineNo, message: `duplicate id ${id}` });
      } else if (number <= previous) {
        problems.push({
          file,
          line: lineNo,
          message: `id ${id} is not strictly ascending (previous was DEC-${String(previous).padStart(3, '0')})`,
        });
      }
      seen.add(id);
      previous = Math.max(previous, number);
    }
    if (!isRealDate(date)) {
      problems.push({
        file,
        line: lineNo,
        message: `${id}: date "${date}" is not a valid YYYY-MM-DD date`,
      });
    }
    if (decision === '') problems.push({ file, line: lineNo, message: `${id}: decision is empty` });
    if (rationale === '')
      problems.push({ file, line: lineNo, message: `${id}: rationale is empty` });
    for (const item of specCell.split(',').map((part) => part.trim())) {
      if (!SPEC_ITEM.test(item)) {
        problems.push({
          file,
          line: lineNo,
          message: `${id}: SPEC section "${item}" must be §N, §N.M, Appendix A, Appendix B or n/a`,
        });
      }
    }
    texts.push(`${decision}\n${rationale}`);
  }

  for (const { topic, patterns } of REQUIRED_DECISIONS) {
    if (!texts.some((row) => patterns.every((pattern) => pattern.test(row)))) {
      problems.push({ file, message: `required decision topic "${topic}" is missing` });
    }
  }
  return sorted(problems);
}

/** Heading level plus number token, with `Bijlage` mapped to `Appendix`. */
function headingKeys(text: string): string[] {
  const keys: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,3}) (.*)$/.exec(line);
    if (!match) continue;
    const level = match[1] ?? '';
    const title = match[2] ?? '';
    const appendix = /^(Appendix|Bijlage) ([A-Z])\b/.exec(title);
    if (appendix) keys.push(`${level} Appendix ${appendix[2]}`);
    else keys.push(`${level} ${title.split(/\s+/)[0] ?? ''}`);
  }
  return keys;
}

const countLines = (text: string, prefix: string): number =>
  text.split('\n').filter((line) => line.startsWith(prefix)).length;

/** The Dutch original is pinned and the English working copy keeps its structure (FND-05, D-14). */
export function checkSpecPair(root: string): Problem[] {
  const problems: Problem[] = [];
  const nl = readText(root, 'SPEC.nl.md');
  const en = readText(root, 'SPEC.md');

  const actual = sha256(root, 'SPEC.nl.md');
  if (actual === undefined) problems.push({ file: 'SPEC.nl.md', message: 'SPEC.nl.md is missing' });
  else if (actual !== SPEC_NL_SHA256) {
    problems.push({
      file: 'SPEC.nl.md',
      message: `SPEC.nl.md SHA-256 is ${actual}, expected ${SPEC_NL_SHA256} (the Dutch original is unchanged, DEC-001)`,
    });
  }
  if (en === undefined) {
    problems.push({ file: 'SPEC.md', message: 'SPEC.md is missing' });
    return sorted(problems);
  }

  if (nl !== undefined) {
    const nlKeys = headingKeys(nl);
    const enKeys = headingKeys(en);
    const nlSet = new Set(nlKeys);
    const enSet = new Set(enKeys);
    for (const key of nlKeys) {
      if (!enSet.has(key)) {
        problems.push({
          file: 'SPEC.md',
          message: `heading "${key}" of SPEC.nl.md is missing in SPEC.md`,
        });
      }
    }
    for (const key of enKeys) {
      if (!nlSet.has(key)) {
        problems.push({
          file: 'SPEC.md',
          message: `heading "${key}" of SPEC.md is missing in SPEC.nl.md`,
        });
      }
    }
    if (nlSet.size === enSet.size && [...nlSet].every((key) => enSet.has(key))) {
      if (nlKeys.join('\n') !== enKeys.join('\n')) {
        problems.push({ file: 'SPEC.md', message: 'heading order differs from SPEC.nl.md' });
      }
    }
    for (const [what, prefix] of [
      ['code fence', '```'],
      ['table row', '|'],
    ] as const) {
      const a = countLines(en, prefix);
      const b = countLines(nl, prefix);
      if (a !== b) {
        problems.push({
          file: 'SPEC.md',
          message: `${what} count is ${a} in SPEC.md but ${b} in SPEC.nl.md`,
        });
      }
    }
  }

  if (!en.includes('Precedence:')) {
    problems.push({
      file: 'SPEC.md',
      message: 'SPEC.md must state the order in a "Precedence:" line',
    });
  }

  const decisions = readText(root, 'DECISIONS.md');
  const known = decisions === undefined ? new Set<string>() : decisionIds(decisions);
  const cited = new Set(en.match(/DEC-[0-9]{3}/g) ?? []);
  for (const id of [...cited].sort()) {
    if (!known.has(id)) {
      problems.push({
        file: 'SPEC.md',
        message: `SPEC.md cites ${id}, which is not in DECISIONS.md`,
      });
    }
  }
  return sorted(problems);
}

/** The hand-written head of `.claude/CLAUDE.md` survives GSD regeneration (D-17, D-03, D-05, D-06). */
export function checkInstructionFile(root: string): Problem[] {
  const file = '.claude/CLAUDE.md';
  const text = readText(root, file);
  if (text === undefined) return [{ file, message: '.claude/CLAUDE.md is missing' }];

  const marker = text.indexOf('<!-- GSD:');
  const head = marker < 0 ? text : text.slice(0, marker);
  const problems: Problem[] = [];
  const missing = (what: string): void => {
    problems.push({ file, message: `missing above the GSD markers: ${what}` });
  };

  for (const needle of ['SPEC.md', 'DECISIONS.md', 'overrides']) {
    if (!head.includes(needle)) missing(needle);
  }
  if (!/ask the owner/i.test(head)) missing('ask the owner');
  for (const needle of INSTRUCTION_OVERRIDE_STRINGS) {
    if (!head.includes(needle)) missing(needle);
  }
  return sorted(problems);
}
