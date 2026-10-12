import type { Problem } from 'uio-config';
import { type ParsedFile, positionOf } from './load.ts';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * One warning for each source file whose id no statement cites (D-11). `cited` is the set of source
 * ids that pass C recorded; the warning is positioned at the source's `id` value and never changes
 * the exit code. Callers pass structurally valid source files.
 */
export function uncitedSourceWarnings(
  sources: readonly ParsedFile[],
  cited: ReadonlySet<string>,
): Problem[] {
  const problems: Problem[] = [];
  for (const parsed of sources) {
    const id = asRecord(parsed.data)?.id;
    if (typeof id !== 'string' || cited.has(id)) continue;
    const { line, column } = positionOf(parsed, '/id', 'value');
    problems.push({
      file: parsed.path,
      line,
      column,
      severity: 'warning',
      message: `source "${id}" is not cited by any statement`,
    });
  }
  return problems;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Membership graph rules over structurally valid jurisdiction files (D-13).
 *
 * - A jurisdiction naming its own file in `part_of` is an error at that entry's `jurisdiction`
 *   value (and is not also a cycle).
 * - Every other cycle is reported once, as `part_of forms a cycle: A -> B -> A`, written from its
 *   smallest id, at the `jurisdiction` value of the first entry of that cycle (the entry in the
 *   smallest-id file that names the next jurisdiction). The search visits files and entries in
 *   sorted order, so the output does not depend on the order of `jurisdictions`. Where several
 *   cycles share edges, each distinct cycle the depth-first search closes is reported once.
 * - Several distinct parents are allowed: how inheritance combines them is Phase 5 logic (DEC-041).
 * - Targets that name no jurisdiction are reported by the `uioRef` pass, not here.
 */
export function checkPartOf(jurisdictions: readonly ParsedFile[]): Problem[] {
  type Edge = { to: string; parsed: ParsedFile; index: number };
  const files = new Map<string, ParsedFile>();
  for (const parsed of jurisdictions) {
    const id = asRecord(parsed.data)?.id;
    if (typeof id === 'string') files.set(id, parsed);
  }
  const ids = [...files.keys()].sort(compare);

  const problems: Problem[] = [];
  const edges = new Map<string, Edge[]>();
  for (const id of ids) {
    const parsed = files.get(id) as ParsedFile;
    const entries = asRecord(parsed.data)?.part_of;
    const out: Edge[] = [];
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const to = asRecord(entry)?.jurisdiction;
      if (typeof to !== 'string') return;
      if (to === id) {
        const { line, column } = positionOf(parsed, `/part_of/${index}/jurisdiction`, 'value');
        problems.push({
          file: parsed.path,
          line,
          column,
          message: 'a jurisdiction cannot be part of itself',
        });
      } else if (files.has(to)) {
        out.push({ to, parsed, index });
      }
    });
    edges.set(
      id,
      out.sort((a, b) => compare(a.to, b.to) || a.index - b.index),
    );
  }

  const done = new Set<string>();
  const onPath: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    onPath.push(id);
    for (const edge of edges.get(id) ?? []) {
      const at = onPath.indexOf(edge.to);
      if (at >= 0) {
        const members = onPath.slice(at);
        const start = members.indexOf([...members].sort(compare)[0] as string);
        const cycle = [...members.slice(start), ...members.slice(0, start)];
        const key = cycle.join(' ');
        if (reported.has(key)) continue;
        reported.add(key);
        const first = (edges.get(cycle[0] as string) ?? []).find(
          (candidate) => candidate.to === cycle[1],
        ) as Edge;
        const { line, column } = positionOf(
          first.parsed,
          `/part_of/${first.index}/jurisdiction`,
          'value',
        );
        problems.push({
          file: first.parsed.path,
          line,
          column,
          message: `part_of forms a cycle: ${[...cycle, cycle[0]].join(' -> ')}`,
        });
      } else if (!done.has(edge.to)) {
        visit(edge.to);
      }
    }
    onPath.pop();
    done.add(id);
  };
  for (const id of ids) if (!done.has(id)) visit(id);
  return problems;
}
