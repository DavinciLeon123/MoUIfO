// View-model tests of the paste view on the real model: WEB-01 (call plan, consistency from check
// data), WEB-07 (normalised input, nothing rewritten) and the over-50 limit. The only nine-digit
// run is the public example RSIN of SPEC section 10 (allow-listed); the 51 lines are built at
// runtime from non-numeric strings.
import { describe, expect, test } from 'vitest';
import { createHost } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { normalise } from './normalise.ts';
import { MAX_VALUES, runPaste } from './paste.ts';

const { engine } = createHost(loadDistJson());

const EORI = 'NL001469630';
const VAT = 'NL001469630B01';
const RSIN = '001469630';

describe('normalise (WEB-07)', () => {
  test('splits on CRLF, CR and LF', () => {
    expect(normalise('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd']);
  });

  test('removes surrounding spaces and tabs and drops empty and blank lines', () => {
    expect(normalise(`  ${EORI}\t\n\n \t \n${RSIN}  `)).toEqual([EORI, RSIN]);
  });

  test('keeps inner spaces, lower case and punctuation exactly', () => {
    expect(normalise('nl 001.469-630 b01')).toEqual(['nl 001.469-630 b01']);
  });
});

describe('runPaste call plan (WEB-01)', () => {
  const run = runPaste(engine, [EORI, VAT, RSIN]);

  test('numbers the values 1 to 3 as they were passed', () => {
    expect(run.values.map((value) => [value.position, value.value])).toEqual([
      [1, EORI],
      [2, VAT],
      [3, RSIN],
    ]);
    expect(run.omitted).toBe(0);
  });

  test('gives three consistent pairs whose conclusions carry the 0-based positions', () => {
    expect(run.pairs.map((pair) => [pair.a, pair.b, pair.outcome])).toEqual([
      [1, 2, 'consistent'],
      [1, 3, 'consistent'],
      [2, 3, 'consistent'],
    ]);
    for (const pair of run.pairs) {
      expect(pair.conclusion?.params.a).toBe(String(pair.a - 1));
      expect(pair.conclusion?.params.b).toBe(String(pair.b - 1));
    }
  });

  test('shows possible-personal-identifier once for the bare value although three calls report it', () => {
    expect(
      run.values[0]?.warnings.filter((w) => w.code === 'possible-personal-identifier'),
    ).toEqual([]);
    const reported = [
      ...(run.values[2]?.recognise.warnings ?? []),
      ...(run.values[2]?.derive.warnings ?? []),
      ...(run.check?.warnings ?? []),
    ].filter((warning) => warning.code === 'possible-personal-identifier');
    expect(reported.length).toBeGreaterThanOrEqual(3);
    expect(
      run.values[2]?.warnings.filter((warning) => warning.code === 'possible-personal-identifier'),
    ).toHaveLength(1);
    expect(run.runWarnings).toEqual([]);
  });

  test('pairs the derivation conclusions of value 1 with their derived values', () => {
    const rows = (run.values[0]?.derivations ?? []).flatMap((row) =>
      row.derivation === null ? [] : [row.derivation],
    );
    expect(rows.find((each) => each.scheme === 'rsin')?.value).toBe(RSIN);
    expect(rows.some((each) => each.scheme === 'oin')).toBe(true);
  });

  test('passes every value to the engine as typed (lower case is not folded)', () => {
    const lower = runPaste(engine, [VAT.toLowerCase()]);
    expect(lower.values[0]?.value).toBe(VAT.toLowerCase());
    expect(lower.values[0]?.recognise.conclusions).toEqual([]);
  });
});

describe('runPaste edge cases', () => {
  test('a pair without a rule is a no-rule pair with no conclusion', () => {
    const run = runPaste(engine, [EORI, 'DE123456789012345']);
    expect(run.pairs).toHaveLength(1);
    expect(run.pairs[0]?.outcome).toBe('no-rule');
    expect(run.pairs[0]?.conclusion).toBeNull();
    const schemes = (run.values[1]?.derivations ?? []).map((row) => row.derivation?.scheme);
    expect(schemes).not.toContain('rsin');
    expect(schemes).not.toContain('vat-nl');
  });

  test('one value has no check and no pairs', () => {
    const run = runPaste(engine, [VAT]);
    expect(run.check).toBeNull();
    expect(run.pairs).toEqual([]);
  });

  test('past the limit only the first 50 values run and check carries too-many-values', () => {
    const lines = Array.from({ length: MAX_VALUES + 1 }, (_, index) => `x${'a'.repeat(index + 1)}`);
    const run = runPaste(engine, lines);
    expect(run.values).toHaveLength(MAX_VALUES);
    expect(run.omitted).toBe(1);
    expect(run.check?.warnings.map((warning) => warning.code)).toContain('too-many-values');
    expect(run.runWarnings.map((warning) => warning.code)).toContain('too-many-values');
    expect(run.pairs).toEqual([]);
  });

  test('exactly 50 values are not over the limit', () => {
    const lines = Array.from({ length: MAX_VALUES }, (_, index) => `x${'a'.repeat(index + 1)}`);
    const run = runPaste(engine, lines);
    expect(run.omitted).toBe(0);
    expect(run.check?.warnings.map((warning) => warning.code)).not.toContain('too-many-values');
  });

  test('a declared scheme derives the value as that scheme (DEC-067)', () => {
    const none = runPaste(engine, [RSIN]);
    expect(none.values[0]?.derivations).toEqual([]);
    const declared = runPaste(engine, [RSIN], new Map([[1, 'rsin']]));
    expect(declared.values[0]?.declared).toBe('rsin');
    const schemes = (declared.values[0]?.derivations ?? []).map((row) => row.derivation?.scheme);
    expect(schemes).toContain('eori');
  });
});
