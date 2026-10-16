import { REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { checkExternalIri, makeIris } from './iris.ts';

describe('makeIris', () => {
  test.for(['https://example.org/ns/', 'http://example.net/a/b/'])(
    'builds every DEC-056 pattern on %s',
    (namespace) => {
      const iris = makeIris(namespace);
      expect(iris.statement('eori', 'issuer', 'deadbeef')).toBe(
        `${namespace}statement/eori/issuer-deadbeef`,
      );
      expect(iris.member('country-prefix', 'EL')).toBe(`${namespace}vocab/country-prefix/EL`);
      expect(iris.def('Statement')).toBe(`${namespace}def#Statement`);
      expect(iris.scheme('eori')).toBe(`${namespace}scheme/eori`);
      expect(iris.authority('kvk')).toBe(`${namespace}authority/kvk`);
      expect(iris.rule('eori-to-vat')).toBe(`${namespace}rule/eori-to-vat`);
      expect(iris.jurisdiction('NL')).toBe(`${namespace}jurisdiction/NL`);
      expect(iris.source('ucc-952-2013')).toBe(`${namespace}source/ucc-952-2013`);
      expect(iris.vocab('certainty')).toBe(`${namespace}vocab/certainty`);
      expect(iris.condition('0a1b2c3d')).toBe(`${namespace}condition/0a1b2c3d`);
      expect(iris.shape('scheme')).toBe(`${namespace}shape/scheme`);
    },
  );
});

describe('checkExternalIri', () => {
  test.for([
    ['a space', 'https://example.org/a b'],
    ['a less-than sign', 'https://example.org/a<b'],
    ['a greater-than sign', 'https://example.org/a>b'],
    ['a double quote', 'https://example.org/a"b'],
    ['an opening brace', 'https://example.org/a{b'],
    ['a closing brace', 'https://example.org/a}b'],
    ['a vertical bar', 'https://example.org/a|b'],
    ['a backslash', 'https://example.org/a\\b'],
    ['a caret', 'https://example.org/a^b'],
    ['a backtick', 'https://example.org/a`b'],
    ['a newline', 'https://example.org/a\nb'],
    ['a NUL character', `https://example.org/a${String.fromCharCode(0)}b`],
    ['a delete character', `https://example.org/a${String.fromCharCode(127)}b`],
  ] as const)('rejects %s', ([, value]) => {
    expect(checkExternalIri(value)).toEqual(expect.any(String));
  });

  test.for(['ftp://example.org/x', 'example.org/x', 'mailto:a@example.org', ''])(
    'rejects %j, which does not start with http:// or https://',
    (value) => {
      expect(checkExternalIri(value)).toEqual(expect.any(String));
    },
  );

  test('accepts a plain http and https IRI', () => {
    expect(checkExternalIri('http://data.europa.eu/eli/reg/2013/952/oj')).toBeUndefined();
    expect(
      checkExternalIri('https://eur-lex.europa.eu/eli/reg/2013/952/oj/eng?x=1#a'),
    ).toBeUndefined();
  });

  test('the message names the reason and never repeats the value', () => {
    const message = checkExternalIri('https://example.org/secret value') ?? '';
    expect(message).not.toContain('secret');
  });

  test('accepts every url and eli of the real model', () => {
    const loaded = loadValidatedModel(REPO_ROOT);
    if (!loaded.ok) throw new Error('the real model must load');
    const values: string[] = [];
    for (const source of Object.values(loaded.model.sources) as { url?: string; eli?: string }[]) {
      if (source.url !== undefined) values.push(source.url);
      if (source.eli !== undefined) values.push(source.eli);
    }
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(checkExternalIri(value)).toBeUndefined();
  });
});
