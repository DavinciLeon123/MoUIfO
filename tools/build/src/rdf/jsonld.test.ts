import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataFactory, type Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { beforeAll, describe, expect, test } from 'vitest';
import { renderArtefacts } from '../build.ts';
import { normaliseJson, refuseRemoteDocument, toJsonLd } from './jsonld.ts';
import { parseTurtle, prefixesFor } from './turtle.ts';

const { namedNode, literal, quad } = DataFactory;

let quads: Quad[] = [];
let namespace = '';

beforeAll(async () => {
  const cfg = loadConfig();
  namespace = cfg.namespace;
  const result = await renderArtefacts(REPO_ROOT, cfg);
  expect(result.problems).toEqual([]);
  const ttl = result.outputs.find((output) => output.name === 'uio.ttl')?.text ?? '';
  quads = parseTurtle(ttl);
});

describe('toJsonLd', () => {
  test('writes one flat document with an inline context equal to the Turtle prefixes', async () => {
    const text = await toJsonLd(quads, prefixesFor(namespace));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    const doc = JSON.parse(text) as { '@context': unknown; '@graph': { '@id': string }[] };
    expect(typeof doc['@context']).toBe('object');
    expect(doc['@context']).toEqual(prefixesFor(namespace));
    expect(Array.isArray(doc['@graph'])).toBe(true);
    const jsonld = (await import('jsonld')).default;
    const expanded = await jsonld.expand(doc as never, { documentLoader: refuseRemoteDocument });
    const ids = new Set(expanded.map((node) => node['@id']));
    for (const subject of new Set(quads.map((q) => q.subject.value))) {
      expect(ids.has(subject), subject).toBe(true);
    }
    expect(text).not.toContain('"_:');
  });

  test('shuffled input quads give the same text', async () => {
    const small = quads.slice(0, 400);
    const shuffled = [...small].reverse();
    const rotated = [...small.slice(137), ...small.slice(0, 137)];
    const context = prefixesFor(namespace);
    const reference = await toJsonLd(small, context);
    expect(await toJsonLd(shuffled, context)).toBe(reference);
    expect(await toJsonLd(rotated, context)).toBe(reference);
  });

  test('a remote context is refused by the loader, not fetched', async () => {
    const jsonld = (await import('jsonld')).default;
    const refused = await jsonld
      .compact(
        { '@id': 'https://example.org/a', 'https://example.org/p': 'x' },
        'https://example.org/context.jsonld' as never,
        { documentLoader: refuseRemoteDocument },
      )
      .then(
        () => undefined,
        (error: unknown) => error as { details?: { code?: string; cause?: Error } },
      );
    expect(refused).toBeDefined();
    expect(refused?.details?.code).toBe('loading remote context failed');
    expect(refused?.details?.cause?.message).toMatch(/remote document refused/);
  });

  test('the global document loader is replaced by the refusing one', async () => {
    const jsonld = (await import('jsonld')).default as unknown as { documentLoader: unknown };
    expect(jsonld.documentLoader).toBe(refuseRemoteDocument);
    await expect(refuseRemoteDocument('https://example.org/x')).rejects.toThrow(
      'remote document refused: https://example.org/x',
    );
  });

  test('a build still succeeds with fetch replaced by a throwing stub', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error('fetch must not be called');
    }) as typeof fetch;
    try {
      const text = await toJsonLd(
        [
          quad(
            namedNode('https://example.org/s'),
            namedNode('https://example.org/p'),
            literal('v'),
          ),
        ],
        { ex: 'https://example.org/' },
      );
      expect(JSON.parse(text)['@graph']).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});

describe('normaliseJson', () => {
  test('sorts object keys and arrays by their JSON text', () => {
    expect(JSON.stringify(normaliseJson({ b: [3, 1, 2], a: { d: 1, c: 2 } }))).toBe(
      '{"a":{"c":2,"d":1},"b":[1,2,3]}',
    );
    expect(JSON.stringify(normaliseJson([{ z: 1 }, { a: 1 }]))).toBe('[{"a":1},{"z":1}]');
  });
});

describe('jsonld import boundary', () => {
  test('only tools/build imports jsonld', () => {
    const files = [
      'tools/validate/src/api.ts',
      'packages/engine/package.json',
      'tools/guards/package.json',
    ];
    for (const file of files) {
      expect(readFileSync(join(REPO_ROOT, file), 'utf8')).not.toMatch(/from 'jsonld'|"jsonld"/);
    }
  });
});
