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

/**
 * Membership graph rules over structurally valid jurisdiction files (D-13). A jurisdiction naming
 * its own file in `part_of` is an error at that entry's `jurisdiction` value. Several distinct
 * parents are allowed: how inheritance combines them is Phase 5 logic (DEC-041). Targets that name
 * no jurisdiction are reported by the `uioRef` pass, not here.
 */
export function checkPartOf(jurisdictions: readonly ParsedFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const parsed of jurisdictions) {
    const data = asRecord(parsed.data);
    const id = data?.id;
    const entries = Array.isArray(data?.part_of) ? data.part_of : [];
    entries.forEach((entry, index) => {
      if (asRecord(entry)?.jurisdiction !== id) return;
      const { line, column } = positionOf(parsed, `/part_of/${index}/jurisdiction`, 'value');
      problems.push({
        file: parsed.path,
        line,
        column,
        message: 'a jurisdiction cannot be part of itself',
      });
    });
  }
  return problems;
}
