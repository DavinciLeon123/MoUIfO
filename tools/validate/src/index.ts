import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Problem } from 'uio-config';
import {
  ConfigError,
  checkPackageNames,
  findConfigLiterals,
  loadConfig,
  REPO_ROOT,
  toAnnotation,
} from 'uio-config';
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
const RULE_COUNT = 9;

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
  );
  return problems;
}

function main(): void {
  const { values } = parseArgs({ options: { root: { type: 'string' } }, strict: true });
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const problems = runValidation(root);
  if (problems.length > 0) {
    for (const problem of problems) console.log(toAnnotation(problem));
    console.log(`validate: ${problems.length} problems`);
    process.exitCode = 1;
    return;
  }
  console.log(`validate: repository rules passed (${RULE_COUNT} rules)`);
}

if (import.meta.main) main();
