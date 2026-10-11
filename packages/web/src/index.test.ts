import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { WEB_PACKAGE_DIR } from './index.ts';

test('WEB_PACKAGE_DIR names the package directory', () => {
  expect(WEB_PACKAGE_DIR).toBe('packages/web');
});

test('the web package carries the project licence', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(pkg.license).toBe('EUPL-1.2');
});
