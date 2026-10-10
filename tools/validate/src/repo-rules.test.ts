import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import {
  checkDecisions,
  checkInstructionFile,
  checkLicences,
  checkPackageMetadata,
  checkSpecPair,
  checkWorkspaceTests,
  REQUIRED_DECISIONS,
} from './repo-rules.ts';

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const COPIED = [
  'package.json',
  '.nvmrc',
  'LICENSE',
  'LICENSE-model',
  'README.md',
  'DECISIONS.md',
  'SPEC.md',
  'SPEC.nl.md',
  '.claude/CLAUDE.md',
  'sources/README.md',
  'packages/engine/package.json',
  'packages/mcp/package.json',
  'packages/web/package.json',
  'tools/build/package.json',
  'tools/config/package.json',
  'tools/guards/package.json',
  'tools/import/package.json',
  'tools/validate/package.json',
];
const TEST_STUBS = [
  'packages/engine/src/a.test.ts',
  'packages/mcp/src/a.test.ts',
  'packages/web/src/a.test.ts',
  'tools/build/src/a.test.ts',
  'tools/config/src/a.test.ts',
  'tools/guards/src/a.test.ts',
  'tools/import/src/a.test.ts',
  'tools/validate/src/a.test.ts',
];

/** A temp root holding a copy of every file the rules read, so a case can mutate one thing. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-rules-'));
  scratch.push(root);
  for (const rel of COPIED) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REPO_ROOT, rel), join(root, rel));
  }
  for (const rel of TEST_STUBS) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), '');
  }
  return root;
}

function edit(root: string, rel: string, fn: (text: string) => string): void {
  const path = join(root, rel);
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`fixture edit changed nothing in ${rel}`);
  writeFileSync(path, after);
}

const messages = (problems: { message: string }[]): string =>
  problems.map((p) => p.message).join('\n');

describe('on the real repository', () => {
  test.each([
    ['checkPackageMetadata', checkPackageMetadata],
    ['checkWorkspaceTests', checkWorkspaceTests],
    ['checkLicences', checkLicences],
    ['checkDecisions', checkDecisions],
    ['checkSpecPair', checkSpecPair],
    ['checkInstructionFile', checkInstructionFile],
  ])('%s returns no problems', (_name, rule) => {
    expect(rule(REPO_ROOT)).toEqual([]);
  });

  test('the unmodified fixture is clean for every rule', () => {
    const root = fixture();
    for (const rule of [
      checkPackageMetadata,
      checkWorkspaceTests,
      checkLicences,
      checkDecisions,
      checkSpecPair,
      checkInstructionFile,
    ]) {
      expect(rule(root)).toEqual([]);
    }
  });
});

describe('checkPackageMetadata', () => {
  test('flags a licence other than EUPL-1.2', () => {
    const root = fixture();
    edit(root, 'tools/guards/package.json', (t) => t.replace('EUPL-1.2', 'MIT'));
    const problems = checkPackageMetadata(root);
    expect(problems.map((p) => p.file)).toContain('tools/guards/package.json');
    expect(messages(problems)).toContain('EUPL-1.2');
  });

  test('flags a wrong engines.node on a tool, on the root and on a published package', () => {
    const root = fixture();
    edit(root, 'tools/config/package.json', (t) => t.replace('>=22.18', '>=22.12'));
    edit(root, 'package.json', (t) => t.replace('>=22.18', '>=20'));
    edit(root, 'packages/mcp/package.json', (t) => t.replace('>=22.12', '>=22.18'));
    const files = checkPackageMetadata(root).map((p) => p.file);
    expect(files).toContain('tools/config/package.json');
    expect(files).toContain('package.json');
    expect(files).toContain('packages/mcp/package.json');
  });

  test('flags .nvmrc other than 24', () => {
    const root = fixture();
    writeFileSync(join(root, '.nvmrc'), '22\n');
    expect(checkPackageMetadata(root).map((p) => p.file)).toContain('.nvmrc');
  });

  test('flags a runtime dependency in the engine', () => {
    const root = fixture();
    edit(root, 'packages/engine/package.json', (t) =>
      t.replace('"dependencies": {}', '"dependencies": { "left-pad": "1.0.0" }'),
    );
    const problems = checkPackageMetadata(root);
    expect(problems.map((p) => p.file)).toContain('packages/engine/package.json');
    expect(messages(problems)).toContain('dependencies');
  });
});

describe('checkWorkspaceTests', () => {
  test('flags a workspace without a src/**/*.test.ts', () => {
    const root = fixture();
    rmSync(join(root, 'tools/import/src/a.test.ts'));
    const problems = checkWorkspaceTests(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('tools/import/package.json');
  });

  test('accepts a nested test file', () => {
    const root = fixture();
    rmSync(join(root, 'tools/import/src/a.test.ts'));
    mkdirSync(join(root, 'tools/import/src/deep/er'), { recursive: true });
    writeFileSync(join(root, 'tools/import/src/deep/er/x.test.ts'), '');
    expect(checkWorkspaceTests(root)).toEqual([]);
  });
});

