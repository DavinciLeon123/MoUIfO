import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Vitest globalSetup for the mcp project (RESEARCH Pitfall 1): in CI `npm test` runs before
 * `npm run build:packages`, and `dist/` is gitignored, so the tests that spawn `dist/cli.js` build
 * what they need first: the engine, the mcp package, then the model copy. It rebuilds in place and
 * always, so a spawned test never sees a missing or stale dist. Test-only, never built or shipped.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
const COPY_MODEL = fileURLToPath(new URL('../../copy-model.ts', import.meta.url));

const STEPS: readonly { name: string; args: string[] }[] = [
  { name: 'tsc engine', args: [TSC, '-p', 'packages/engine/tsconfig.build.json'] },
  { name: 'tsc mcp', args: [TSC, '-p', 'packages/mcp/tsconfig.build.json'] },
  { name: 'copy model', args: [COPY_MODEL] },
];

export default function setup(): void {
  for (const step of STEPS) {
    const result = spawnSync(process.execPath, step.args, { cwd: ROOT, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(
        `mcp globalSetup step "${step.name}" failed (status ${String(result.status)})\n${result.stdout}\n${result.stderr}`,
      );
    }
  }
}
