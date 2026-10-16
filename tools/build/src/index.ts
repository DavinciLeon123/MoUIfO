import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { UioConfig } from 'uio-config';
import { checkPackageNames, formatProblem, loadConfig, REPO_ROOT, toAnnotation } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';

/**
 * Phase 1 build step: writes `build-info.json` into `outDir` (default `<root>/dist`) from
 * config.yaml. No timestamps, fixed key order and a single trailing LF keep the output
 * byte-identical between runs.
 */
export function buildDist(
  root: string,
  cfg: UioConfig,
  outDir: string = join(root, 'dist'),
): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'build-info.json');
  const info = { generator: 'uio-build', namespace: cfg.namespace, npm_scope: cfg.npm_scope };
  writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`);
  return path;
}

function main(): void {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, out: { type: 'string' } },
    strict: true,
  });
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const outDir = values.out === undefined ? join(root, 'dist') : resolve(values.out);
  const cfg = loadConfig(root);

  const problems = checkPackageNames(cfg, root);
  if (problems.length > 0) {
    for (const problem of problems) console.log(toAnnotation(problem));
    process.exitCode = 1;
    return;
  }

  // The build reads the model only through the validator's loader: same discovery, parsing and
  // checks as `npm run validate`. A model with an error writes nothing.
  const loaded = loadValidatedModel(root);
  if (!loaded.ok) {
    const github = process.env.GITHUB_ACTIONS === 'true';
    for (const problem of loaded.problems) console.log(formatProblem(problem, { github }));
    console.log(`build: the model has ${loaded.problems.length} problems; run npm run validate`);
    process.exitCode = 1;
    return;
  }
  const { schemes, authorities, jurisdictions, sources, vocab } = loaded.model;
  const size = (table: Record<string, unknown>): number => Object.keys(table).length;
  console.log(
    `build: model loaded (${size(schemes)} schemes, ${size(authorities)} authorities, ${size(jurisdictions)} jurisdictions, ${size(sources)} sources, ${size(vocab)} vocabularies)`,
  );

  console.log(relative(root, buildDist(root, cfg, outDir)));
}

if (import.meta.main) main();