describe('checkLicences', () => {
  test('flags one changed byte in LICENSE and LICENSE-model', () => {
    const root = fixture();
    edit(root, 'LICENSE', (t) => `${t} `);
    edit(root, 'LICENSE-model', (t) => `${t} `);
    const files = checkLicences(root).map((p) => p.file);
    expect(files).toContain('LICENSE');
    expect(files).toContain('LICENSE-model');
  });

  test('flags a README.md that no longer names the licence scope', () => {
    for (const needle of ['LICENSE-model', 'sources/', 'docs/']) {
      const root = fixture();
      edit(root, 'README.md', (t) => t.replaceAll(needle, 'x'));
      const problems = checkLicences(root);
      expect(problems.map((p) => p.file)).toContain('README.md');
    }
  });

  test('flags a sources/README.md that no longer names LICENSE-model', () => {
    const root = fixture();
    edit(root, 'sources/README.md', (t) => t.replaceAll('LICENSE-model', 'x'));
    expect(checkLicences(root).map((p) => p.file)).toContain('sources/README.md');
  });
});

describe('checkDecisions', () => {
  const HEADER = '| id | date | decision | rationale | SPEC section affected |';

  test('REQUIRED_DECISIONS has 23 topics', () => {
    expect(REQUIRED_DECISIONS).toHaveLength(23);
  });

  test('flags a changed header', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) =>
      t.replace(HEADER, '| id | day | decision | rationale | SPEC section affected |'),
    );
    const problems = checkDecisions(root);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]?.file).toBe('DECISIONS.md');
  });

  test('flags a duplicated id and names it', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) => t.replace('| DEC-005 |', '| DEC-004 |'));
    expect(messages(checkDecisions(root))).toContain('DEC-004');
  });

  test('flags a descending id', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) =>
      t.replace('| DEC-005 |', '| DEC-002 |').replace('| DEC-004 |', '| DEC-005 |'),
    );
    expect(checkDecisions(root).length).toBeGreaterThan(0);
  });

  test('flags an impossible date', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) =>
      t.replace('| DEC-009 | 2026-10-09 |', '| DEC-009 | 2026-13-01 |'),
    );
    expect(messages(checkDecisions(root))).toContain('2026-13-01');
  });

  test('flags a malformed SPEC cell', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) => t.replace('| §8 |\n| DEC-010', '| section 5 |\n| DEC-010'));
    expect(messages(checkDecisions(root))).toContain('section 5');
  });

  test('flags an empty rationale', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) =>
      t.replace(/(\| DEC-011 \| [^|]+\| [^|]+\|)[^|]+(\|)/, '$1 $2'),
    );
    expect(checkDecisions(root).some((p) => p.message.includes('rationale'))).toBe(true);
  });

  test('flags a missing required topic by name', () => {
    const root = fixture();
    edit(root, 'DECISIONS.md', (t) => t.replaceAll('KBO', 'XYZ'));
    expect(messages(checkDecisions(root))).toContain('kbo-only');
  });

  test('every required topic passes against the committed log', () => {
    expect(checkDecisions(REPO_ROOT)).toEqual([]);
  });
});

