import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { UioConfig } from 'uio-config';
import { checkPackageNames, formatProblem, loadConfig, REPO_ROOT, toAnnotation } from 'uio-config';
import { renderArtefacts, TARGETS, type Target } from './build.ts';

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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      out: { type: 'string' },
      target: { type: 'string' },
      'docs-out': { type: 'string' },
    },
    strict: true,
  });
  const target = values.target ?? 'dist';
  if (!(TARGETS as readonly string[]).includes(target)) {
    console.log(`build: --target must be one of ${TARGETS.join(', ')}, not ${target}`);
    process.exitCode = 1;
    return;
  }
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const outDir = values.out === undefined ? join(root, 'dist') : resolve(values.out);
  const docsOut =
    values['docs-out'] === undefined ? join(root, 'docs', 'model.md') : resolve(values['docs-out']);
  const cfg = loadConfig(root);

  const names = checkPackageNames(cfg, root);
  if (names.length > 0) {
    for (const problem of names) console.log(toAnnotation(problem));
    process.exitCode = 1;
    return;
  }

  // The build renders every artefact in memory first and writes only when no check found a
  // problem, so a model with an error writes nothing.
  const { problems, outputs, notes } = await renderArtefacts(root, cfg, {}, target as Target);
  if (problems.length > 0) {
    const github = process.env.GITHUB_ACTIONS === 'true';
    for (const problem of problems) console.log(formatProblem(problem, { github }));
    console.log(`build: the model has ${problems.length} problems; run npm run validate`);
    process.exitCode = 1;
    return;
  }
  for (const note of notes) console.log(note);

  for (const output of outputs) {
    const path = output.target === 'docs' ? docsOut : join(outDir, output.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, output.text);
    console.log(relative(root, path));
  }
  if (target !== 'docs') console.log(relative(root, buildDist(root, cfg, outDir)));
}

if (import.meta.main) await main();
