import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Problem } from 'uio-config';
import {
  ConfigError,
  checkPackageNames,
  findConfigLiterals,
  formatProblem,
  loadConfig,
  REPO_ROOT,
} from 'uio-config';
import { checkModel } from './model/check-model.ts';
import {
  checkDecisions,
  checkInstructionFile,
  checkLicences,
  checkPackageMetadata,
  checkSpecPair,
  checkWorkspaceTests,
} from './repo-rules.ts';
import { checkWorkflows } from './workflow-rules.ts';

/** Number of rule groups `runValidation` runs (printed by the CLI summary). */
export const RULE_COUNT = 10;

/** Run every repository rule against `root`; an empty array means the repository is valid. */
export function runValidation(root: string = REPO_ROOT): Problem[] {
  const problems: Problem[] = [];
  try {
    const cfg = loadConfig(root);
    problems.push(...checkPackageNames(cfg, root), ...findConfigLiterals(cfg, root));
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    problems.push({ file: 'config.yaml', message: error.message });
  }
  problems.push(
    ...checkPackageMetadata(root),
    ...checkWorkspaceTests(root),
    ...checkLicences(root),
    ...checkDecisions(root),
    ...checkSpecPair(root),
    ...checkInstructionFile(root),
    ...checkWorkflows(root),
    ...checkModel(root),
  );
  return problems;
}

/**
 * Render the problems in the order received, then the summary. Sorting stays with the rule
 * groups. Exit code 1 only when a problem is an error; a warning alone still passes.
 */
export function report(
  problems: readonly Problem[],
  options: { github: boolean },
): { lines: string[]; exitCode: number } {
  const lines = problems.map((problem) => formatProblem(problem, options));
  const warnings = problems.filter((problem) => problem.severity === 'warning').length;
  const errors = problems.length - warnings;
  if (errors > 0) {
    lines.push(`validate: ${errors} problems${warnings > 0 ? `, ${warnings} warnings` : ''}`);
    return { lines, exitCode: 1 };
  }
  lines.push(`validate: repository rules passed (${RULE_COUNT} rules)`);
  if (warnings > 0) lines.push(`validate: ${warnings} warnings`);
  return { lines, exitCode: 0 };
}

function main(): void {
  const { values } = parseArgs({ options: { root: { type: 'string' } }, strict: true });
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const { lines, exitCode } = report(runValidation(root), {
    github: process.env.GITHUB_ACTIONS === 'true',
  });
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}

if (import.meta.main) main();
