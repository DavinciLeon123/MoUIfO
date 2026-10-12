import type { Problem } from 'uio-config';
import { type ParsedFile, positionOf } from './load.ts';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The kind of a scheme, from the bare form or the long form `{ value, source, certainty }`. */
function kindOf(data: Record<string, unknown>): unknown {
  const kind = data.kind;
  return asRecord(kind)?.value ?? kind;
}

/**
 * Cross-field and cross-file rules over structurally valid scheme files that the JSON Schema cannot
 * express (D-19):
 * - `kind: composite` (bare or long form) requires a `components` list, reported at the file root;
 *   any other kind with `components` is reported at the `components` key;
 * - a rule id is used once across all scheme files: files are read in sorted path order and the
 *   second use is reported at its `id` value.
 * Messages name the rule, never a value from the file.
 */
export function checkSchemes(schemes: readonly ParsedFile[]): Problem[] {
  const problems: Problem[] = [];
  const at = (
    parsed: ParsedFile,
    pointer: string,
    target: 'value' | 'key',
    message: string,
  ): void => {
    const { line, column } = positionOf(parsed, pointer, target);
    problems.push({ file: parsed.path, line, column, message });
  };

  const seen = new Set<string>();
  for (const parsed of [...schemes].sort((a, b) => compare(a.path, b.path))) {
    const data = asRecord(parsed.data);
    if (data === undefined) continue;

    const composite = kindOf(data) === 'composite';
    if (composite && !Array.isArray(data.components)) {
      at(parsed, '', 'value', 'kind: composite requires components');
    } else if (!composite && data.components !== undefined) {
      at(parsed, '/components', 'key', 'components are only allowed when kind is composite');
    }

    const rules = Array.isArray(data.rules) ? data.rules : [];
    rules.forEach((rule, index) => {
      const id = asRecord(rule)?.id;
      if (typeof id !== 'string') return;
      if (seen.has(id)) {
        at(
          parsed,
          `/rules/${index}/id`,
          'value',
          'duplicate rule id: each rule id may be used only once',
        );
      }
      seen.add(id);
    });
  }
  return problems;
}
