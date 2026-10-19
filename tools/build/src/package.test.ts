import { readFileSync } from 'node:fs';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { expect, test } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const enginePkg = JSON.parse(
  readFileSync(new URL('../../../packages/engine/package.json', import.meta.url), 'utf8'),
);

test('uio-build is a private ESM workspace with the project licence and Node floor', () => {
  expect(pkg.private).toBe(true);
  expect(pkg.type).toBe('module');
  expect(pkg.license).toBe('EUPL-1.2');
  expect(pkg.engines.node).toBe('>=22.18');
});

test('the RDF toolchain packages are pinned to exact versions', () => {
  const exact = /^\d+\.\d+\.\d+$/;
  for (const name of ['n3', 'jsonld', 'rdf-validate-shacl', 'csv-stringify']) {
    expect(pkg.dependencies[name], name).toMatch(exact);
  }
  for (const name of ['@types/n3', '@types/jsonld']) {
    expect(pkg.devDependencies[name], name).toMatch(exact);
  }
  expect(pkg.dependencies.n3).toBe('2.13.11');
});

test('the workspaces the build reads are declared as * dependencies', () => {
  const scope = loadConfig(REPO_ROOT).npm_scope;
  for (const name of ['uio-config', 'uio-validate', `${scope}/engine`]) {
    expect(pkg.dependencies[name], name).toBe('*');
  }
  expect(pkg.devDependencies['uio-guards']).toBe('*');
});

test('the engine keeps empty dependencies', () => {
  expect(enginePkg.dependencies ?? {}).toEqual({});
});
