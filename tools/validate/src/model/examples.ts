import {
  compileFormat,
  compilePattern,
  compileTransform,
  type FormatCompileResult,
} from '@uio/engine';
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

    // DEC-039: a format without a pattern accepts nothing, and the reason names that.
    const declaresPattern = Array.isArray(spec.patterns) && spec.patterns.length > 0;

    const valid = Array.isArray(spec.examples_valid) ? spec.examples_valid : [];
    valid.forEach((value, index) => {
      if (typeof value !== 'string') return;
      const result = format.check(value);
      if (result.accepted) return;
      const reason = result.patterns.some(Boolean)
        ? `a pattern matches but every checksum entry fails (${algorithms})`
        : declaresPattern
          ? 'no pattern matches'
          : 'the format declares no pattern, so it accepts no value';
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

/**
 * SPEC 5.6 check 5 and 5.3: every rule's transform is compiled by the engine (a step it cannot
 * compile is a problem at `/rules/<i>/transform/<step>`), then each example `in` is run through it.
 * The result is validated against the output scheme's format when that scheme has a compiled one
 * (no format means only the comparison with `out` applies); a missing result, a result outside the
 * format or a result different from `out` is a problem at the example's `out`. A rule whose output
 * scheme is missing or structurally invalid is skipped: its own reference or schema error explains
 * it.
 */
export function checkRuleExamples(
  schemes: readonly ParsedFile[],
  compiled: ReadonlyMap<string, CompiledFormat>,
): Problem[] {
  const problems: Problem[] = [];
  const known = new Set(schemes.flatMap((parsed) => schemeIdOf(parsed) ?? []));
  for (const parsed of schemes) {
    const id = schemeIdOf(parsed);
    const rules = asRecord(parsed.data)?.rules;
    if (id === undefined || !Array.isArray(rules)) continue;
    rules.forEach((candidate, index) => {
      const rule = asRecord(candidate);
      if (rule === undefined || !Array.isArray(rule.transform)) return;
      const transform = compileTransform(rule.transform);
      if (!transform.ok) {
        for (const error of transform.errors) {
          problems.push(
            problemAt(parsed, `/rules/${index}/transform/${error.step}`, error.message),
          );
        }
        return;
      }
      const output = typeof rule.output === 'string' ? rule.output : undefined;
      if (output === undefined || !known.has(output)) return;
      const format = compiled.get(output);
      const examples = Array.isArray(rule.examples) ? rule.examples : [];
      examples.forEach((candidateExample, exampleIndex) => {
        const example = asRecord(candidateExample);
        if (typeof example?.in !== 'string') return;
        const where = `rules[${index}].examples[${exampleIndex}] of ${id}`;
        const report = (message: string): void => {
          problems.push(
            problemAt(
              parsed,
              `/rules/${index}/examples/${exampleIndex}/out`,
              `${message} (${where})`,
            ),
          );
        };
        const result = transform.run(example.in);
        if (result === null) {
          report('rule example gives no result');
          return;
        }
        if (format !== undefined && !format.check(result).accepted) {
          report(`rule output fails the format of ${output}`);
        }
        if (result !== example.out) report('rule example gives a different output');
      });
    });
  }
  return problems;
}

/**
 * D-18: a `context_from` capture regex must compile and its `group` must not exceed the regex's
 * group count (the engine reports it, the validator never runs the capture on examples: an
 * unmapped prefix at run time gives no context).
 */
export function checkContextFrom(schemes: readonly ParsedFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const parsed of schemes) {
    const contexts = asRecord(asRecord(parsed.data)?.context_from);
    if (contexts === undefined) continue;
    for (const [name, candidate] of Object.entries(contexts)) {
      const capture = asRecord(asRecord(candidate)?.capture);
      if (typeof capture?.regex !== 'string') continue;
      const base = `/context_from/${name}/capture`;
      const regex = compilePattern(capture.regex);
      if (!regex.ok) {
        problems.push(problemAt(parsed, `${base}/regex`, regex.message));
      } else if (typeof capture.group === 'number' && capture.group > regex.groups) {
        problems.push(
          problemAt(
            parsed,
            `${base}/group`,
            `group ${capture.group} is above the ${regex.groups} capture group(s) of the regex`,
          ),
        );
      }
    }
  }
  return problems;
}
