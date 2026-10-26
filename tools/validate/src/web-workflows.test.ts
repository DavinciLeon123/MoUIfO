// Shape test of the two website workflows and the Dependabot preact ignore.
// DEC-077 (Phase 7 decision D-18, requirement WEB-11): web-e2e.yml runs the Playwright suite on
// every pull request; pages.yml tests, deploys from main and smoke-tests the live URL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { checkWorkflows } from './workflow-rules.ts';

const WEB_E2E = '.github/workflows/web-e2e.yml';
const PAGES = '.github/workflows/pages.yml';
const DEPENDABOT = '.github/dependabot.yml';

// A GitHub Actions expression; built here so the source holds no literal placeholder.
const expr = (inner: string): string => `\${{ ${inner} }}`;

// biome-ignore lint/suspicious/noExplicitAny: parsed workflow YAML is inspected structurally
type Doc = any;

function load(rel: string): Doc {
  return parse(readFileSync(join(REPO_ROOT, rel), 'utf8'), { schema: 'core' });
}

const runsOf = (job: Doc): string[] =>
  job.steps.filter((s: Doc) => 'run' in s).map((s: Doc) => s.run as string);
const usesOf = (job: Doc): string[] =>
  job.steps.filter((s: Doc) => 'uses' in s).map((s: Doc) => s.uses as string);
const indexOfUses = (job: Doc, prefix: string): number =>
  job.steps.findIndex((s: Doc) => typeof s.uses === 'string' && s.uses.startsWith(prefix));

describe('web-e2e.yml', () => {
  const doc = load(WEB_E2E);
  const job = doc.jobs.e2e;

  test('triggers only on pull_request with read-only permissions', () => {
    expect(doc.on).toBe('pull_request');
    expect(doc.permissions).toEqual({ contents: 'read' });
  });

  test('uses only checkout then setup-node and runs the four steps in order', () => {
    expect(Object.keys(doc.jobs)).toEqual(['e2e']);
    expect(usesOf(job).map((u) => u.split('@')[0])).toEqual([
      'actions/checkout',
      'actions/setup-node',
    ]);
    expect(runsOf(job)).toEqual([
      'npm ci',
      'npm run build:dist',
      'npx playwright install --with-deps chromium',
      'npm run e2e -w packages/web',
    ]);
  });
});

describe('pages.yml', () => {
  const doc = load(PAGES);
  const deploy = doc.jobs.deploy;
  const smoke = doc.jobs['live-smoke'];

  test('triggers on push to main and workflow_dispatch only', () => {
    expect(Object.keys(doc.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(doc.on.push).toEqual({ branches: ['main'] });
  });

  test('has exactly the three workflow-level permissions', () => {
    expect(doc.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
  });

  test('deploys in the github-pages environment with the e2e gate before upload before deploy', () => {
    expect(deploy.environment.name).toBe('github-pages');
    expect(deploy.environment.url).toBe(expr('steps.deployment.outputs.page_url'));
    expect(deploy.outputs.page_url).toBe(expr('steps.deployment.outputs.page_url'));
    const e2e = deploy.steps.findIndex(
      (s: Doc) => typeof s.run === 'string' && s.run === 'npm run e2e -w packages/web',
    );
    const upload = indexOfUses(deploy, 'actions/upload-pages-artifact@');
    const deployStep = indexOfUses(deploy, 'actions/deploy-pages@');
    expect(e2e).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(e2e);
    expect(deployStep).toBeGreaterThan(upload);
    expect(deploy.steps[upload].with.path).toBe('packages/web/dist');
    expect(deploy.steps[deployStep].id).toBe('deployment');
  });

  test('live-smoke needs deploy and runs the eori and privacy tests on the live URL via env', () => {
    expect(smoke.needs).toBe('deploy');
    const step = smoke.steps.find(
      (s: Doc) => typeof s.run === 'string' && s.run.includes('e2e/eori.e2e.ts'),
    );
    expect(step.run).toBe(
      'npm run e2e -w packages/web -- --project=desktop e2e/eori.e2e.ts e2e/privacy.e2e.ts',
    );
    expect(step.env.PLAYWRIGHT_BASE_URL).toBe(expr('needs.deploy.outputs.page_url'));
  });
});

describe('repository rules', () => {
  test('checkWorkflows reports no problem for either workflow', () => {
    expect(checkWorkflows(REPO_ROOT)).toEqual([]);
  });

  test('Dependabot npm ignores preact (semver-major), xlsx and @types/node', () => {
    const dependabot = load(DEPENDABOT);
    const npm = dependabot.updates.find((u: Doc) => u['package-ecosystem'] === 'npm');
    const byName = (name: string): Doc =>
      npm.ignore.find((e: Doc) => e['dependency-name'] === name);
    expect(byName('preact')['update-types']).toEqual(['version-update:semver-major']);
    expect(byName('xlsx')).toBeDefined();
    expect(byName('@types/node')).toBeDefined();
  });
});
