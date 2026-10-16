import type { Model } from '@uio/engine';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from '../model/normalise.ts';
import { buildGraph } from './graph.ts';

const namespace = loadConfig().namespace;

function realModel(): Model {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model must load');
  return normalise(loaded.model, '0.0.0');
}

describe('buildGraph external IRIs', () => {
  test('the real model builds without a problem', () => {
    expect(buildGraph(realModel(), namespace).problems).toEqual([]);
  });

  test('a source url that Turtle cannot carry is a problem naming the file kind, id and field', () => {
    const model = realModel();
    const id = 'ucc-952-2013';
    const source = model.sources[id];
    if (source === undefined) throw new Error('the real model has the source');
    model.sources[id] = { ...source, url: 'https://example.org/a b' };
    const { problems, quads } = buildGraph(model, namespace);
    expect(quads).toEqual([]);
    expect(problems).toEqual([
      {
        file: `model/sources/${id}.yaml`,
        message: `sources/${id} url holds a character that Turtle cannot carry in an IRI`,
      },
    ]);
  });

  test('an eli that is not http or https is a problem', () => {
    const model = realModel();
    const id = 'ucc-952-2013';
    const source = model.sources[id];
    if (source === undefined) throw new Error('the real model has the source');
    model.sources[id] = { ...source, eli: 'urn:eli:x' };
    const { problems } = buildGraph(model, namespace);
    expect(problems.map((problem) => problem.message)).toEqual([
      `sources/${id} eli must start with http:// or https://`,
    ]);
  });
});
