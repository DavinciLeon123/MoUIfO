import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { namespaceDrift, ONTOLOGY_FILE } from './rdf/ontology.ts';

const namespace = loadConfig().namespace;

/** The namespace with its last path segment replaced, built at runtime so no literal is written. */
const drifted = namespace.replace(/[^/]+\/$/, 'drifted/');

function turtleFiles(directory: string): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .flatMap((entry) =>
      entry.isDirectory()
        ? turtleFiles(join(directory, entry.name))
        : entry.name.endsWith('.ttl')
          ? [join(directory, entry.name)]
          : [],
    )
    .sort();
}

const sample = (prefixes: string, body = ''): string =>
  `${prefixes}\n<${namespace}thing> a <http://www.w3.org/2002/07/owl#Class> .\n${body}\n`;

describe('namespaceDrift on the hand-written files (DEC-058)', () => {
  test('ontology/uio-def.ttl holds no drifted IRI', async () => {
    const text = readFileSync(join(REPO_ROOT, ONTOLOGY_FILE), 'utf8');
    expect(await namespaceDrift(text, namespace)).toEqual([]);
  });

  const shapes = turtleFiles(join(REPO_ROOT, 'shapes'));
  test('every Turtle file under shapes/ holds no drifted IRI', async () => {
    for (const file of shapes) {
      const findings = await namespaceDrift(readFileSync(file, 'utf8'), namespace);
      expect([relative(REPO_ROOT, file), findings]).toEqual([relative(REPO_ROOT, file), []]);
    }
  });
});

describe('namespaceDrift on drifted text', () => {
  test('the correct prefixes give no finding', async () => {
    const text = sample(
      `@prefix uio: <${namespace}> .\n@prefix def: <${namespace}def#> .\n@prefix shape: <${namespace}shape/> .`,
    );
    expect(await namespaceDrift(text, namespace)).toEqual([]);
  });

  test('a def: prefix on another path under the same host is a finding', async () => {
    const text = sample(`@prefix def: <${drifted}def#> .`);
    const findings = await namespaceDrift(text, namespace);
    expect(findings.some((f) => f.startsWith('prefix def:'))).toBe(true);
  });

  test('a uio: prefix that differs from the namespace is a finding', async () => {
    const text = sample(`@prefix uio: <${drifted}> .`);
    expect((await namespaceDrift(text, namespace)).some((f) => f.startsWith('prefix uio:'))).toBe(
      true,
    );
  });

  test('a shape: prefix other than the namespace followed by shape/ is a finding', async () => {
    const text = sample(`@prefix shape: <${namespace}shapes/> .`);
    expect((await namespaceDrift(text, namespace)).some((f) => f.startsWith('prefix shape:'))).toBe(
      true,
    );
  });

  test('an absolute IRI on the namespace host outside the namespace is a finding', async () => {
    const text = sample('', `<${drifted}scheme/eori> a <http://www.w3.org/2002/07/owl#Class> .`);
    const findings = await namespaceDrift(text, namespace);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(`<${drifted}scheme/eori>`);
  });

  test('a text that uses only external vocabularies gives no finding', async () => {
    const text =
      '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n' +
      '<http://www.w3.org/ns/shacl#x> skos:prefLabel "x"@en ; dct:title "y" .\n';
    expect(await namespaceDrift(text, namespace)).toEqual([]);
  });

  test('text that is not Turtle rejects instead of passing silently', async () => {
    await expect(namespaceDrift('this is not turtle .', namespace)).rejects.toThrow();
  });
});
