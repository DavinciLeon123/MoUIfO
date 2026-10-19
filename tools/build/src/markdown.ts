/**
 * Escaping helpers for generated Markdown (GFM). Model text comes from pull requests, so every
 * piece of it is escaped before it reaches a committed `.md` file: no HTML, no link, no table
 * break (RESEARCH Pitfall 8).
 */

const BREAKS = /\r\n|\r|\n/g;

/** Backslash, markup, table and HTML characters; each gets a leading backslash. */
const MARKUP = /[\\*_[\]<>&`]/g;

/** Free text for a paragraph or a list item: markup escaped, every line break turned into a space. */
export function mdText(text: string): string {
  return text.replace(BREAKS, ' ').replace(MARKUP, (character) => `\\${character}`);
}

/** Text for a table cell: as `mdText`, and a `|` is escaped so the cell cannot end early. */
export function mdCell(text: string): string {
  return mdText(text).replace(/\|/g, '\\|');
}

/**
 * A code span for a paragraph or a list item: the fence is one backtick longer than the longest
 * backtick run, and a value that starts or ends with a backtick is padded with a space. A `|` is
 * left as it is, because a backslash inside a code span outside a table would be shown literally.
 */
export function mdSpan(value: string): string {
  const flat = value.replace(BREAKS, ' ');
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

/**
 * A code span for a table cell. The fence is one backtick longer than the longest
 * backtick run in the value; a value that starts or ends with a backtick is padded with a space.
 * A `|` is escaped as `\|`, which GFM requires even inside code in a table.
 */
export function mdCode(value: string): string {
  const flat = value.replace(BREAKS, ' ');
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat.replace(/\|/g, '\\|')}${pad}${fence}`;
}
