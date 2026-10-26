// Manifest checks of the web package: FND-02 (the project licence on every workspace) and DEC-076
// (the build and browser-test scripts). It also gives the workspace the one src/**/*.test.ts the
// repository rule checkWorkspaceTests requires.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the web package carries the project licence', () => {
  expect(pkg.license).toBe('EUPL-1.2');
});

test('the web package needs Node 22.18 or later', () => {
  expect(pkg.engines.node).toBe('>=22.18');
});

test('the web package builds with Vite and runs its browser tests with Playwright', () => {
  expect(pkg.scripts.build).toBe('vite build');
  expect(pkg.scripts.e2e).toBe('playwright test');
});
