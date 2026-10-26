import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { evaluateCondition, type Known, mergeKnown, valueContext } from './conditions.ts';
import {
  chainCertainty,
  checksumStep,
  componentStep,
  conclusion,
  dedupeSteps,
  patternStep,
  type StatementLike,
} from './explain.ts';
import type { ChecksumOutcome } from './format.ts';
import { isPossiblePersonalIdentifier, personalIdentifierWarning } from './gate.ts';
import type { Component } from './model-types.ts';
import { specificity } from './specificity.ts';
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
  /** Literal characters of the deciding pattern (DEC-064). */
  specificity: number;
  /** 2 for the hinted or value-prefix jurisdiction, 1 for one of its `part_of` ancestors, else 0. */
  hint_grade: 0 | 1 | 2;
  /** 1-based; candidates tied on accepted, certainty, hint grade and specificity share one. */
  rank_group: number;
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
 * any-of. A context conflict between `known` and the value is added to `warnings`. A scheme that
 * declares checksum entries whose conditions the context all makes false has no checksum to check:
 * the candidate is accepted on its format alone with checksum result `none` and the warning
 * `no-applicable-checksum` is added (DEC-072, the scheme id only, never the value).
 */
export function evaluateCandidate(
  compiled: CompiledModel,
  schemeId: string,
  value: string,
  known: Known,
  warnings: Warning[] = [],
): Candidate | null {
  return evaluate(compiled, schemeId, value, known, warnings, true);
}

/** The prefix of a composite's rest is named in a warning only when it has the ICD shape (T-05-08). */
const ICD_PREFIX = /^[0-9]{4}$/;

/**
 * Peppol delegation (DEC-065): the part after the last `::` is read as `<prefix>:<rest>`; a declared
 * component prefix sends `<rest>` to that component scheme only. The rest is never case-folded.
 */
function delegate(
  compiled: CompiledModel,
  schemeId: string,
  components: readonly Component[],
  value: string,
  known: Known,
  warnings: Warning[],
  explanation: Step[],
): { components: ComponentMatch[]; accepted: boolean } {
  const tail = value.slice(value.lastIndexOf('::') + 2);
  const colon = tail.indexOf(':');
  const prefix = colon < 0 ? tail : tail.slice(0, colon);
  const rest = colon < 0 ? '' : tail.slice(colon + 1);
  const component = components.find((each) => each.prefix === prefix);
  if (component === undefined) {
    warnings.push({
      code: 'unknown-component-prefix',
      message: ICD_PREFIX.test(prefix)
        ? `the value has the component prefix ${prefix}, which ${schemeId} does not declare, so it is not delegated`
        : `the value has a component prefix that ${schemeId} does not declare, so it is not delegated`,
      ref: schemeId,
    });
    return { components: [], accepted: false };
  }
  const nested = evaluate(compiled, component.scheme, rest, known, warnings, false);
  const ref = `${schemeId}/components/${component.prefix}`;
  explanation.push(componentStep(compiled, schemeId, component));
  const accepted = nested?.accepted === true;
  if (nested !== null && accepted) explanation.push(...nested.explanation);
  if (!accepted) {
    warnings.push({
      code: 'component-not-accepted',
      message: `the component value is not accepted by ${component.scheme}`,
      ref,
    });
  }
  return {
    components: [
      {
        prefix: component.prefix,
        scheme: component.scheme,
        candidates: nested === null ? [] : [nested],
      },
    ],
    accepted,
  };
}

