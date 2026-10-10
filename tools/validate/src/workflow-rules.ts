import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from 'uio-config';
import { parse } from 'yaml';

const CI_FILE = '.github/workflows/ci.yml';
const DEPENDABOT_FILE = '.github/dependabot.yml';
const WORKFLOW_DIR = '.github/workflows';

/** The `run` strings of ci.yml in order; the fourth is the PR-commit guard (range mode). */
export const EXPECTED_RUN_STEPS: readonly string[] = [
  'npm ci',
  'npm run check',
  'npm run guard',
  'npm run guard -- --range "$BASE_SHA..$HEAD_SHA"',
  'npm run validate',
  'npm run build:dist',
  'npm test',
  'npm run build:packages',
];

const RANGE_STEP = EXPECTED_RUN_STEPS[3];

/** A GitHub Actions expression; built here so the source holds no literal placeholder. */
const expr = (inner: string): string => `\${{ ${inner} }}`;
const EXPR_OPEN = expr('').slice(0, 3);
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function load(root: string, file: string, problems: Problem[]): Json | undefined {
  const path = join(root, file);
  if (!existsSync(path)) {
    problems.push({ file, message: `${file} is missing` });
    return undefined;
  }
  try {
    const doc: unknown = parse(readFileSync(path, 'utf8'), { schema: 'core' });
    if (isRecord(doc)) return doc;
    problems.push({ file, message: 'the file must contain a mapping' });
  } catch (error) {
    problems.push({ file, message: `cannot parse YAML: ${(error as Error).message}` });
  }
  return undefined;
}

