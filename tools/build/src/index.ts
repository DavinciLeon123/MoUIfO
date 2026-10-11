import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { UioConfig } from 'uio-config';
import { checkPackageNames, loadConfig, REPO_ROOT, toAnnotation } from 'uio-config';

/**
 * Phase 1 build step: writes `dist/build-info.json` from config.yaml. No timestamps, fixed key
 * order and a single trailing LF keep the output byte-identical between runs.
 */
export function buildDist(root: string, cfg: UioConfig): string {
  const dir = join(root, 'dist');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'build-info.json');
  const info = { generator: 'uio-build', namespace: cfg.namespace, npm_scope: cfg.npm_scope };
  writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`);
  return path;
}

function main(): void {
  const { values } = parseArgs({ options: { root: { type: 'string' } }, strict: true });
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const cfg = loadConfig(root);

  const problems = checkPackageNames(cfg, root);
  if (problems.length > 0) {
    for (const problem of problems) console.log(toAnnotation(problem));
    process.exitCode = 1;
    return;
  }

  console.log(relative(root, buildDist(root, cfg)));
}

if (import.meta.main) main();