function evaluate(
  compiled: CompiledModel,
  schemeId: string,
  value: string,
  known: Known,
  warnings: Warning[],
  split: boolean,
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
  if (declared.length > 0 && checksums.length === 0) {
    warnings.push({
      code: 'no-applicable-checksum',
      message: `no checksum entry of ${schemeId} applies in the given context, so the value is accepted on its format alone`,
      ref: schemeId,
    });
  } else if (declared.length > 0) {
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

  let components: ComponentMatch[] | undefined;
  let delegated = true;
  const declaredComponents = entry.scheme.components ?? [];
  if (split && entry.scheme.kind.value === 'composite' && declaredComponents.length > 0) {
    const outcome = delegate(
      compiled,
      schemeId,
      declaredComponents,
      value,
      known,
      warnings,
      explanation,
    );
    components = outcome.components;
    delegated = outcome.accepted || components.length === 0;
    explanation = dedupeSteps(explanation);
  }
  const certainty: Certainty =
    accepted && delegated ? chainCertainty(compiled, explanation) : 'possible';

  const candidate: Candidate = {
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
    specificity: specificity((format.patterns ?? [])[decidingPattern.index]?.regex ?? ''),
    hint_grade: 0,
    rank_group: 1,
  };
  if (components !== undefined) candidate.components = components;
  return candidate;
}

/** True when the composite found its declared component but the component rejected the rest. */
function componentRejected(candidate: Candidate): boolean {
  const components = candidate.components ?? [];
  return components.some((each) => !each.candidates.some((nested) => nested.accepted));
}

function emptyResult(code: string, message: string): Result<Candidate[]> {
  return { data: [], conclusions: [], warnings: [{ code, message }] };
}

/** The jurisdiction a hint names: the country-prefix vocabulary first (EL gives GR), then an id. */
function hintJurisdiction(
  compiled: CompiledModel,
  hint: unknown,
  warnings: Warning[],
): string | null {
  if (hint === undefined) return null;
  if (typeof hint !== 'object' || hint === null || Array.isArray(hint)) {
    warnings.push({ code: 'unknown-country-hint', message: 'the country hint is not understood' });
    return null;
  }
  const country = Object.hasOwn(hint, 'country')
    ? (hint as { country?: unknown }).country
    : undefined;
  if (country === undefined) return null;
  if (typeof country === 'string') {
    const prefixed = compiled.prefixes.get(country)?.jurisdiction;
    if (prefixed !== undefined) return prefixed;
    if (compiled.jurisdictions.has(country)) return country;
  }
  warnings.push({ code: 'unknown-country-hint', message: 'the country hint is not understood' });
  return null;
}

/** The jurisdiction the value itself carries: the first scheme whose capture maps (DEC-063). */
function valueJurisdiction(compiled: CompiledModel, value: string): string | null {
  for (const id of compiled.schemeIds) {
    const capture = compiled.schemes.get(id)?.capture;
    if (capture === undefined || capture === null) continue;
    const prefix = capture.run(value);
    if (prefix === null) continue;
    const entry = compiled.prefixes.get(prefix);
    if (entry !== undefined) return entry.jurisdiction;
  }
  return null;
}

function hintGrade(compiled: CompiledModel, schemeId: string, target: string | null): 0 | 1 | 2 {
  if (target === null) return 0;
  const jurisdiction = compiled.schemes.get(schemeId)?.scheme.jurisdiction.value;
  if (jurisdiction === undefined) return 0;
  if (jurisdiction === target) return 2;
  const ancestors = compiled.ancestors.get(target) ?? [];
  return ancestors.some((each) => each.jurisdiction === jurisdiction) ? 1 : 0;
}

/**
 * Recognise a value (SPEC §6.2, DEC-063, DEC-064): every scheme whose pattern matches the whole
 * trimmed value, each with its format and checksum result apart. Order: accepted first, then
 * certainty (highest first), then the hint grade, then specificity, then scheme id; candidates tied
 * on all but the id share one rank group. Only surrounding whitespace is trimmed; no case is folded.
 * The hint (or else the country prefix the value carries) only re-ranks; it never removes a candidate.
 */
export function recognise(
  compiled: CompiledModel,
  value: unknown,
  hint?: { country?: string },
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
  const target = hintJurisdiction(compiled, hint, warnings) ?? valueJurisdiction(compiled, trimmed);
  for (const candidate of candidates) {
    candidate.hint_grade = hintGrade(compiled, candidate.scheme, target);
  }
  candidates.sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    const byRank = (compiled.rank.get(b.certainty) ?? 0) - (compiled.rank.get(a.certainty) ?? 0);
    if (byRank !== 0) return byRank;
    if (a.hint_grade !== b.hint_grade) return b.hint_grade - a.hint_grade;
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    return byCodeUnit(a.scheme, b.scheme);
  });
  let group = 0;
  candidates.forEach((candidate, index) => {
    const before = candidates[index - 1];
    const tied =
      before !== undefined &&
      before.accepted === candidate.accepted &&
      before.certainty === candidate.certainty &&
      before.hint_grade === candidate.hint_grade &&
      before.specificity === candidate.specificity;
    if (!tied) group += 1;
    candidate.rank_group = group;
  });

  if (isPossiblePersonalIdentifier(trimmed)) {
    const accepted = candidates.filter((each) => each.accepted).map((each) => each.scheme);
    if (accepted.length > 0) warnings.push(personalIdentifierWarning(accepted));
  }

  const conclusions: Conclusion[] = candidates.map((candidate) => {
    const label = compiled.schemes.get(candidate.scheme)?.scheme.label.en ?? candidate.scheme;
    const params = { scheme: candidate.scheme };
    const rejected = componentRejected(candidate);
    if (candidate.accepted && rejected) {
      const nestedScheme = candidate.components?.[0]?.scheme ?? '';
      const nestedLabel = compiled.schemes.get(nestedScheme)?.scheme.label.en ?? nestedScheme;
      return {
        ...conclusion(
          compiled,
          'recognise.component-not-accepted',
          { scheme: candidate.scheme, component: nestedScheme },
          `The value has the format of ${label} (${candidate.scheme}), but its component value is not accepted by ${nestedLabel} (${nestedScheme}).`,
          candidate.explanation,
        ),
        certainty: 'possible',
      };
    }
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