describe('checkSpecPair', () => {
  test('flags a changed SPEC.nl.md', () => {
    const root = fixture();
    edit(root, 'SPEC.nl.md', (t) => `${t}\n`);
    expect(checkSpecPair(root).map((p) => p.file)).toContain('SPEC.nl.md');
  });

  test('flags a heading removed from SPEC.md', () => {
    const root = fixture();
    edit(root, 'SPEC.md', (t) => t.replace('### 5.3 Rules as data', 'Rules as data'));
    expect(messages(checkSpecPair(root))).toContain('heading');
  });

  test('flags a fence count mismatch', () => {
    const root = fixture();
    edit(root, 'SPEC.md', (t) => `${t}\n\`\`\`\n`);
    expect(messages(checkSpecPair(root))).toContain('fence');
  });

  test('flags a table-row count mismatch', () => {
    const root = fixture();
    edit(root, 'SPEC.md', (t) => `${t}\n| a | b |\n`);
    expect(messages(checkSpecPair(root))).toContain('table');
  });

  test('flags a missing Precedence line', () => {
    const root = fixture();
    edit(root, 'SPEC.md', (t) => t.replace('Precedence:', 'Order:'));
    expect(messages(checkSpecPair(root))).toContain('Precedence:');
  });

  test('flags a DEC id cited in SPEC.md but absent from DECISIONS.md', () => {
    const root = fixture();
    edit(root, 'SPEC.md', (t) => `${t}\nSee DEC-999.\n`);
    expect(messages(checkSpecPair(root))).toContain('DEC-999');
  });
});

describe('checkInstructionFile', () => {
  const MARKER = '<!-- GSD:project-start';

  test('flags the D-17 block moved below the first GSD marker', () => {
    const root = fixture();
    edit(root, '.claude/CLAUDE.md', (t) => {
      const at = t.indexOf(MARKER);
      return `${t.slice(at)}\n${t.slice(0, at)}`;
    });
    const problems = checkInstructionFile(root);
    expect(problems.length).toBeGreaterThan(0);
    expect(messages(problems)).toContain('missing above the GSD markers');
  });

  test('flags a missing "ask the owner"', () => {
    const root = fixture();
    edit(root, '.claude/CLAUDE.md', (t) => t.replace('Ask the owner', 'Consult someone'));
    expect(messages(checkInstructionFile(root))).toContain('ask the owner');
  });

  test.each([
    ['the heading', 'Overridden by DECISIONS.md', 'Overridden by DECISIONS.md'],
    ['the >=22.18 entry', '>=22.18', '>=22.18'],
    ['the server package entry', '@modelcontextprotocol/server', '@modelcontextprotocol/server'],
    ['the --error-on-warnings entry', '--error-on-warnings', '--error-on-warnings'],
  ])('flags %s removed, naming the missing string', (_label, needle, expectedInMessage) => {
    const root = fixture();
    edit(root, '.claude/CLAUDE.md', (t) => {
      const at = t.indexOf(MARKER);
      return t.slice(0, at).replaceAll(needle, 'REDACTED') + t.slice(at);
    });
    expect(messages(checkInstructionFile(root))).toContain(expectedInMessage);
  });

  test('an override value that appears only below the first GSD marker does not count', () => {
    const root = fixture();
    edit(root, '.claude/CLAUDE.md', (t) => {
      const at = t.indexOf(MARKER);
      return `${t.slice(0, at).replaceAll('DEC-014', 'DEC-0XX')}${t.slice(at)}\nDEC-014 appears down here\n`;
    });
    expect(messages(checkInstructionFile(root))).toContain('DEC-014');
  });
});
