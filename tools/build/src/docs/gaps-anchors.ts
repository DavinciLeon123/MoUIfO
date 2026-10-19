/**
 * Links from docs/model.md into docs/gaps.md (D-12). GitHub renders a `##` heading with an anchor
 * made from its text; `slug` reproduces that rule so a link can be written without a browser
 * (RESEARCH A5: matched for self-consistency, not seen on GitHub).
 */

/** One `##` section of docs/gaps.md. */
export type GapSection = { heading: string; slug: string; body: string };

/** The two sections of docs/gaps.md that are procedures, not open questions about a scheme. */
const PROCEDURE_HEADINGS: readonly string[] = [
  'Appendix B verification (DEC-049)',
  'End-of-phase human check',
];

/**
 * GitHub's heading anchor: lowercase, every character that is not a letter, a digit, a space, a
 * hyphen or an underscore dropped, each space turned into a hyphen. The `-1`, `-2` suffix of a
 * repeated heading is added by `gapSections`, which sees the whole file.
 */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * The `##` sections of docs/gaps.md in file order, without the two procedure sections. A heading
 * inside a fenced code block is not a heading. Repeated slugs are numbered `-1`, `-2` in file
 * order over all `##` headings, so the procedure sections still take part in the numbering.
 */
export function gapSections(gapsText: string): GapSection[] {
  const all: GapSection[] = [];
  const seen = new Map<string, number>();
  let fence: string | undefined;
  let current: { heading: string; slug: string; lines: string[] } | undefined;
  const close = (): void => {
    if (current !== undefined) {
      all.push({ heading: current.heading, slug: current.slug, body: current.lines.join('\n') });
    }
  };
  for (const line of gapsText.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker.startsWith(fence[0] ?? '') && marker.length >= fence.length)
        fence = undefined;
    }
    const heading = fence === undefined ? /^## +(.*?)\s*$/.exec(line)?.[1] : undefined;
    if (heading !== undefined) {
      close();
      const base = slug(heading);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      current = { heading, slug: count === 0 ? base : `${base}-${count}`, lines: [] };
    } else current?.lines.push(line);
  }
  close();
  return all.filter((section) => !PROCEDURE_HEADINGS.includes(section.heading));
}

/** The sections whose heading or body names the scheme id in backticks, in file order. */
export function gapLinksFor(sections: readonly GapSection[], schemeId: string): GapSection[] {
  const needle = `\`${schemeId}\``;
  return sections.filter(
    (section) => section.heading.includes(needle) || section.body.includes(needle),
  );
}
