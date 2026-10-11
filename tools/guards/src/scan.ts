// Personal-number scanner core (FND-07). Guard-local on purpose: it must keep working, and cannot be
// weakened by an engine change, regardless of what the Phase 2 engine kernel does.

/** Elfproef: 9*d1 + 8*d2 + ... + 2*d8 - d9 is a multiple of 11. Only zero is accepted. */
export function isElfproef(nine: string): boolean {
  if (!/^[0-9]{9}$/.test(nine)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * Number(nine[i]);
  sum -= Number(nine[8]);
  return sum % 11 === 0;
}

/** Exactly nine digits that are not part of a longer digit run. Letters may touch the run. */
export const NINE = /(?<![0-9])[0-9]{9}(?![0-9])/g;

/** Hex digests (32+ chars) and `shaNNN-` base64 integrity strings: blanked before scanning. */
export const NOISE = /\b[0-9a-fA-F]{32,}\b|\bsha(?:1|256|384|512)-[A-Za-z0-9+/=]{20,}/g;

export type Finding = { line: number; col: number; value: string };

export function scanText(text: string, allow: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  // Blank with spaces of the same length so that columns of the remaining text are unchanged.
  const blanked = text.replace(NOISE, (m) => ' '.repeat(m.length));
  for (const [i, raw] of blanked.split('\n').entries()) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    for (const m of line.matchAll(NINE)) {
      const value = m[0];
      if (value === '000000000' || allow.has(value) || !isElfproef(value)) continue;
      out.push({ line: i + 1, col: (m.index ?? 0) + 1, value });
    }
  }
  return out;
}

/** Six asterisks plus the last three digits: the only form of a flagged value that may be printed. */
export function mask(value: string): string {
  return `${'*'.repeat(6)}${value.slice(6)}`;
}

/** Parse the allow-list: `<9 digits>  # reason`, plus blank and `#` comment lines. */
export function parseAllowlist(text: string): Set<string> {
  const allowed = new Set<string>();
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const n = i + 1;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([0-9]{9})\s+#\s+(\S.*)$/.exec(line);
    // Never echo the offending text: it may be the very value the guard exists to keep out.
    if (!m?.[1]) {
      throw new Error(
        `allow-list line ${n}: expected '<9 digits>  # <reason>' (nine digits, then a stated reason)`,
      );
    }
    if (allowed.has(m[1])) throw new Error(`allow-list line ${n}: duplicate entry`);
    allowed.add(m[1]);
  }
  return allowed;
}

export type AddedLine = { path: string; line: number; text: string };

const HUNK = /^@@ -[0-9]+(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/;

/**
 * Added lines of a unified diff (`--unified=0`, rename detection off), with new-file line numbers.
 * Header lines (`+++`) are only recognised outside a hunk, so an added line whose text starts with
 * `++` is not mistaken for a header.
 */
export function parseAddedLines(diff: string): AddedLine[] {
  const out: AddedLine[] = [];
  let path: string | null = null;
  let next = 0;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      path = null;
      inHunk = false;
    } else if (inHunk && line.startsWith('+')) {
      if (path !== null) out.push({ path, line: next, text: line.slice(1) });
      next++;
    } else if (line.startsWith('@@')) {
      const m = HUNK.exec(line);
      if (m?.[1]) {
        next = Number(m[1]);
        inHunk = true;
      }
    } else if (!inHunk && line.startsWith('+++ ')) {
      path = headerPath(line.slice(4));
    }
  }
  return out;
}

function headerPath(raw: string): string | null {
  const rest = raw.endsWith('\t') ? raw.slice(0, -1) : raw; // git appends a tab after names with spaces
  if (rest === '/dev/null') return null;
  if (rest.startsWith('b/')) return rest.slice(2);
  if (rest.startsWith('"b/')) return `"${rest.slice(3)}`; // C-quoted path, kept as printed
  return rest;
}
