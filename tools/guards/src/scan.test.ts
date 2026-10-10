import { describe, expect, test } from 'vitest';
import { isElfproef, mask, parseAddedLines, parseAllowlist, scanText } from './scan.ts';
import { firstSyntheticValid, makeSyntheticValid } from './testing.ts';

const PUBLIC_EXAMPLE = '001469630';
const NOBODY = new Set<string>();
const v = firstSyntheticValid();
// w comes from a later prefix, so it differs from v.
const w = firstSyntheticValid(String(Number(v.slice(0, 8)) + 1));

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('test helpers', () => {
  test('synthetic samples are valid, distinct and in the 9999 range', () => {
    expect(isElfproef(v)).toBe(true);
    expect(isElfproef(w)).toBe(true);
    expect(w).not.toBe(v);
    expect(v.startsWith('9999')).toBe(true);
  });

  test('makeSyntheticValid returns null when the check digit would be 10', () => {
    let nulls = 0;
    for (let n = 0; n < 11; n++) {
      if (makeSyntheticValid(String(99990000 + n)) === null) nulls++;
    }
    expect(nulls).toBeGreaterThan(0);
  });
});

describe('isElfproef', () => {
  test('accepts the public example and rejects a one-digit change', () => {
    expect(isElfproef(PUBLIC_EXAMPLE)).toBe(true);
    expect(isElfproef('001469631')).toBe(false);
  });

  test('rejects wrong length and non-digits', () => {
    expect(isElfproef('')).toBe(false);
    expect(isElfproef('00146963')).toBe(false);
    expect(isElfproef(`${PUBLIC_EXAMPLE}0`)).toBe(false);
    expect(isElfproef('00146963x')).toBe(false);
    expect(isElfproef('００１４６９６３０')).toBe(false);
  });

  test('accepts about one in eleven random 9-digit strings', () => {
    const rand = mulberry32(20261010);
    let hits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      let s = '';
      for (let d = 0; d < 9; d++) s += Math.floor(rand() * 10);
      if (isElfproef(s)) hits++;
    }
    const rate = hits / trials;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.1);
  });
});

describe('scanText', () => {
  test('finds a value at the right 1-based line and column', () => {
    expect(scanText(`first\nab ${v} cd\n`, NOBODY)).toEqual([{ line: 2, col: 4, value: v }]);
  });

  test('letters may touch the run', () => {
    const found = scanText(`NL${v}B01`, NOBODY);
    expect(found).toEqual([{ line: 1, col: 3, value: v }]);
  });

  test('a digit touching the run makes a longer run, which is not a finding', () => {
    expect(scanText(`1${v}`, NOBODY)).toEqual([]);
    expect(scanText(`${v}1`, NOBODY)).toEqual([]);
  });

  test('an 8-digit run is not a finding', () => {
    expect(scanText(v.slice(1), NOBODY)).toEqual([]);
  });

  test('ignores all zeros, invalid values and allow-listed values', () => {
    expect(scanText('000000000', NOBODY)).toEqual([]);
    expect(scanText('001469631', NOBODY)).toEqual([]);
    expect(scanText(PUBLIC_EXAMPLE, new Set([PUBLIC_EXAMPLE]))).toEqual([]);
    expect(scanText(PUBLIC_EXAMPLE, NOBODY)).toHaveLength(1);
    expect(scanText(v, new Set([PUBLIC_EXAMPLE]))).toHaveLength(1);
  });

  test('two values separated by one non-digit character give two findings', () => {
    const found = scanText(`${v},${w}`, NOBODY);
    expect(found).toEqual([
      { line: 1, col: 1, value: v },
      { line: 1, col: 11, value: w },
    ]);
  });

  test('findings are ordered by line, then column', () => {
    const found = scanText(`x ${w}\n${v} ${w}`, NOBODY);
    expect(found.map((f) => [f.line, f.col])).toEqual([
      [1, 3],
      [2, 1],
      [2, 11],
    ]);
  });

  test('empty input gives no findings', () => {
    expect(scanText('', NOBODY)).toEqual([]);
  });

  test('a 64-character hex digest embedding a value is blanked', () => {
    const hex = `${'a'.repeat(20)}${v}${'b'.repeat(35)}`;
    expect(hex).toHaveLength(64);
    expect(scanText(hex, NOBODY)).toEqual([]);
  });

  test('a shaNNN- integrity string embedding a value is blanked', () => {
    expect(scanText(`"integrity": "sha512-AAAA${v}BBBB/cccc=="`, NOBODY)).toEqual([]);
  });

  test('blanking keeps the columns of later text on the same line', () => {
    const hex = `${'c'.repeat(32)}${v}`;
    const text = `${hex} then ${w}`;
    const found = scanText(text, NOBODY);
    expect(found).toEqual([{ line: 1, col: text.indexOf(w) + 1, value: w }]);
  });

  test('CRLF input gives the same line numbers as LF input', () => {
    const lf = `a\nb ${v}\nc ${w}\n`;
    const crlf = lf.replaceAll('\n', '\r\n');
    expect(scanText(crlf, NOBODY)).toEqual(scanText(lf, NOBODY));
    expect(scanText(crlf, NOBODY).map((f) => f.line)).toEqual([2, 3]);
  });
});

