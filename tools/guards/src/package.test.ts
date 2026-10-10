import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('uio-guards is a private ESM workspace with the project licence and Node floor', () => {
  expect(pkg.private).toBe(true);
  expect(pkg.type).toBe('module');
  expect(pkg.license).toBe('EUPL-1.2');
  expect(pkg.engines.node).toBe('>=22.18');
});
