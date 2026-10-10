import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import { parse, stringify } from 'yaml';
import { checkWorkflows, EXPECTED_RUN_STEPS } from './workflow-rules.ts';

const CI = '.github/workflows/ci.yml';
const DEPENDABOT = '.github/dependabot.yml';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-workflows-'));
  scratch.push(root);
  for (const rel of [CI, DEPENDABOT]) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REPO_ROOT, rel), join(root, rel));
  }
  return root;
}

// biome-ignore lint/suspicious/noExplicitAny: fixtures poke at arbitrary parsed YAML
type Doc = any;

/** Parse a fixture file, apply one mutation to the object and write it back. */
function mutate(root: string, rel: string, fn: (doc: Doc) => void): void {
  const path = join(root, rel);
  const doc = parse(readFileSync(path, 'utf8'), { schema: 'core' }) as Doc;
  fn(doc);
  writeFileSync(path, stringify(doc, { schema: 'core' }));
}

// An expression opener, spelled out so the source holds no literal placeholder.
const EXPR = '$' + '{{';

const steps = (doc: Doc): Doc[] => doc.jobs.ci.steps;
const runStepIndex = (doc: Doc, run: string): number =>
  steps(doc).findIndex((step: Doc) => step.run === run);

describe('checkWorkflows', () => {
  test('returns no problems on the real files', () => {
    expect(checkWorkflows(REPO_ROOT)).toEqual([]);
  });

  test('returns no problems on an untouched round-tripped copy', () => {
    const root = fixture();
    mutate(root, CI, () => {});
    mutate(root, DEPENDABOT, () => {});
    expect(checkWorkflows(root)).toEqual([]);
  });

  test('EXPECTED_RUN_STEPS lists the eight run strings in CI order', () => {
    expect(EXPECTED_RUN_STEPS).toEqual([
      'npm ci',
      'npm run check',
      'npm run guard',
      'npm run guard -- --range "$BASE_SHA..$HEAD_SHA"',
      'npm run validate',
      'npm run build:dist',
      'npm test',
      'npm run build:packages',
    ]);
  });

  const cases: [string, string, (doc: Doc) => void][] = [
    [
      'a pull_request_target trigger',
      CI,
      (doc) => {
        doc.on.pull_request_target = null;
      },
    ],
    [
      'permissions other than exactly contents read',
      CI,
      (doc) => {
        doc.permissions = { contents: 'read', 'id-token': 'write' };
      },
    ],
    [
      'write permission on contents',
      CI,
      (doc) => {
        doc.permissions = { contents: 'write' };
      },
    ],
    [
      'an expression inside a run string',
      CI,
      (doc) => {
        steps(doc)[1].run = `echo ${EXPR} github.event.pull_request.title }}`;
      },
    ],
    [
      'a third-party action',
      CI,
      (doc) => {
        steps(doc).push({ uses: 'someone/else-action@v1' });
      },
    ],
    [
      'a matrix without Node 22',
      CI,
      (doc) => {
        doc.jobs.ci.strategy.matrix.node = [24];
      },
    ],
    [
      'fail-fast true',
      CI,
      (doc) => {
        doc.jobs.ci.strategy['fail-fast'] = true;
      },
    ],
    [
      'cancel-in-progress missing',
      CI,
      (doc) => {
        delete doc.concurrency['cancel-in-progress'];
      },
    ],
    [
      'checkout without fetch-depth 0',
      CI,
      (doc) => {
        delete steps(doc)[0].with['fetch-depth'];
      },
    ],
    [
      'checkout that persists credentials',
      CI,
      (doc) => {
        steps(doc)[0].with['persist-credentials'] = true;
      },
    ],
    [
      'two run steps swapped',
      CI,
      (doc) => {
        const list = steps(doc);
        const a = runStepIndex(doc, 'npm test');
        const b = runStepIndex(doc, 'npm run build:dist');
        [list[a], list[b]] = [list[b], list[a]];
      },
    ],
    [
      'the range step without its pull_request condition',
      CI,
      (doc) => {
        delete steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[3] ?? '')].if;
      },
    ],
    [
      'the range step without its BASE_SHA env',
      CI,
      (doc) => {
        delete steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[3] ?? '')].env.BASE_SHA;
      },
    ],
    [
      'a push trigger on another branch',
      CI,
      (doc) => {
        doc.on.push.branches = ['main', 'dev'];
      },
    ],
    [
      'a job name that no longer matches the protected check names',
      CI,
      (doc) => {
        doc.jobs.ci.name = `Build ${EXPR} matrix.node }}`;
      },
    ],
    [
      'dependabot interval weekly',
      DEPENDABOT,
      (doc) => {
        doc.updates[0].schedule.interval = 'weekly';
      },
    ],
    [
      'dependabot without the xlsx ignore',
      DEPENDABOT,
      (doc) => {
        doc.updates[0].ignore = doc.updates[0].ignore.filter(
          (entry: Doc) => entry['dependency-name'] !== 'xlsx',
        );
      },
    ],
    [
      'dependabot without the github-actions ecosystem',
      DEPENDABOT,
      (doc) => {
        doc.updates = doc.updates.filter(
          (entry: Doc) => entry['package-ecosystem'] !== 'github-actions',
        );
      },
    ],
  ];

  test.each(cases)('flags %s', (_label, rel, change) => {
    const root = fixture();
    mutate(root, rel, change);
    const problems = checkWorkflows(root);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems.every((p) => p.file.startsWith('.github/'))).toBe(true);
  });

  test('a missing ci.yml is a problem', () => {
    const root = fixture();
    rmSync(join(root, CI));
    expect(checkWorkflows(root).map((p) => p.file)).toContain(CI);
  });

  test('pull_request_target in an additional workflow file is flagged', () => {
    const root = fixture();
    writeFileSync(
      join(root, '.github/workflows/extra.yml'),
      'name: Extra\non:\n  pull_request_target:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    );
    const problems = checkWorkflows(root);
    expect(problems.map((p) => p.file)).toContain('.github/workflows/extra.yml');
  });
});
