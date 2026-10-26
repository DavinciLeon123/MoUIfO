// Tests of the How to verify model on the real model: WEB-06 and D-13 (only sourced register links),
// D-14 and T-07-05 (only http and https hrefs). No pasted value is involved.
import { describe, expect, test } from 'vitest';
import type { Conclusion } from '../engine-host.ts';
import { createHost } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { createVerifyIndex, safeHref, verifyTargets } from './verify.ts';

const host = createHost(loadDistJson());
const index = createVerifyIndex(host);

function conclusionOf(key: string, params: Record<string, string>): Conclusion {
  return { key, params, statement: key, certainty: 'certain', explanation: [] };
}

describe('createVerifyIndex (D-13)', () => {
  const ids = Object.keys(host.model.schemes);

  test('an entry is non-null exactly when describe holds a validation_source', () => {
    for (const id of ids) {
      const claim = host.engine.describe(id).data?.validation_source;
      expect(index.get(id) !== null, id).toBe(claim !== undefined);
    }
  });

  test('the number of links equals the number of schemes with a validation_source', () => {
    const linked = [...index.values()].filter((entry) => entry !== null).length;
    const sourced = Object.values(host.model.schemes).filter(
      (scheme) => scheme.validation_source !== undefined,
    ).length;
    expect(linked).toBe(sourced);
    expect(linked).toBeGreaterThan(0);
  });

  test('eori resolves to the European Commission host and bsn to no link', () => {
    const entry = index.get('eori');
    expect(entry).not.toBeNull();
    expect(safeHref(entry?.url)?.host).toBe('ec.europa.eu');
    expect(index.get('bsn')).toBeNull();
  });
});

describe('safeHref (D-14, T-07-05)', () => {
  test('accepts http and https and reports the host', () => {
    expect(safeHref('https://ec.europa.eu/taxation_customs/dds2/eos/')?.host).toBe('ec.europa.eu');
    expect(safeHref('http://example.org/a')?.href).toBe('http://example.org/a');
  });

  test('rejects javascript:, data: and ftp: URLs and an unparsable string', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('ftp://example.org/file')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe('verifyTargets', () => {
  test('a check.consistent conclusion points to its from and to schemes', () => {
    const conclusion = conclusionOf('check.consistent', {
      a: '0',
      b: '1',
      from: 'eori',
      to: 'rsin',
    });
    expect(verifyTargets(conclusion, host.model)).toEqual(['eori', 'rsin']);
  });

  test('a recognise.candidate conclusion points to its scheme', () => {
    expect(
      verifyTargets(conclusionOf('recognise.candidate', { scheme: 'eori' }), host.model),
    ).toEqual(['eori']);
  });

  test('relate.path uses a and b, and repeats are removed', () => {
    expect(
      verifyTargets(conclusionOf('relate.path', { a: 'rsin', b: 'eori' }), host.model),
    ).toEqual(['rsin', 'eori']);
    expect(
      verifyTargets(conclusionOf('check.consistent', { from: 'eori', to: 'eori' }), host.model),
    ).toEqual(['eori']);
  });

  test('an id that is not an own scheme (constructor, __proto__) is never returned', () => {
    for (const id of ['constructor', '__proto__', 'toString', 'unknown-scheme']) {
      expect(
        verifyTargets(conclusionOf('recognise.candidate', { scheme: id }), host.model),
      ).toEqual([]);
    }
  });
});