describe('mask', () => {
  test('keeps only the last three digits', () => {
    expect(mask(v)).toBe(`******${v.slice(6)}`);
    expect(mask(v)).not.toContain(v.slice(0, 6));
  });
});

describe('parseAllowlist', () => {
  test('accepts entries with a reason, blank lines and comment lines', () => {
    const text = `# header\n\n${PUBLIC_EXAMPLE}  # public example RSIN\n${v} # synthetic test value\n`;
    expect(parseAllowlist(text)).toEqual(new Set([PUBLIC_EXAMPLE, v]));
  });

  test('an allow-list with only comments and blank lines is empty', () => {
    expect(parseAllowlist('# nothing yet\n\n   \n').size).toBe(0);
    expect(parseAllowlist('').size).toBe(0);
  });

  test('rejects an entry without a reason, naming the line', () => {
    expect(() => parseAllowlist(`# c\n${PUBLIC_EXAMPLE}\n`)).toThrow(/allow-list line 2/);
    expect(() => parseAllowlist(`${PUBLIC_EXAMPLE} #\n`)).toThrow(/allow-list line 1/);
    expect(() => parseAllowlist(`${PUBLIC_EXAMPLE} # \n`)).toThrow(/allow-list line 1/);
  });

  test('rejects an 8-digit value, letters and a 10-digit value', () => {
    expect(() => parseAllowlist('\n12345678  # short\n')).toThrow(/allow-list line 2/);
    expect(() => parseAllowlist('12345678a  # letters\n')).toThrow(/allow-list line 1/);
    expect(() => parseAllowlist('1234567890  # long\n')).toThrow(/allow-list line 1/);
  });

  test('rejects a duplicate entry, naming the line', () => {
    const text = `${PUBLIC_EXAMPLE}  # one\n${PUBLIC_EXAMPLE}  # two\n`;
    expect(() => parseAllowlist(text)).toThrow(/allow-list line 2/);
  });

  test('error messages never contain the offending value', () => {
    try {
      parseAllowlist(`${v}\n`);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(v);
    }
  });
});

describe('parseAddedLines', () => {
  const diff = [
    'diff --git a/a.txt b/a.txt',
    'index 1111111..2222222 100644',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,2 +5,3 @@',
    '+one',
    '-gone',
    '+two',
    '\\ No newline at end of file',
    '@@ -10 +20 @@',
    '+three',
    'diff --git a/img.png b/img.png',
    'index 3333333..4444444 100644',
    'Binary files a/img.png and b/img.png differ',
    'diff --git a/del.txt b/del.txt',
    'deleted file mode 100644',
    'index 5555555..0000000',
    '--- a/del.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-old',
    'diff --git a/dir/my file.txt b/dir/my file.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/dir/my file.txt\t',
    '@@ -0,0 +1 @@',
    '+spaced',
    'diff --git a/q.txt b/q.txt',
    '--- a/q.txt',
    '+++ "b/we\\tird.txt"',
    '@@ -0,0 +1,2 @@',
    '+++ b/looks-like-a-header',
    '+tail',
  ].join('\n');

  test('returns added lines with new-file line numbers and ignores everything else', () => {
    expect(parseAddedLines(diff)).toEqual([
      { path: 'a.txt', line: 5, text: 'one' },
      { path: 'a.txt', line: 6, text: 'two' },
      { path: 'a.txt', line: 20, text: 'three' },
      { path: 'dir/my file.txt', line: 1, text: 'spaced' },
      { path: '"we\\tird.txt"', line: 1, text: '++ b/looks-like-a-header' },
      { path: '"we\\tird.txt"', line: 2, text: 'tail' },
    ]);
  });

  test('empty input gives no added lines', () => {
    expect(parseAddedLines('')).toEqual([]);
  });

  test('added lines can be scanned for values', () => {
    const added = parseAddedLines(`+++ b/x.txt\n@@ -0,0 +1 @@\n+id ${v}\n`);
    expect(added).toEqual([{ path: 'x.txt', line: 1, text: `id ${v}` }]);
    expect(scanText(added[0]?.text ?? '', NOBODY)).toEqual([{ line: 1, col: 4, value: v }]);
  });
});
