import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import {
  evaluateCondition,
  type Known,
  mergeKnown,
  resolveContext,
  valueContext,
} from './conditions.ts';
import { chainCertainty, conclusion, dedupeSteps, factStep, ruleStep } from './explain.ts';
import { isPossiblePersonalIdentifier, personalIdentifierWarning } from './gate.ts';
import type { Candidate } from './recognise.ts';
import { evaluateCandidate, MAX_INPUT_LENGTH } from './recognise.ts';
import type { Certainty, Conclusion, Result, Step, Warning } from './types.ts';

/** The longest rule chain derive follows (SPEC §6.2, DEC-067). */
export const MAX_STEPS = 4;

/** The most derivations derive returns; more give the warning `too-many-results` (T-05-18). */
export const MAX_RESULTS = 100;

/** A hard bound on the paths one start enumerates, so a dense rule graph cannot run away. */
const MAX_ENUMERATED = 10000;

/**
 * One derivation (DEC-067): the scheme of the input value, the scheme of the derived value, the
 * derived value, the rules applied in order and the explanation behind it. The certainty is the
 * weakest step of the explanation.
 */
export type Derivation = {
  from: string;
  scheme: string;
  value: string;
  rules: string[];
  hops: number;
  certainty: Certainty;
  explanation: Step[];
};

/** Where a derivation starts: the scheme of the input, the trimmed value and its accepted candidate. */
export type DeriveStart = { scheme: string; value: string; candidate: Candidate };

function labelOf(compiled: CompiledModel, id: string): string {
  const label = compiled.schemes.get(id)?.scheme.label.en;
  return label === undefined ? id : `${label} (${id})`;
}

/**
 * Apply the rules repeatedly from one start (SPEC §6.2, ENG-06, DEC-067): depth first, at most four
 * steps, never returning to a scheme already on the chain (the start counts). A rule whose condition
 * the known context contradicts is dropped; one it does not establish adds an assumption step at
 * `likely` (DEC-069). A transform that gives no value is silent. An output that its scheme does not
 * accept (format, checksum and conditions) is dropped with the warning `output-failed-validation`.
 * The known context of a hop is the caller's context overlaid by the issuing country the hop's input
 * value carries; without one, the context carried from the previous hop. Derivations come back in
 * discovery order (rules in id order); `derive` sorts them.
 */
export function deriveFrom(
  compiled: CompiledModel,
  start: DeriveStart,
  ctxKnown: Known,
  warnings: Warning[],
): Derivation[] {
  const found: Derivation[] = [];
  let capped = false;

  const visit = (
    scheme: string,
    value: string,
    carried: Known,
    visited: readonly string[],
    rules: readonly string[],
    steps: readonly Step[],
  ): void => {
    if (rules.length >= MAX_STEPS) return;
    const merged = mergeKnown(
      carried,
      valueContext(compiled, scheme, value),
      `${scheme}/context_from/issuing_country`,
    );
    warnings.push(...merged.warnings);
    for (const ruleId of compiled.rulesByInput.get(scheme) ?? []) {
      if (found.length >= MAX_ENUMERATED) {
        capped = true;
        return;
      }
      const entry = compiled.rules.get(ruleId);
      if (entry === undefined) continue;
      const { rule } = entry;
      if (visited.includes(rule.output)) continue;
      const condition = evaluateCondition(rule.condition, merged.known, rule.id);
      if (condition.state === 'false') continue;
      const output = entry.run(value);
      if (output === null) continue;
      const candidate = evaluateCandidate(compiled, rule.output, output, merged.known, warnings);
      if (candidate === null || !candidate.accepted) {
        warnings.push({
          code: 'output-failed-validation',
          message: `Rule ${rule.id} gave an output that ${rule.output} does not accept.`,
          ref: rule.id,
        });
        continue;
      }
      const chain = [
        ...steps,
        ruleStep(compiled, rule),
        ...condition.steps,
        ...candidate.explanation,
      ];
      const explanation = dedupeSteps(chain);
      const applied = [...rules, rule.id];
      found.push({
        from: start.scheme,
        scheme: rule.output,
        value: output,
        rules: applied,
        hops: applied.length,
        certainty: chainCertainty(compiled, explanation),
        explanation,
      });
      visit(rule.output, output, merged.known, [...visited, rule.output], applied, chain);
    }
  };

  visit(start.scheme, start.value, ctxKnown, [start.scheme], [], start.candidate.explanation);
  if (capped) {
    warnings.push({
      code: 'too-many-results',
      message: 'The derivation search stopped at its limit; the result is incomplete.',
    });
  }
  return found;
}

