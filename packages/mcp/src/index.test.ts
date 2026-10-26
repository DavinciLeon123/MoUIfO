import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLOSING_SENTENCE, createServer, TOOL_ANNOTATIONS, TOOL_NAMES } from './index.ts';
import * as tools from './tools.ts';

test('the package entry re-exports createServer, the closing sentence, the tool names and the annotations', () => {
  expect(typeof createServer).toBe('function');
  expect(CLOSING_SENTENCE).toBe(tools.CLOSING_SENTENCE);
  expect(TOOL_NAMES).toBe(tools.TOOL_NAMES);
  expect(TOOL_ANNOTATIONS).toBe(tools.TOOL_ANNOTATIONS);
  expect(TOOL_NAMES).toHaveLength(6);
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
