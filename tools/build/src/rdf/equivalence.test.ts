import { loadConfig, REPO_ROOT } from 'uio-config';
import { beforeAll, describe, expect, test } from 'vitest';
import { renderArtefacts } from '../build.ts';
import { sameTriples } from './equivalence.ts';

let ttl = '';
let jsonLd = '';

beforeAll(async () => {
  const result = await renderArtefacts(REPO_ROOT, loadConfig());
  expect(result.problems).toEqual([]);
  ttl = result.outputs.find((output) => output.name === 'uio.ttl')?.text ?? '';
  jsonLd = result.outputs.find((output) => output.name === 'uio.jsonld')?.text ?? '';
});

type Node = Record<string, unknown>;
type Doc = { '@context': Record<string, string>; '@graph': Node[] };

describe('sameTriples', () => {
  test('the real build holds the same triples in both publications', async () => {
    const result = await sameTriples(ttl, jsonLd);
    expect(result.firstDifference).toBeUndefined();
    expect(result.equal).toBe(true);
    expect(result.sizes.ttl).toBe(result.sizes.jsonld);
    expect(result.sizes.ttl).toBeGreaterThan(1000);
  });

  test('is false when one triple is removed from the JSON-LD document', async () => {
    const doc = JSON.parse(jsonLd) as Doc;
    const node = doc['@graph'].find((n) => 'dct:source' in n || 'rdfs:label' in n);
    const key = node && ('dct:source' in node ? 'dct:source' : 'rdfs:label');
    expect(node).toBeDefined();
    delete (node as Node)[key as string];
    const result = await sameTriples(ttl, JSON.stringify(doc));
    expect(result.equal).toBe(false);
    expect(result.firstDifference).toContain('only in the Turtle');
  });

  test('is false when one literal datatype is changed', async () => {
    const changed = jsonLd.replace(
      /"@type": "xsd:(integer|date|boolean|dateTime)"/,
      '"@type": "xsd:string"',
    );
    expect(changed).not.toBe(jsonLd);
    const result = await sameTriples(ttl, changed);
    expect(result.equal).toBe(false);
    expect(result.firstDifference).toBeDefined();
  });

  test('is false when a blank node is added to either side', async () => {
    const doc = JSON.parse(jsonLd) as Doc;
    doc['@graph'].push({ '@id': '_:b0', 'rdfs:label': 'blank' });
    const jsonSide = await sameTriples(ttl, JSON.stringify(doc));
    expect(jsonSide.equal).toBe(false);
    expect(jsonSide.firstDifference).toContain('blank node');

    const turtleSide = await sameTriples(`${ttl}\n[] <https://example.org/p> "x" .\n`, jsonLd);
    expect(turtleSide.equal).toBe(false);
    expect(turtleSide.firstDifference).toContain('blank node');
  });

  test('needs no network: fetch is a throwing stub that is never called', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error('fetch must not be called');
    }) as typeof fetch;
    try {
      const rendered = await renderArtefacts(REPO_ROOT, loadConfig());
      expect(rendered.problems).toEqual([]);
      expect((await sameTriples(ttl, jsonLd)).equal).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});