function stepsOf(job: unknown): Json[] {
  const raw = isRecord(job) ? job.steps : undefined;
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

/** Checks that hold for every workflow file (T-01-27 to T-01-30). */
function checkCommon(file: string, doc: Json, problems: Problem[]): void {
  const triggers = doc.on;
  const hasTarget =
    (isRecord(triggers) && 'pull_request_target' in triggers) ||
    triggers === 'pull_request_target' ||
    (Array.isArray(triggers) && triggers.includes('pull_request_target'));
  if (hasTarget) {
    problems.push({
      file,
      message: 'pull_request_target is forbidden: PR code must not run with a privileged token',
    });
  }

  const jobs = isRecord(doc.jobs) ? doc.jobs : {};
  for (const [jobId, job] of Object.entries(jobs)) {
    for (const step of stepsOf(job)) {
      if (typeof step.run === 'string' && step.run.includes(EXPR_OPEN)) {
        problems.push({
          file,
          message: `job ${jobId}: a run step contains a \${{ }} expression; pass values through env instead`,
        });
      }
      if (typeof step.uses === 'string' && !step.uses.startsWith('actions/')) {
        problems.push({
          file,
          message: `job ${jobId}: action "${step.uses}" is not a first-party actions/* action`,
        });
      }
    }
  }
}

function checkCi(doc: Json, problems: Problem[]): void {
  const file = CI_FILE;
  const bad = (message: string): void => {
    problems.push({ file, message });
  };

  const triggers = doc.on;
  if (!isRecord(triggers) || !('pull_request' in triggers)) bad('must trigger on pull_request');
  else {
    const push = triggers.push;
    const branches = isRecord(push) ? push.branches : undefined;
    if (!Array.isArray(branches) || branches.length !== 1 || branches[0] !== 'main') {
      bad('must run on pushes to main only (push.branches: [main])');
    }
  }

  const permissions = doc.permissions;
  if (
    !isRecord(permissions) ||
    Object.keys(permissions).length !== 1 ||
    permissions.contents !== 'read'
  ) {
    bad('top-level permissions must be exactly "contents: read"');
  }

  const concurrency = doc.concurrency;
  if (!isRecord(concurrency) || concurrency['cancel-in-progress'] !== true) {
    bad('concurrency.cancel-in-progress must be true');
  }

  const job = isRecord(doc.jobs) ? doc.jobs.ci : undefined;
  if (!isRecord(job)) {
    bad('job "ci" is missing');
    return;
  }
  if (job.name !== `Node ${expr('matrix.node')}`) {
    bad(
      'job name must stay "Node <matrix.node expression>" (branch protection matches "Node 22" and "Node 24")',
    );
  }
  const strategy = job.strategy;
  if (!isRecord(strategy) || strategy['fail-fast'] !== false)
    bad('strategy.fail-fast must be false');
  const matrix = isRecord(strategy) && isRecord(strategy.matrix) ? strategy.matrix.node : undefined;
  if (!Array.isArray(matrix) || matrix.join(',') !== '22,24') bad('matrix.node must be [22, 24]');

  const steps = stepsOf(job);
  const checkout = steps.find(
    (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'),
  );
  const withBlock = checkout && isRecord(checkout.with) ? checkout.with : {};
  if (!checkout) bad('the actions/checkout step is missing');
  else {
    if (withBlock['fetch-depth'] !== 0)
      bad('checkout must use fetch-depth: 0 so the PR commit range can be scanned');
    if (withBlock['persist-credentials'] !== false)
      bad('checkout must set persist-credentials: false');
  }

  const runs = steps.filter((step) => typeof step.run === 'string');
  const actual = runs.map((step) => step.run as string);
  if (actual.join('\n') !== EXPECTED_RUN_STEPS.join('\n')) {
    bad(`run steps must be, in order: ${EXPECTED_RUN_STEPS.join(' | ')}`);
  }

  const rangeStep = runs.find((step) => step.run === RANGE_STEP);
  if (rangeStep) {
    if (rangeStep.if !== "github.event_name == 'pull_request'") {
      bad("the PR-commit guard step must have: if: github.event_name == 'pull_request'");
    }
    const env = isRecord(rangeStep.env) ? rangeStep.env : {};
    if (env.BASE_SHA !== expr('github.event.pull_request.base.sha')) {
      bad('the PR-commit guard step must set BASE_SHA from github.event.pull_request.base.sha');
    }
    if (env.HEAD_SHA !== expr('github.event.pull_request.head.sha')) {
      bad('the PR-commit guard step must set HEAD_SHA from github.event.pull_request.head.sha');
    }
  }
}

function checkDependabot(doc: Json, problems: Problem[]): void {
  const file = DEPENDABOT_FILE;
  const bad = (message: string): void => {
    problems.push({ file, message });
  };
  const updates = Array.isArray(doc.updates) ? doc.updates.filter(isRecord) : [];

  for (const ecosystem of ['npm', 'github-actions']) {
    const entry = updates.find((update) => update['package-ecosystem'] === ecosystem);
    if (!entry) {
      bad(`updates must include the ${ecosystem} ecosystem`);
      continue;
    }
    const schedule = entry.schedule;
    if (!isRecord(schedule) || schedule.interval !== 'monthly')
      bad(`${ecosystem}: schedule.interval must be monthly`);
    if (!isRecord(entry.groups) || Object.keys(entry.groups).length === 0)
      bad(`${ecosystem}: updates must be grouped`);
  }

  const npm = updates.find((update) => update['package-ecosystem'] === 'npm');
  const ignore = npm && Array.isArray(npm.ignore) ? npm.ignore.filter(isRecord) : [];
  if (!ignore.some((entry) => entry['dependency-name'] === 'xlsx')) {
    bad('npm: must ignore the vendored xlsx dependency (never pull the stale registry copy)');
  }
  if (!ignore.some((entry) => entry['dependency-name'] === '@types/node')) {
    bad('npm: must ignore major @types/node bumps (stay on the Node 24 typings)');
  }
}

/** Security-relevant shape of the CI workflow and Dependabot configuration (FND-04, D-04, D-23). */
export function checkWorkflows(root: string): Problem[] {
  const problems: Problem[] = [];

  const ci = load(root, CI_FILE, problems);
  if (ci) checkCi(ci, problems);

  const dir = join(root, WORKFLOW_DIR);
  const files = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    : [];
  for (const name of files.sort()) {
    const file = `${WORKFLOW_DIR}/${name}`;
    const doc = file === CI_FILE ? ci : load(root, file, problems);
    if (doc) checkCommon(file, doc, problems);
  }

  const dependabot = load(root, DEPENDABOT_FILE, problems);
  if (dependabot) checkDependabot(dependabot, problems);

  return problems.sort(
    (a, b) =>
      compare(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compare(a.message, b.message),
  );
}
