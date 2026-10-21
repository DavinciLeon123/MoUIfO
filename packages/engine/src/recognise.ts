import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { evaluateCondition, type Known, mergeKnown, valueContext } from './conditions.ts';
import {
  chainCertainty,
  checksumStep,
  conclusion,
  dedupeSteps,
  patternStep,
  type StatementLike,
} from './explain.ts';
import type { ChecksumOutcome } from './format.ts';
import type { Certainty, Conclusion, Result, Step, Warning } from './types.ts';

/** The longest value recognise reads; a longer one gives no candidate (T-05-07). */
export const MAX_INPUT_LENGTH = 256;

export type ComponentMatch = { prefix: string; scheme: string; candidates: Candidate[] };

export type Candidate = {
  scheme: string;
  accepted: boolean;
  certainty: Certainty;
  format: { patterns: boolean[]; pattern: number | null };
  checksum: {
    outcomes: ChecksumOutcome[];
    result: 'pass' | 'fail' | 'none';
    entry: number | null;
  };
  explanation: Step[];
  components?: ComponentMatch[];
};

type Option = { index: number; steps: Step[]; certainty: Certainty; unconditional: boolean };

/** A statement with its condition evaluated; null when the condition is false (the entry drops). */
function option(
  compiled: CompiledModel,
  index: number,
  step: Step,
  statement: StatementLike,
  known: Known,
): Option | null {
  const evaluated = evaluateCondition(statement.condition, known, step.ref);
  if (evaluated.state === 'false') return null;
  const steps = [step, ...evaluated.steps];
  const certainty = chainCertainty(compiled, steps);
  const condition = statement.condition;
  const unconditional = condition === undefined || Object.keys(condition).length === 0;
  return { index, steps, certainty, unconditional };
}

/** Highest effective certainty, then an entry without a condition, then the lowest index. */
function decide(compiled: CompiledModel, options: readonly Option[]): Option | null {
  let best: Option | null = null;
  for (const each of options) {
    if (best === null) {
      best = each;
      continue;
    }
    const rankEach = compiled.rank.get(each.certainty) ?? 0;
    const rankBest = compiled.rank.get(best.certainty) ?? 0;
    if (rankEach > rankBest) best = each;
    else if (rankEach === rankBest && each.unconditional && !best.unconditional) best = each;
  }
  return best;
}

/**
 * Evaluate one scheme against a value (SPEC §6.2, DEC-063): the kernel check, then the conditions
 * of the matching patterns and of the checksum entries against the known context merged with the
 * issuing country the value carries. Returns null when no pattern that applies matches. Only the
 * deciding pattern and the deciding checksum entry enter the explanation, because both lists are
 * any-of. A context conflict between `known` and the value is added to `warnings`.
 */
export function evaluateCandidate(
  compiled: CompiledModel,
  schemeId: string,
  value: string,
  known: Known,
  warnings: Warning[] = [],
): Candidate | null {
  const entry = compiled.schemes.get(schemeId);
  if (entry === undefined || entry.check === null) return null;
  const format = entry.scheme.format;
  if (format === undefined) return null;
  const result = entry.check(value);

  const merged = mergeKnown(
    known,
    valueContext(compiled, schemeId, value),
    `${schemeId}/context_from/issuing_country`,
  );
  warnings.push(...merged.warnings);

  const patterns: Option[] = [];
  (format.patterns ?? []).forEach((pattern, index) => {
    if (result.patterns[index] !== true) return;
    const step = patternStep(compiled, schemeId, index, pattern);
    const each = option(compiled, index, step, pattern, merged.known);
    if (each !== null) patterns.push(each);
  });
  const decidingPattern = decide(compiled, patterns);
  if (decidingPattern === null) return null;

  const declared = format.checksum ?? [];
  const checksums: Option[] = [];
  declared.forEach((checksum, index) => {
    const step = checksumStep(compiled, schemeId, index, checksum);
    const each = option(compiled, index, step, checksum, merged.known);
    if (each !== null) checksums.push(each);
  });

  let checksumResult: Candidate['checksum']['result'] = 'none';
  let decidingChecksum: Option | null = null;
  let explanation = [...decidingPattern.steps];
  if (declared.length > 0) {
    decidingChecksum = decide(
      compiled,
      checksums.filter((each) => result.checksums[each.index] === 'pass'),
    );
    if (decidingChecksum !== null) {
      checksumResult = 'pass';
      explanation = [...explanation, ...decidingChecksum.steps];
    } else {
      checksumResult = 'fail';
      for (const each of checksums) explanation = [...explanation, ...each.steps];
    }
  }
  explanation = dedupeSteps(explanation);

  const accepted = checksumResult !== 'fail';
  const certainty: Certainty = accepted ? chainCertainty(compiled, explanation) : 'possible';

  return {
    scheme: schemeId,
    accepted,
    certainty,
    format: { patterns: result.patterns, pattern: decidingPattern.index },
    checksum: {
      outcomes: result.checksums,
      result: checksumResult,
      entry: decidingChecksum === null ? null : decidingChecksum.index,
    },
    explanation,
  };
}

function emptyResult(code: string, message: string): Result<Candidate[]> {
  return { data: [], conclusions: [], warnings: [{ code, message }] };
}

/**
 * Recognise a value (SPEC §6.2, DEC-063): every scheme whose pattern matches the whole trimmed
 * value, each with its format and checksum result apart, accepted candidates first, then certainty
 * (highest first), then scheme id. Only surrounding whitespace is trimmed; no case is folded.
 * `hint` is accepted for the ranking of plan 05-04 and is not read yet.
 */
export function recognise(
  compiled: CompiledModel,
  value: unknown,
  _hint?: { country?: string },
): Result<Candidate[]> {
  if (typeof value !== 'string') {
    return emptyResult('invalid-input', 'the value must be a string');
  }
  const trimmed = value.trim();
  if (trimmed === '') return emptyResult('empty-input', 'the value is empty');
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return emptyResult('input-too-long', `the value is longer than ${MAX_INPUT_LENGTH} characters`);
  }

  const warnings: Warning[] = [];
  const empty: Known = new Map();
  const candidates: Candidate[] = [];
  for (const id of compiled.schemeIds) {
    const candidate = evaluateCandidate(compiled, id, trimmed, empty, warnings);
    if (candidate !== null) candidates.push(candidate);
  }
  candidates.sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    const byRank = (compiled.rank.get(b.certainty) ?? 0) - (compiled.rank.get(a.certainty) ?? 0);
    return byRank !== 0 ? byRank : byCodeUnit(a.scheme, b.scheme);
  });

  const conclusions: Conclusion[] = candidates.map((candidate) => {
    const label = compiled.schemes.get(candidate.scheme)?.scheme.label.en ?? candidate.scheme;
    const params = { scheme: candidate.scheme };
    if (candidate.accepted) {
      return conclusion(
        compiled,
        'recognise.candidate',
        params,
        `The value has the format of ${label} (${candidate.scheme}).`,
        candidate.explanation,
      );
    }
    return {
      ...conclusion(
        compiled,
        'recognise.checksum-failed',
        params,
        `The value has the pattern of ${label} (${candidate.scheme}) but fails its checksum.`,
        candidate.explanation,
      ),
      certainty: 'possible',
    };
  });

  return { data: candidates, conclusions, warnings };
}
