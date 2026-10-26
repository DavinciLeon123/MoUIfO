// Tests of the relation view model on the real model: WEB-03 and D-16 (every shortest chain of the
// engine's relate with the edge label from the model, the inverse marking, the sourced step and the
// parallel edges; a pair without a chain has no paths and the engine's warning, never a statement
// that the schemes are unrelated). No pasted value is involved.
import { describe, expect, test } from 'vitest';
import { createHost } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { relateView, schemeOptions } from './relate.ts';

const host = createHost(loadDistJson());
const ids = Object.keys(host.model.schemes);

describe('relateView', () => {
  test('rsin to eori: one chain of one inverse derived-from hop sourced to the Dutch customs page', () => {
    const view = relateView(host, 'rsin', 'eori');
    expect(view.paths).toHaveLength(1);
    const path = view.paths[0];
    expect(path?.certainty).toBe('likely');
    expect(path?.schemes).toEqual(['rsin', 'eori']);
    expect(path?.hops).toHaveLength(1);
    const hop = path?.hops[0];
    expect(hop?.from).toBe('rsin');
    expect(hop?.to).toBe('eori');
    expect(hop?.edgeType).toBe('relation');
    expect(hop?.edgeRef).toBe('derived-from');
    expect(hop?.edgeLabel.en).toBe('Derived from');
    expect(hop?.inverse).toBe(true);
    // The model states eori derived-from rsin; the chain walked it against that direction.
    expect(hop?.statedFrom).toBe('eori');
    expect(hop?.statedTo).toBe('rsin');
    expect(hop?.step.source?.id).toBe('douane-eori-nl');
    expect(hop?.step.certainty).toBe('certain');
    expect(path?.conclusion.key).toBe('relate.path');
    expect(path?.conclusion.params).toEqual({ a: 'rsin', b: 'eori', steps: '1' });
  });

  test('eori to rsin reads the same edge as stated, so the hop is not inverse', () => {
    const hop = relateView(host, 'eori', 'rsin').paths[0]?.hops[0];
    expect(hop?.inverse).toBe(false);
    expect(hop?.statedFrom).toBe('eori');
    expect(hop?.statedTo).toBe('rsin');
  });

  test('vat-nl to eori: one chain of two hops, the first as stated and the second inverse', () => {
    const view = relateView(host, 'vat-nl', 'eori');
    expect(view.paths).toHaveLength(1);
    const hops = view.paths[0]?.hops ?? [];
    expect(hops.map((hop) => [hop.from, hop.to])).toEqual([
      ['vat-nl', 'rsin'],
      ['rsin', 'eori'],
    ]);
    expect(hops.map((hop) => hop.inverse)).toEqual([false, true]);
  });

  test('peppol-id to kvk-number: the hop keeps the component edge as an also-via step', () => {
    const hop = relateView(host, 'peppol-id', 'kvk-number').paths[0]?.hops[0];
    expect(hop?.step.ref).toBe('peppol-id/relations/0');
    expect(hop?.alsoVia.some((step) => step.kind === 'component')).toBe(true);
  });

  test('bsn to eori: no path and the engine warning no-chain', () => {
    const view = relateView(host, 'bsn', 'eori');
    expect(view.paths).toEqual([]);
    expect(view.warnings.map((warning) => warning.code)).toEqual(['no-chain']);
  });

  test('eori to eori: no path and the engine warning same-scheme', () => {
    const view = relateView(host, 'eori', 'eori');
    expect(view.paths).toEqual([]);
    expect(view.warnings.map((warning) => warning.code)).toEqual(['same-scheme']);
  });

  test('over every ordered pair of distinct schemes: paths exactly when relate has them, every hop labelled', () => {
    let pairs = 0;
    let withChain = 0;
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        pairs += 1;
        const result = host.engine.relate(a, b);
        const view = relateView(host, a, b);
        expect(view.paths.length, `${a} to ${b}`).toBe(result.data.length);
        expect(view.warnings, `${a} to ${b}`).toEqual(result.warnings);
        if (view.paths.length > 0) withChain += 1;
        for (const path of view.paths) {
          expect(path.hops.length).toBeGreaterThan(0);
          for (const hop of path.hops) {
            expect(hop.edgeLabel.en, `${a} to ${b}`).not.toBe('');
            expect(hop.edgeRef, `${a} to ${b}`).not.toBe('');
          }
        }
      }
    }
    expect(pairs).toBe(ids.length * (ids.length - 1));
    expect(withChain).toBeGreaterThan(0);
  });
});

describe('schemeOptions', () => {
  test('lists every scheme of the model once, sorted by its label in the page language', () => {
    for (const lang of ['en', 'nl'] as const) {
      const options = schemeOptions(host, lang);
      expect(options.map((option) => option.id).sort()).toEqual([...ids].sort());
      const labels = options.map((option) => option.label.text);
      expect(labels).toEqual([...labels].sort((x, y) => x.localeCompare(y, lang)));
    }
  });
});
