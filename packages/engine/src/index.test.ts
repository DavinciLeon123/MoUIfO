import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ENGINE_VERSION } from './index.ts';

test('ENGINE_VERSION matches the version in package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(ENGINE_VERSION).toBe(pkg.version);
});
