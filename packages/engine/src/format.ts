import { CHECKSUMS, type ChecksumId } from './checksum/index.ts';
import { compilePattern, compileTransform } from './transform.ts';

/**
 * The format check of SPEC §5.6 check 4 (DEC-004, D-21, D-23, D-24). A value is accepted when some
 * pattern matches AND (the checksum list is absent or empty OR at least one checksum entry passes).
 * Checksum entries are any-of: the failing entries do not matter once one passes. An entry may first
 * select part of the value with `over` (a transform); when `over` gives no value the entry is
 * `not-applicable` and does not pass.
 */
export type FormatSpec = {
  patterns?: readonly { regex: string }[];
  checksum?: readonly { algorithm: string; over?: readonly unknown[] }[];
};

export type ChecksumOutcome = 'pass' | 'fail' | 'not-applicable';

export type FormatResult = {
  /** One flag per declared pattern, in declared order. */
  patterns: boolean[];
  /** One outcome per declared checksum entry, in declared order. */
  checksums: ChecksumOutcome[];
  accepted: boolean;
};

export type FormatError = { path: string; message: string };

export type FormatCompileResult =
  | { ok: true; check(value: string): FormatResult }
  | { ok: false; errors: FormatError[] };

type CompiledEntry = {
  algorithm: (value: string) => boolean;
  select: ((value: string) => string | null) | null;
};

export function compileFormat(spec: FormatSpec): FormatCompileResult {
  const errors: FormatError[] = [];

  const patterns: RegExp[] = [];
  (spec.patterns ?? []).forEach((pattern, index) => {
    const result = compilePattern(pattern.regex);
    if (result.ok) patterns.push(result.regex);
    else errors.push({ path: `/patterns/${index}/regex`, message: result.message });
  });

  const entries: CompiledEntry[] = [];
  (spec.checksum ?? []).forEach((entry, index) => {
    const known = Object.hasOwn(CHECKSUMS, entry.algorithm);
    if (!known) {
      errors.push({
        path: `/checksum/${index}/algorithm`,
        message: `unknown checksum algorithm "${entry.algorithm}"`,
      });
    }
    let select: CompiledEntry['select'] = null;
    if (entry.over !== undefined) {
      const transform = compileTransform(entry.over);
      if (transform.ok) {
        select = (value) => transform.run(value);
      } else {
        for (const error of transform.errors) {
          errors.push({ path: `/checksum/${index}/over/${error.step}`, message: error.message });
        }
      }
    }
    if (known) entries.push({ algorithm: CHECKSUMS[entry.algorithm as ChecksumId], select });
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    check(value) {
      const matched = patterns.map((regex) => regex.test(value));
      const checksums = entries.map((entry): ChecksumOutcome => {
        const subject = entry.select === null ? value : entry.select(value);
        if (subject === null) return 'not-applicable';
        return entry.algorithm(subject) ? 'pass' : 'fail';
      });
      const accepted =
        matched.some(Boolean) && (checksums.length === 0 || checksums.includes('pass'));
      return { patterns: matched, checksums, accepted };
    },
  };
}

/** Compile and check in one call; throws an Error listing the compile errors for an invalid spec. */
export function checkValue(spec: FormatSpec, value: string): FormatResult {
  const compiled = compileFormat(spec);
  if (!compiled.ok) {
    const lines = compiled.errors.map((error) => `${error.path}: ${error.message}`);
    throw new Error(`invalid format:\n${lines.join('\n')}`);
  }
  return compiled.check(value);
}
