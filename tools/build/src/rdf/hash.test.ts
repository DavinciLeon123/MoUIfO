import { describe, expect, test } from 'vitest';
import { canon, createMinter, hash8, type MintInput } from './hash.ts';
import { makeIris } from './iris.ts';

// A namespace that is not the project's: these tests must not depend on config.yaml.
const iris = makeIris('https://example.org/ns/');

const base: MintInput = {
  subjectId: 'eori',
  claim: 'issuer',
  subjectIri: iris.scheme('eori'),
  predicate: 'http://www.w3.org/ns/adms#schemaAgency',
  object: iris.authority('douane-nl'),
  qualifiers: {},
  condition: null,
  sourceId: 'commission-eori',
};

describe('canon', () => {
  test('sorts keys, so reversed keys give the text of the pre-sorted object', () => {
    const reversed = { b: 1, a: { d: 'x', c: [3, 2, 1] } };
    expect(canon(reversed)).toBe(JSON.stringify({ a: { c: [3, 2, 1], d: 'x' }, b: 1 }));
  });

  test('keeps the order of an array and of nested arrays', () => {
    expect(
      canon([
        [2, 1],
        ['b', 'a'],
      ]),
    ).toBe('[[2,1],["b","a"]]');
  });

  test('writes undefined and a missing value as null', () => {
    expect(canon(undefined)).toBe('null');
    expect(canon({ a: undefined })).toBe('{"a":null}');
    expect(canon([undefined, null])).toBe('[null,null]');
  });

  test('writes a non-ASCII string as JSON.stringify writes it', () => {
    expect(canon({ label: 'België' })).toBe(JSON.stringify({ label: 'België' }));
  });

  test('sorts keys by UTF-16 code unit, so uppercase comes before lowercase', () => {
    expect(canon({ a: 1, B: 2 })).toBe('{"B":2,"a":1}');
  });
});

describe('hash8', () => {
  test('is eight lowercase hexadecimal characters and stable', () => {
    expect(hash8('x')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash8('x')).toBe(hash8('x'));
    expect(hash8('x')).not.toBe(hash8('y'));
  });

  test('is the start of SHA-256 over the UTF-8 bytes', () => {
    expect(hash8('abc')).toBe('ba7816bf');
  });
});

describe('createMinter', () => {
  const iriOf = (input: MintInput): string => createMinter(iris).mint(input);

  test('gives the DEC-056 statement IRI with an 8-hex hash', () => {
    expect(iriOf(base)).toMatch(
      /^https:\/\/example\.org\/ns\/statement\/eori\/issuer-[0-9a-f]{8}$/,
    );
  });

  test('a change of certainty, note or position is not an input, so the IRI stays', () => {
    // MintInput carries none of the three; the same input mints the same IRI in any minter.
    expect(iriOf(base)).toBe(iriOf({ ...base }));
  });

  test.for([
    ['subject', { subjectIri: iris.scheme('other') }],
    ['predicate', { predicate: 'http://www.w3.org/ns/adms#other' }],
    ['object', { object: iris.authority('other') }],
    ['qualifier', { qualifiers: { event: 'merger' } }],
    ['condition', { condition: { issuing_country: 'NL' } }],
    ['source', { sourceId: 'other-source' }],
  ] as const)('a change of the %s changes the IRI', ([, change]) => {
    expect(iriOf({ ...base, ...change })).not.toBe(iriOf(base));
  });

  test('the same claim minted twice is a duplicate-claim problem and still returns the IRI', () => {
    const minter = createMinter(iris);
    const first = minter.mint(base);
    const second = minter.mint(base);
    expect(second).toBe(first);
    const [problem, ...rest] = minter.problems();
    expect(rest).toEqual([]);
    expect(problem).toContain('duplicate claim');
    expect(problem).toContain(first);
    expect(problem).toContain(iris.authority('douane-nl'));
  });

  test('two different canonical inputs with one IRI are a collision that prints both texts', () => {
    const minter = createMinter(iris, { hash: () => 'cafebabe' });
    const first = minter.mint(base);
    const other = { ...base, object: iris.authority('other') };
    const second = minter.mint(other);
    expect(second).toBe(first);
    const [problem, ...rest] = minter.problems();
    expect(rest).toEqual([]);
    expect(problem).toContain('statement hash collision');
    expect(problem).toContain(first);
    expect(problem).toContain(iris.authority('douane-nl'));
    expect(problem).toContain(iris.authority('other'));
    expect(problem).toContain(' versus ');
  });

  test('a minter without a repeated claim has no problems', () => {
    const minter = createMinter(iris);
    minter.mint(base);
    minter.mint({ ...base, claim: 'jurisdiction', object: iris.jurisdiction('NL') });
    expect(minter.problems()).toEqual([]);
  });
});