function emptyResult(code: string, message: string, ref: string): Result<Derivation[]> {
  return { data: [], conclusions: [], warnings: [{ code, message, ref }] };
}

/** Keep the first warning of each code, ref and message, preserving order. */
function dedupeWarnings(warnings: readonly Warning[]): Warning[] {
  const seen = new Set<string>();
  const result: Warning[] = [];
  for (const warning of warnings) {
    const identity = `${warning.code}\u0000${warning.ref ?? ''}\u0000${warning.message}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(warning);
  }
  return result;
}

function derivationConclusion(compiled: CompiledModel, each: Derivation): Conclusion {
  return conclusion(
    compiled,
    'derive.derivation',
    { from: each.from, scheme: each.scheme, rules: each.rules.join(',') },
    `As ${labelOf(compiled, each.from)}, the value derives a ${labelOf(compiled, each.scheme)} through ${each.rules.join(', then ')}.`,
    each.explanation,
  );
}

/**
 * The sourced reference conclusions about the start value (SPEC §10): who issues the scheme and
 * where the value can be verified. A class issuer resolves to the instance of the value's issuing
 * country when the model has one (DEC-031); otherwise the issuer is named as the model states it.
 */
function startConclusions(
  compiled: CompiledModel,
  start: DeriveStart,
  ctxKnown: Known,
): Conclusion[] {
  const scheme = compiled.schemes.get(start.scheme)?.scheme;
  if (scheme === undefined) return [];
  const conclusions: Conclusion[] = [];

  const steps: Step[] = [factStep(compiled, `${start.scheme}/issuer`, scheme.issuer)];
  let named = scheme.issuer.value;
  const issuer = compiled.authorities.get(named);
  if (issuer?.kind === 'class') {
    const country = mergeKnown(
      ctxKnown,
      valueContext(compiled, start.scheme, start.value),
      `${start.scheme}/context_from/issuing_country`,
    ).known.get('issuing_country');
    if (country !== undefined) {
      for (const id of compiled.instancesByClass.get(issuer.id) ?? []) {
        const instance = compiled.authorities.get(id);
        if (
          instance?.jurisdiction !== country.value ||
          instance.certainty === undefined ||
          instance.source === undefined
        ) {
          continue;
        }
        steps.push(
          ...country.steps,
          factStep(compiled, `authorities/${id}`, {
            certainty: instance.certainty,
            source: instance.source,
          }),
        );
        named = id;
        break;
      }
    }
  }
  const authorityLabel = compiled.authorities.get(named)?.label.en;
  conclusions.push(
    conclusion(
      compiled,
      'derive.issued-by',
      { scheme: start.scheme, authority: named },
      `The ${labelOf(compiled, start.scheme)} is issued by ${authorityLabel === undefined ? named : `${authorityLabel} (${named})`}.`,
      dedupeSteps(steps),
    ),
  );

  const validation = scheme.validation_source;
  if (validation !== undefined) {
    conclusions.push(
      conclusion(
        compiled,
        'derive.verify-through',
        { scheme: start.scheme, source: validation.source },
        `The ${labelOf(compiled, start.scheme)} can be verified through ${validation.label}.`,
        [factStep(compiled, `${start.scheme}/validation_source`, validation)],
      ),
    );
  }
  return conclusions;
}

/**
 * One reference per derived scheme that has a validation source and is not itself a start, in order
 * of first appearance. It names where to look the value up; it never looks anything up.
 */
function lookUpConclusions(
  compiled: CompiledModel,
  starts: readonly DeriveStart[],
  data: readonly Derivation[],
): Conclusion[] {
  const skip = new Set(starts.map((each) => each.scheme));
  const conclusions: Conclusion[] = [];
  for (const each of data) {
    if (skip.has(each.scheme)) continue;
    skip.add(each.scheme);
    const validation = compiled.schemes.get(each.scheme)?.scheme.validation_source;
    if (validation === undefined) continue;
    conclusions.push(
      conclusion(
        compiled,
        'derive.look-up-through',
        { scheme: each.scheme, source: validation.source },
        `The derived ${labelOf(compiled, each.scheme)} can be looked up through ${validation.label}; this is a reference, not a lookup.`,
        [factStep(compiled, `${each.scheme}/validation_source`, validation)],
      ),
    );
  }
  return conclusions;
}

/**
 * Derive from a value (SPEC §6.2, ENG-06, DEC-067): `schemeId` declares the scheme of the input
 * value, there is no target scheme. With a declared scheme the value must be accepted by it; without
 * one, every accepted candidate is a start, except that a bare elfproef-valid nine-digit value starts
 * nothing until its scheme is declared (ENG-09, DEC-005). Every result over such a value carries the
 * warning `possible-personal-identifier`. Derived values live only in `data[].value`; statements,
 * warnings and refs are built from labels and ids.
 */
export function derive(
  compiled: CompiledModel,
  value: unknown,
  schemeId: unknown,
  ctx?: unknown,
): Result<Derivation[]> {
  if (typeof value !== 'string') {
    return emptyResult('invalid-input', 'the value must be a string', 'value');
  }
  if (schemeId !== undefined && typeof schemeId !== 'string') {
    return emptyResult('invalid-input', 'the scheme id must be a string', 'schemeId');
  }
  const trimmed = value.trim();
  if (trimmed === '') return emptyResult('empty-input', 'the value is empty', 'value');
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return emptyResult(
      'input-too-long',
      `the value is longer than ${MAX_INPUT_LENGTH} characters`,
      'value',
    );
  }
  if (schemeId !== undefined && !compiled.schemes.has(schemeId)) {
    return emptyResult('unknown-scheme', 'No scheme with this id exists in the model.', 'schemeId');
  }

  const resolved = resolveContext(compiled, ctx);
  const warnings: Warning[] = [...resolved.warnings];

  const evaluated = new Map<string, { candidate: Candidate; warnings: Warning[] }>();
  for (const id of compiled.schemeIds) {
    const sink: Warning[] = [];
    const candidate = evaluateCandidate(compiled, id, trimmed, resolved.known, sink);
    if (candidate !== null) evaluated.set(id, { candidate, warnings: sink });
  }
  const acceptedIds = [...evaluated.values()]
    .filter((each) => each.candidate.accepted)
    .map((each) => each.candidate.scheme);

  const gated = isPossiblePersonalIdentifier(trimmed);
  if (gated && acceptedIds.length > 0) warnings.push(personalIdentifierWarning(acceptedIds));

  const starts: DeriveStart[] = [];
  if (schemeId !== undefined) {
    const declared = evaluated.get(schemeId);
    if (declared !== undefined) warnings.push(...declared.warnings);
    if (declared === undefined || !declared.candidate.accepted) {
      warnings.push({
        code: 'value-not-accepted',
        message: 'The value is not accepted by the declared scheme.',
        ref: 'schemeId',
      });
      return { data: [], conclusions: [], warnings: dedupeWarnings(warnings) };
    }
    starts.push({ scheme: schemeId, value: trimmed, candidate: declared.candidate });
  } else {
    for (const each of evaluated.values()) warnings.push(...each.warnings);
    if (!gated) {
      for (const id of compiled.schemeIds) {
        const each = evaluated.get(id);
        if (each?.candidate.accepted === true) {
          starts.push({ scheme: id, value: trimmed, candidate: each.candidate });
        }
      }
    }
  }

  const all: Derivation[] = [];
  for (const start of starts) all.push(...deriveFrom(compiled, start, resolved.known, warnings));
  all.sort((a, b) => {
    const byRank = (compiled.rank.get(b.certainty) ?? 0) - (compiled.rank.get(a.certainty) ?? 0);
    if (byRank !== 0) return byRank;
    if (a.hops !== b.hops) return a.hops - b.hops;
    return byCodeUnit(a.rules.join(' '), b.rules.join(' '));
  });
  const data = all.slice(0, MAX_RESULTS);
  if (all.length > MAX_RESULTS) {
    warnings.push({
      code: 'too-many-results',
      message: `More than ${MAX_RESULTS} derivations exist; only the first ${MAX_RESULTS} are returned.`,
    });
  }

  const conclusions: Conclusion[] = [];
  for (const start of starts) {
    conclusions.push(...startConclusions(compiled, start, resolved.known));
  }
  conclusions.push(...data.map((each) => derivationConclusion(compiled, each)));
  conclusions.push(...lookUpConclusions(compiled, starts, data));
  return { data, conclusions, warnings: dedupeWarnings(warnings) };
}
