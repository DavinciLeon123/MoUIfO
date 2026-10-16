import { readFileSync } from 'node:fs';
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
