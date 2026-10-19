import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { describe, expect, test, vi } from 'vitest';
import { renderArtefacts } from '../build.ts';
import { declaredShapes, readShapes, validateShapes } from './shacl.ts';
import { parseTurtle } from './turtle.ts';

// The real-output test renders the whole build; under a loaded full run 5 s is too tight.
vi.setConfig({ testTimeout: 30_000 });

const namespace = loadConfig().namespace;

const shapeText = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'shapes', `${name}.ttl`), 'utf8');
const fixtureQuads = (name: string) =>
  parseTurtle(readFileSync(join(REPO_ROOT, 'shapes', 'fixtures', `${name}.fail.ttl`), 'utf8'));

const SH = 'http://www.w3.org/ns/shacl#';
const stemsOf = (directory: string, suffix: string): string[] =>
  readdirSync(join(REPO_ROOT, 'shapes', directory))
    .filter((name) => name.endsWith(suffix))
    .map((name) => name.slice(0, -suffix.length))
    .sort();

describe('one failing fixture per shape file (D-10)', () => {
  test('every shapes/<name>.ttl has shapes/fixtures/<name>.fail.ttl and the reverse', () => {
    expect(stemsOf('fixtures', '.fail.ttl')).toEqual(stemsOf('', '.ttl'));
    expect(stemsOf('', '.ttl')).toEqual(['condition', 'no-blank-nodes', 'scheme', 'statement']);
  });

  // The constraint components a fixture must trigger, so a shape that stops checking is caught.
  const EXPECTED: Record<string, string[]> = {
    statement: [],
    scheme: ['QualifiedMinCountConstraintComponent'],
    condition: ['ClassConstraintComponent', 'ClosedConstraintComponent'],
    'no-blank-nodes': ['NodeKindConstraintComponent'],
  };
  for (const [name, components] of Object.entries(EXPECTED)) {
    test(`shapes/${name}.ttl rejects its own fixture with results from its own shapes`, async () => {
      const text = shapeText(name);
      const report = await validateShapes([text], fixtureQuads(name));
      expect(report.conforms).toBe(false);
      expect(report.results.length).toBeGreaterThan(0);
      const declared = declaredShapes(text);
      for (const result of report.results) {
        expect([name, result.sourceShape, declared.has(result.sourceShape)]).toEqual([
          name,
          result.sourceShape,
          true,
        ]);
      }
      const seen = new Set(report.results.map((result) => result.component));
      for (const component of components) expect(seen.has(`${SH}${component}`)).toBe(true);
    });
  }
});

describe('shapes/statement.ttl', () => {
  test('rejects its fixture, and every named shape of the file reports at least one result', async () => {
    const text = shapeText('statement');
    const report = await validateShapes([text], fixtureQuads('statement'));
    expect(report.conforms).toBe(false);
    const declared = declaredShapes(text);
    const hit = new Set(report.results.map((result) => result.sourceShape));
    for (const result of report.results) expect(declared.has(result.sourceShape)).toBe(true);
    for (const name of [
      'Statement',
      'Statement-subject',
      'Statement-predicate',
      'Statement-object',
      'Statement-certainty',
      'Statement-source',
      'Statement-derived',
      'Statement-condition',
    ]) {
      expect([name, hit.has(`${namespace}shape/${name}`)]).toEqual([name, true]);
    }
  });

  test('accepts the real build output', async () => {
    const rendered = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(rendered.problems).toEqual([]);
    const turtle = rendered.outputs.find((output) => output.name === 'uio.ttl')?.text ?? '';
    const shapes = readShapes(REPO_ROOT);
    if (!Array.isArray(shapes)) throw new Error(shapes.problem.message);
    const report = await validateShapes(
      shapes.map((shape) => shape.text),
      parseTurtle(turtle),
    );
    expect(report.results).toEqual([]);
    expect(report.conforms).toBe(true);
  });
});
