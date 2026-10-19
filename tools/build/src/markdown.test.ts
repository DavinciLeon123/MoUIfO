import { describe, expect, test } from 'vitest';
import { mdCell, mdCode, mdText } from './markdown.ts';

/** The cells of one GFM table line: split on every `|` that no backslash escapes. */
function cellsOf(line: string): string[] {
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

describe('mdCell', () => {
  test('a regex with | becomes a cell with \\| and the table keeps its column count', () => {
    const cell = mdCell('^(a|b)$');
    expect(cell).toContain('\\|');
    expect(cell.replace(/\\\|/g, '')).not.toContain('|');
    const line = `| x | ${cell} | y |`;
    expect(cellsOf(line)).toHaveLength(3);
  });

  test('a value with a line break becomes one line', () => {
    expect(mdCell('one\ntwo\r\nthree\rfour')).toBe('one two three four');
  });

  test('<script> and every markup character are escaped', () => {
    const cell = mdCell('<script>alert(1)</script>');
    expect(cell).toBe('\\<script\\>alert(1)\\</script\\>');
    expect(/(?<!\\)[<>]/.test(cell)).toBe(false);
    expect(mdCell('a\\b*c_d[e]f&g`h')).toBe('a\\\\b\\*c\\_d\\[e\\]f\\&g\\`h');
  });

  test('plain text is unchanged', () => {
    expect(mdCell('National customs authority')).toBe('National customs authority');
  });
});

describe('mdText', () => {
  test('escapes markup and flattens line breaks but keeps a pipe', () => {
    expect(mdText('a|b\n*c*')).toBe('a|b \\*c\\*');
  });
});

describe('mdCode', () => {
  test('a regex with | stays in one code span with the pipe escaped', () => {
    expect(mdCode('^(a|b)$')).toBe('`^(a\\|b)$`');
  });

  test('a value with a backtick gets a longer fence', () => {
    expect(mdCode('a`b')).toBe('``a`b``');
    expect(mdCode('a``b')).toBe('```a``b```');
  });

  test('a value that starts or ends with a backtick is padded', () => {
    expect(mdCode('`a')).toBe('`` `a ``');
  });

  test('a line break becomes a space', () => {
    expect(mdCode('a\nb')).toBe('`a b`');
  });
});
