import { compileFormat, type FormatCompileResult } from '@uio/engine';
import type { Problem } from 'uio-config';
import { type ParsedFile, positionOf } from './load.ts';

/** A format the engine compiled without errors; its `check` is the code the engine will run. */
export type CompiledFormat = Extract<FormatCompileResult, { ok: true }>;

const ALGORITHM_PATH = /^\/checksum\/\d+\/algorithm$/;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const schemeIdOf = (parsed: ParsedFile): string | undefined => {
  const id = asRecord(parsed.data)?.id;
  return typeof id === 'string' ? id : undefined;
};

/**
 * Locate `pointer` in `parsed` and build an error problem. Messages written by the checks in this
 * file name the index, the scheme and the failed check, and never a value from the file: model
 * examples may be mistyped personal numbers and the CI log is public.
 */
function problemAt(
  parsed: ParsedFile,
  pointer: string,
  message: string,
  target: 'value' | 'key' = 'value',
): Problem {
  const { line, column } = positionOf(parsed, pointer, target);
  return { file: parsed.path, line, column, message };
}

/**
 * Compile every scheme's `format` with the engine (SPEC 5.6 check 4, D-20, D-22): a pattern regex,
 * checksum algorithm or `over` step the engine cannot compile is a problem at its path under
 * `/format`. The compiled formats are keyed by scheme id, for the example checks. The validator
 * holds no pattern, checksum or transform logic of its own.
 */
export function checkFormats(schemes: readonly ParsedFile[]): {
  problems: Problem[];
  compiled: Map<string, CompiledFormat>;
} {
  const problems: Problem[] = [];
  const compiled = new Map<string, CompiledFormat>();
  for (const parsed of schemes) {
    const data = asRecord(parsed.data);
    const format = asRecord(data?.format);
    const id = schemeIdOf(parsed);
    if (format === undefined || id === undefined) continue;
    const result = compileFormat(format);
    if (result.ok) {
      compiled.set(id, result);
      continue;
    }
    for (const error of result.errors) {
      // An unknown algorithm is already reported by the checksum vocabulary reference (a test pins
      // the vocabulary to the engine's ids), so the engine's own message would repeat it.
      if (ALGORITHM_PATH.test(error.path)) continue;
      problems.push(problemAt(parsed, `/format${error.path}`, error.message));
    }
  }
  return { problems, compiled };
}

/**
 * SPEC 5.6 check 4 with DEC-039: an `examples_valid` value must be accepted by the engine's format
 * check (a pattern matches and, when entries exist, one checksum entry passes); an
 * `examples_invalid` value must not be. Pattern conditions are not evaluated, because an example
 * carries no context. A scheme whose format did not compile is skipped: its compile error explains
 * it.
 */
export function checkExamples(
  schemes: readonly ParsedFile[],
  compiled: ReadonlyMap<string, CompiledFormat>,
): Problem[] {
  const problems: Problem[] = [];
  for (const parsed of schemes) {
    const id = schemeIdOf(parsed);
    const format = id === undefined ? undefined : compiled.get(id);
    const spec = asRecord(asRecord(parsed.data)?.format);
    if (id === undefined || format === undefined || spec === undefined) continue;
    const algorithms = (Array.isArray(spec.checksum) ? spec.checksum : [])
      .map((entry) => asRecord(entry)?.algorithm)
      .filter((name): name is string => typeof name === 'string')
      .join(', ');

    const valid = Array.isArray(spec.examples_valid) ? spec.examples_valid : [];
    valid.forEach((value, index) => {
      if (typeof value !== 'string') return;
      const result = format.check(value);
      if (result.accepted) return;
      const reason = result.patterns.some(Boolean)
        ? `a pattern matches but every checksum entry fails (${algorithms})`
        : 'no pattern matches';
      problems.push(
        problemAt(
          parsed,
          `/format/examples_valid/${index}`,
          `example is not accepted: ${reason} (examples_valid[${index}] of ${id})`,
        ),
      );
    });

    const invalid = Array.isArray(spec.examples_invalid) ? spec.examples_invalid : [];
    invalid.forEach((value, index) => {
      if (typeof value !== 'string' || !format.check(value).accepted) return;
      problems.push(
        problemAt(
          parsed,
          `/format/examples_invalid/${index}`,
          `invalid example is accepted by the format (examples_invalid[${index}] of ${id})`,
        ),
      );
    });
  }
  return problems;
}
