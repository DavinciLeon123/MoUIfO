import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { checkModelJson } from 'uio-validate';
import { describe, expect, test, vi } from 'vitest';
import { normalise } from './model/normalise.ts';
import { sameTriples } from './rdf/equivalence.ts';
import { buildGraph } from './rdf/graph.ts';
import { RDF } from './rdf/iris.ts';
import { toJsonLd } from './rdf/jsonld.ts';
import { parseTurtle, prefixesFor, toTurtle } from './rdf/turtle.ts';
import { MINI_NAMESPACE, miniRawModel } from './testing.ts';

/**
 * Golden files of a synthetic mini-model (BLD-05, RESEARCH Pitfall 10): model.json, Turtle and
 * JSON-LD are compared byte for byte, so a dependency bump that changes the serialisation, or a
 * change of the model.json contract shape, fails on every CI Node version.
 *
 * A deliberate change rewrites the three files and is then reviewed in the diff:
 *   UIO_UPDATE_GOLDEN=1 npx vitest run --project tools tools/build/src/golden.test.ts
 */
vi.setConfig({ testTimeout: 30_000 });

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'mini');
const UPDATE = process.env.UIO_UPDATE_GOLDEN === '1';

const DEF = `${MINI_NAMESPACE}def#`;

async function render(): Promise<{
  'model.json.golden': string;
  'uio.ttl.golden': string;
  'uio.jsonld.golden': string;
}> {
  const model = normalise(miniRawModel(), '0.0.0');
  const graph = buildGraph(model, MINI_NAMESPACE);
  expect(graph.problems).toEqual([]);
  const prefixes = prefixesFor(MINI_NAMESPACE);
  return {
    'model.json.golden': `${JSON.stringify(model, null, 2)}\n`,
    'uio.ttl.golden': toTurtle(graph.quads, prefixes),
    'uio.jsonld.golden': await toJsonLd(graph.quads, prefixes),
  };
}

describe('the synthetic mini-model', () => {
  test('passes checkModelJson with no problem', () => {
    expect(checkModelJson(normalise(miniRawModel(), '0.0.0'))).toEqual([]);
  });

  test.each(['model.json.golden', 'uio.ttl.golden', 'uio.jsonld.golden'] as const)(
    '%s equals the committed golden file byte for byte',
    async (name) => {
      const text = (await render())[name];
      const path = join(GOLDEN_DIR, name);
      if (UPDATE) {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(path, text);
        return;
      }
      expect(text === readFileSync(path, 'utf8'), `${name} differs from ${path}`).toBe(true);
    },
  );

  test('the Turtle and the JSON-LD hold the same triples', async () => {
    const rendered = await render();
    const result = await sameTriples(rendered['uio.ttl.golden'], rendered['uio.jsonld.golden']);
    expect(result.firstDifference).toBeUndefined();
    expect(result.equal).toBe(true);
  });

  test('the Turtle holds a condition, a checksum over, applicability per status, trust and a rule', async () => {
    const quads = parseTurtle((await render())['uio.ttl.golden']);
    const type = `${RDF}type`;
    const has = (predicate: string, object?: string): boolean =>
      quads.some(
        (q) =>
          q.predicate.value === predicate && (object === undefined || q.object.value === object),
      );
    const statementsFor = (predicate: string): string[] =>
      quads
        .filter(
          (q) => q.predicate.value === `${DEF}predicate` && q.object.value === `${DEF}${predicate}`,
        )
        .map((q) => q.subject.value);

    expect(has(type, `${DEF}Condition`)).toBe(true);
    expect(has(`${DEF}over`)).toBe(true);
    expect(has(type, `${DEF}Rule`)).toBe(true);

    const applicability = statementsFor('applicability');
    expect(applicability).toHaveLength(2);
    const statuses = quads
      .filter(
        (q) => q.predicate.value === `${DEF}status` && applicability.includes(q.subject.value),
      )
      .map((q) => q.object.value.slice(q.object.value.lastIndexOf('/') + 1))
      .sort();
    expect(statuses).toEqual(['issued', 'recognised']);

    for (const term of [
      'trustLegalBasis',
      'trustVerifiability',
      'trustCrosswalks',
      'trustLifecycle',
    ]) {
      expect(statementsFor(term), term).toHaveLength(1);
    }
    expect(statementsFor('trustRegistrationQuality')).toHaveLength(0);
  });

  test('no golden file holds a nine-digit run or the project namespace', () => {
    const projectNamespace = loadConfig(REPO_ROOT).namespace;
    for (const name of ['model.json.golden', 'uio.ttl.golden', 'uio.jsonld.golden']) {
      const text = readFileSync(join(GOLDEN_DIR, name), 'utf8');
      expect(/(?<![0-9])[0-9]{9}(?![0-9])/.test(text), `${name} holds a nine-digit run`).toBe(
        false,
      );
      expect(text.includes(projectNamespace), `${name} holds the project namespace`).toBe(false);
    }
  });
});
