import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MCP_PACKAGE_DIR } from './index.ts';

test('MCP_PACKAGE_DIR names the package directory', () => {
  expect(MCP_PACKAGE_DIR).toBe('packages/mcp');
});

test('the engine resolves from source through its workspace package name, without a build', async () => {
  const enginePkg = JSON.parse(
    readFileSync(new URL('../../engine/package.json', import.meta.url), 'utf8'),
  );
  // The specifier is computed at runtime so no npm scope literal appears in any TypeScript file.
  const specifier: string = enginePkg.name;
  const engine = (await import(specifier)) as Record<string, unknown>;
  expect(engine.ENGINE_VERSION).toBe(enginePkg.version);
});
