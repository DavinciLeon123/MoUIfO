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
      'npm run guard -- --allowlist-ref "$ALLOWLIST_REF"',
      'npm run guard -- --range "$BASE_SHA..$HEAD_SHA" --allowlist-ref "$BASE_SHA"',
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
      'the tree guard step without its env block',
      CI,
      (doc) => {
        delete steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[2] ?? '')].env;
      },
    ],
    [
      'the tree guard ALLOWLIST_REF built from the pull request head',
      CI,
      (doc) => {
        steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[2] ?? '')].env.ALLOWLIST_REF =
          `${EXPR} github.event.pull_request.head.sha || github.sha }}`;
      },
    ],
    [
      'the tree guard ALLOWLIST_REF built from github.sha only',
      CI,
      (doc) => {
        steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[2] ?? '')].env.ALLOWLIST_REF =
          `${EXPR} github.sha }}`;
      },
    ],
    [
      'the range guard step without --allowlist-ref',
      CI,
      (doc) => {
        steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[3] ?? '')].run =
          'npm run guard -- --range "$BASE_SHA..$HEAD_SHA"';
      },
    ],
    [
      'the tree guard step without --allowlist-ref',
      CI,
      (doc) => {
        steps(doc)[runStepIndex(doc, EXPECTED_RUN_STEPS[2] ?? '')].run = 'npm run guard';
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

  const treeIndex = (doc: Doc): number => runStepIndex(doc, EXPECTED_RUN_STEPS[2] ?? '');
  const rangeIndex = (doc: Doc): number => runStepIndex(doc, EXPECTED_RUN_STEPS[3] ?? '');
  const validateIndex = (doc: Doc): number => runStepIndex(doc, 'npm run validate');

  /** Replace every step after the two `uses` steps with one step that runs all eight commands. */
  const mergeAllRunSteps = (doc: Doc): void => {
    const list = steps(doc);
    list.splice(2, list.length - 2, {
      name: 'All',
      env: {
        ALLOWLIST_REF: `${EXPR} github.sha }}`,
        BASE_SHA: `${EXPR} github.sha }}`,
        HEAD_SHA: `${EXPR} github.sha }}`,
      },
      run: EXPECTED_RUN_STEPS.join('\n'),
    });
  };

  /** The tree and PR-commit guard commands as one multi-line run on the tree guard step. */
  const mergeGuardSteps = (doc: Doc): void => {
    const list = steps(doc);
    list[treeIndex(doc)].run = `${EXPECTED_RUN_STEPS[2]}\n${EXPECTED_RUN_STEPS[3]}`;
    list.splice(
      list.findIndex((step: Doc) => step.name === 'Personal-number guard (PR commits)'),
      1,
    );
  };

  /** Two adjacent commands as one multi-line run on the `npm ci` step. */
  const mergeCiAndCheck = (doc: Doc): void => {
    const list = steps(doc);
    list[runStepIndex(doc, 'npm ci')].run = `${EXPECTED_RUN_STEPS[0]}\n${EXPECTED_RUN_STEPS[1]}`;
    list.splice(runStepIndex(doc, 'npm run check'), 1);
  };

  const NO_COE = 'continue-on-error is not allowed';
  const IF_STEP = 'an if condition is only allowed on the PR-commit guard step';

  // WR-04 (D-25, D-30): each way to neutralise the guard or widen the token, one fixture each.
  // Presence of the key decides, whatever its value.
  const hardeningCases: [string, string, (doc: Doc) => void, string][] = [
    [
      'continue-on-error true on the tree guard step',
      CI,
      (doc) => {
        steps(doc)[treeIndex(doc)]['continue-on-error'] = true;
      },
      NO_COE,
    ],
    [
      'continue-on-error true on the PR-commit guard step',
      CI,
      (doc) => {
        steps(doc)[rangeIndex(doc)]['continue-on-error'] = true;
      },
      NO_COE,
    ],
    [
      'continue-on-error true on the Validate step',
      CI,
      (doc) => {
        steps(doc)[validateIndex(doc)]['continue-on-error'] = true;
      },
      NO_COE,
    ],
    [
      'continue-on-error true on job ci',
      CI,
      (doc) => {
        doc.jobs.ci['continue-on-error'] = true;
      },
      NO_COE,
    ],
    [
      'continue-on-error false on the tree guard step (presence decides)',
      CI,
      (doc) => {
        steps(doc)[treeIndex(doc)]['continue-on-error'] = false;
      },
      NO_COE,
    ],
    [
      'an if always() on the tree guard step',
      CI,
      (doc) => {
        steps(doc)[treeIndex(doc)].if = 'always()';
      },
      IF_STEP,
    ],
    [
      'an if false on the Validate step',
      CI,
      (doc) => {
        steps(doc)[validateIndex(doc)].if = 'false';
      },
      IF_STEP,
    ],
    [
      'the PR-commit guard step with a push condition',
      CI,
      (doc) => {
        steps(doc)[rangeIndex(doc)].if = "github.event_name == 'push'";
      },
      'the PR-commit guard step must have: if: github.event_name',
    ],
    [
      'a job-level if on job ci',
      CI,
      (doc) => {
        doc.jobs.ci.if = "github.event_name == 'push'";
      },
      'a job-level if is not allowed',
    ],
    [
      'job-level permissions contents write on job ci',
      CI,
      (doc) => {
        doc.jobs.ci.permissions = { contents: 'write' };
      },
      'job-level permissions are not allowed',
    ],
    [
      'job-level empty permissions on job ci (presence decides)',
      CI,
      (doc) => {
        doc.jobs.ci.permissions = {};
      },
      'job-level permissions are not allowed',
    ],
    [
      'a job calling a remote reusable workflow',
      CI,
      (doc) => {
        doc.jobs.remote = { uses: 'someone/repo/.github/workflows/x.yml@main' };
      },
      'job-level uses',
    ],
    [
      'a job calling a local reusable workflow',
      CI,
      (doc) => {
        doc.jobs.local = { uses: './.github/workflows/local.yml' };
      },
      'job-level uses',
    ],
    [
      'a workflow_run trigger in ci.yml (mapping form)',
      CI,
      (doc) => {
        doc.on.workflow_run = { workflows: ['CI'], types: ['completed'] };
      },
      'workflow_run is forbidden',
    ],
    [
      'an issue_comment trigger in ci.yml (mapping form, D-30)',
      CI,
      (doc) => {
        doc.on.issue_comment = { types: ['created'] };
      },
      'issue_comment is forbidden',
    ],
    [
      'two run steps merged into one multi-line run (npm ci and npm run check)',
      CI,
      mergeCiAndCheck,
      'run steps must be, in order',
    ],
    [
      'the two guard steps merged into one multi-line run',
      CI,
      mergeGuardSteps,
      'run steps must be, in order',
    ],
    [
      'the two guard steps merged into one multi-line run (PR-commit guard step missing)',
      CI,
      mergeGuardSteps,
      'the PR-commit guard step is missing',
    ],
    [
      'all run steps merged into one multi-line run with github.sha refs (verifier reproduction)',
      CI,
      mergeAllRunSteps,
      'run steps must be, in order',
    ],
    [
      'all run steps merged into one multi-line run (tree guard step missing)',
      CI,
      mergeAllRunSteps,
      'the tree guard step is missing',
    ],
    [
      'all run steps merged into one multi-line run (PR-commit guard step missing)',
      CI,
      mergeAllRunSteps,
      'the PR-commit guard step is missing',
    ],
    [
      'an actions/github-script step inserted before the tree guard step',
      CI,
      (doc) => {
        steps(doc).splice(treeIndex(doc), 0, {
          uses: 'actions/github-script@v7',
          with: { script: 'core.info("hi")' },
        });
      },
      'only actions/checkout and actions/setup-node may be used',
    ],
    [
      'an actions/github-script step inserted before the tree guard step (uses order)',
      CI,
      (doc) => {
        steps(doc).splice(treeIndex(doc), 0, {
          uses: 'actions/github-script@v7',
          with: { script: 'core.info("hi")' },
        });
      },
      'uses steps must be, in order',
    ],
    [
      'a second actions/checkout step that checks out another repository into tools',
      CI,
      (doc) => {
        steps(doc).splice(treeIndex(doc), 0, {
          uses: 'actions/checkout@v7',
          with: { repository: 'someone/else', path: 'tools' },
        });
      },
      'uses steps must be, in order',
    ],
    [
      'a local action step',
      CI,
      (doc) => {
        steps(doc).splice(treeIndex(doc), 0, { uses: './.github/actions/x' });
      },
      'only actions/checkout and actions/setup-node may be used',
    ],
    [
      'workflow-level env with NODE_OPTIONS',
      CI,
      (doc) => {
        doc.env = { NODE_OPTIONS: '--import=./x.js' };
      },
      'env is not allowed at workflow level',
    ],
    [
      'workflow-level empty env (presence decides)',
      CI,
      (doc) => {
        doc.env = {};
      },
      'env is not allowed at workflow level',
    ],
    [
      'workflow-level defaults with a no-op run shell',
      CI,
      (doc) => {
        doc.defaults = { run: { shell: 'true {0}' } };
      },
      'defaults is not allowed at workflow level',
    ],
    [
      'job-level env with npm_config_script_shell on job ci',
      CI,
      (doc) => {
        doc.jobs.ci.env = { npm_config_script_shell: '/bin/true' };
      },
      'job-level env is not allowed',
    ],
    [
      'job-level defaults with a no-op run shell on job ci',
      CI,
      (doc) => {
        doc.jobs.ci.defaults = { run: { shell: 'true {0}' } };
      },
      'job-level defaults is not allowed',
    ],
  ];

  test.each(hardeningCases)('flags %s', (_label, rel, change, fragment) => {
    const root = fixture();
    mutate(root, rel, change);
    const problems = checkWorkflows(root);
    expect(problems.some((p) => p.file === rel && p.message.includes(fragment))).toBe(true);
  });

  const EXTRA = '.github/workflows/extra.yml';
  const extraWorkflow = (on: string): string =>
    `name: Extra\n${on}\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;
  const forbiddenTriggers: [string, string][] = [
    ['workflow_run', 'workflow_run is forbidden'],
    ['issue_comment', 'issue_comment is forbidden'],
    ['pull_request_target', 'pull_request_target is forbidden'],
  ];
  const triggerForms: [string, (name: string) => string][] = [
    ['mapping', (name) => `on:\n  ${name}:`],
    ['string', (name) => `on: ${name}`],
    ['list', (name) => `on: [push, ${name}]`],
  ];
  const triggerRows = forbiddenTriggers.flatMap(([name, message]) =>
    triggerForms.map(([form, write]): [string, string, string] => [
      `${name} (${form} form)`,
      write(name),
      message,
    ]),
  );

  test.each(triggerRows)(
    'a forbidden trigger in an additional workflow file is flagged: %s',
    (_label, on, message) => {
      const root = fixture();
      writeFileSync(join(root, EXTRA), extraWorkflow(on));
      const problems = checkWorkflows(root);
      expect(problems.some((p) => p.file === EXTRA && p.message.includes(message))).toBe(true);
    },
  );

  const extraJobRows: [string, string, string][] = [
    [
      'a remote reusable workflow call with secrets inherit',
      '  x:\n    uses: someone/repo/.github/workflows/x.yml@main\n    secrets: inherit\n',
      'job-level uses',
    ],
    [
      'job-level permissions contents write',
      '  x:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/github-script@v7\n',
      'job-level permissions are not allowed',
    ],
    [
      'a job-level if',
      "  x:\n    runs-on: ubuntu-latest\n    if: github.event_name == 'push'\n    steps:\n      - run: echo hi\n",
      'a job-level if is not allowed',
    ],
  ];

  test.each(extraJobRows)(
    'a job-level rule in an additional workflow file is flagged: %s',
    (_label, job, message) => {
      const root = fixture();
      writeFileSync(join(root, EXTRA), `name: Extra\non:\n  workflow_dispatch:\njobs:\n${job}`);
      const problems = checkWorkflows(root);
      expect(problems.some((p) => p.file === EXTRA && p.message.includes(message))).toBe(true);
    },
  );

  test('checkout and setup-node bumped to a new major ref still pass', () => {
    const root = fixture();
    mutate(root, CI, (doc) => {
      steps(doc)[0].uses = 'actions/checkout@v8';
      steps(doc)[1].uses = 'actions/setup-node@v8';
    });
    expect(checkWorkflows(root)).toEqual([]);
  });

  test('a job-level rule in ci.yml yields exactly one problem', () => {
    const root = fixture();
    mutate(root, CI, (doc) => {
      doc.jobs.ci.permissions = {};
    });
    const problems = checkWorkflows(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('job-level permissions are not allowed');
    expect(problems[0]?.message).toContain('job ci');
  });

  test('an additional workflow file with an allowed trigger passes', () => {
    const root = fixture();
    writeFileSync(join(root, EXTRA), extraWorkflow('on:\n  workflow_dispatch:'));
    expect(checkWorkflows(root)).toEqual([]);
  });

  test('each violation yields exactly one problem and the order is stable', () => {
    const root = fixture();
    mutate(root, CI, (doc) => {
      steps(doc)[treeIndex(doc)]['continue-on-error'] = true;
      doc.jobs.ci.if = "github.event_name == 'push'";
    });
    const first = checkWorkflows(root);
    const second = checkWorkflows(root);
    expect(first).toHaveLength(2);
    expect(first.filter((p) => p.message.includes(NO_COE))).toHaveLength(1);
    expect(first.filter((p) => p.message.includes('a job-level if is not allowed'))).toHaveLength(
      1,
    );
    expect(first.every((p) => p.message.includes('job ci'))).toBe(true);
    expect(second).toEqual(first);
  });
});
