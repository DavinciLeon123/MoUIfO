import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { type Known, resolveContext } from './conditions.ts';
import { type Derivation, deriveFrom, MAX_RESULTS } from './derive.ts';
import { conclusion } from './explain.ts';
import { isPossiblePersonalIdentifier, personalIdentifierWarning } from './gate.ts';
import { type Candidate, evaluateCandidate, MAX_INPUT_LENGTH } from './recognise.ts';
import type { Certainty, Conclusion, Result, Step, Warning } from './types.ts';

/** The most values check compares; more give the warning `too-many-values` (T-05-20). */
export const MAX_VALUES = 50;

/**
 * The verdict on one pair of supplied values (SPEC §6.2, DEC-068). `a` and `b` are the 0-based input
 * positions of the two values, `a` before `b`; a finding never holds a value. A `consistent` or
 * `inconsistent` finding names the direction and the start and end scheme of the chosen chain, its
 * rules, its certainty (the weakest step) and its explanation; a `no-rule` finding has none of them.
 * `tried` lists the schemes each value was tried as.
 */
export type ConsistencyFinding = {
  a: number;
  b: number;
  outcome: 'consistent' | 'inconsistent' | 'no-rule';
  direction: 'a-to-b' | 'b-to-a' | null;
  from_scheme: string | null;
  to_scheme: string | null;
  rules: string[];
  tried: { a: string[]; b: string[] };
  certainty: Certainty | null;
  explanation: Step[];
};

/** One distinct supplied value, at its first input position. */
type Entry = {
  position: number;
  value: string;
  gated: boolean;
  candidates: Map<string, Candidate>;
  tried: string[];
  derivations: Derivation[];
};

type Chain = { direction: 'a-to-b' | 'b-to-a'; derivation: Derivation };

function labelOf(compiled: CompiledModel, id: string): string {
  const label = compiled.schemes.get(id)?.scheme.label.en;
  return label === undefined ? id : `${label} (${id})`;
}

function emptyResult(code: string, message: string, ref: string): Result<ConsistencyFinding[]> {
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

/** Highest certainty first, then fewer steps, then the rule chain in code-unit order (as derive). */
function compareDerivations(compiled: CompiledModel, a: Derivation, b: Derivation): number {
  const byRank = (compiled.rank.get(b.certainty) ?? 0) - (compiled.rank.get(a.certainty) ?? 0);
  if (byRank !== 0) return byRank;
  if (a.hops !== b.hops) return a.hops - b.hops;
  return byCodeUnit(a.rules.join(' '), b.rules.join(' '));
}

/** Every derivation of a value from each of its tried schemes, ordered and capped like derive. */
function derivationsOf(
  compiled: CompiledModel,
  entry: Entry,
  ctxKnown: Known,
  warnings: Warning[],
): Derivation[] {
  const all: Derivation[] = [];
  for (const scheme of entry.tried) {
    const candidate = entry.candidates.get(scheme);
    if (candidate === undefined || !candidate.accepted) continue;
    all.push(
      ...deriveFrom(compiled, { scheme, value: entry.value, candidate }, ctxKnown, warnings),
    );
  }
  all.sort((a, b) => compareDerivations(compiled, a, b));
  if (all.length > MAX_RESULTS) {
    warnings.push({
      code: 'too-many-results',
      message: `More than ${MAX_RESULTS} derivations exist from value ${entry.position + 1}; only the first ${MAX_RESULTS} are used.`,
      ref: `values/${entry.position}`,
    });
  }
  return all.slice(0, MAX_RESULTS);
}

/**
 * The chains between one pair (DEC-068): derivations from `a` whose scheme is one of `b`'s tried
 * schemes (a-to-b) and the reverse (b-to-a), keeping those whose derived value equals the other
 * value (`consistent`) or differs from it (`inconsistent`).
 */
function chainsBetween(a: Entry, b: Entry, equal: boolean): Chain[] {
  const chains: Chain[] = [];
  for (const derivation of a.derivations) {
    if (b.tried.includes(derivation.scheme) && (derivation.value === b.value) === equal) {
      chains.push({ direction: 'a-to-b', derivation });
    }
  }
  for (const derivation of b.derivations) {
    if (a.tried.includes(derivation.scheme) && (derivation.value === a.value) === equal) {
      chains.push({ direction: 'b-to-a', derivation });
    }
  }
  return chains;
}

/** Fewest steps, then a-to-b before b-to-a, then higher certainty, then the rule ids by code unit. */
function chooseChain(compiled: CompiledModel, chains: readonly Chain[]): Chain | undefined {
  let best: Chain | undefined;
  for (const each of chains) {
    if (best === undefined) {
      best = each;
      continue;
    }
    const x = each.derivation;
    const y = best.derivation;
    let order = x.hops - y.hops;
    if (order === 0 && each.direction !== best.direction) {
      order = each.direction === 'a-to-b' ? -1 : 1;
    }
    if (order === 0) {
      order = (compiled.rank.get(y.certainty) ?? 0) - (compiled.rank.get(x.certainty) ?? 0);
    }
    if (order === 0) order = byCodeUnit(x.rules.join(' '), y.rules.join(' '));
    if (order < 0) best = each;
  }
  return best;
}

function findingFor(compiled: CompiledModel, a: Entry, b: Entry): ConsistencyFinding {
  const tried = { a: [...a.tried], b: [...b.tried] };
  let outcome: 'consistent' | 'inconsistent' = 'consistent';
  let chosen = chooseChain(compiled, chainsBetween(a, b, true));
  if (chosen === undefined) {
    outcome = 'inconsistent';
    chosen = chooseChain(compiled, chainsBetween(a, b, false));
  }
  if (chosen === undefined) {
    return {
      a: a.position,
      b: b.position,
      outcome: 'no-rule',
      direction: null,
      from_scheme: null,
      to_scheme: null,
      rules: [],
      tried,
      certainty: null,
      explanation: [],
    };
  }
  const { derivation } = chosen;
  return {
    a: a.position,
    b: b.position,
    outcome,
    direction: chosen.direction,
    from_scheme: derivation.from,
    to_scheme: derivation.scheme,
    rules: [...derivation.rules],
    tried,
    certainty: derivation.certainty,
    explanation: [...derivation.explanation],
  };
}

function findingConclusion(
  compiled: CompiledModel,
  finding: ConsistencyFinding,
): Conclusion | null {
  if (finding.outcome === 'no-rule') return null;
  if (finding.from_scheme === null || finding.to_scheme === null || finding.direction === null) {
    return null;
  }
  const source = finding.direction === 'a-to-b' ? finding.a : finding.b;
  const target = finding.direction === 'a-to-b' ? finding.b : finding.a;
  const params = {
    a: String(finding.a),
    b: String(finding.b),
    from: finding.from_scheme,
    to: finding.to_scheme,
    rules: finding.rules.join(','),
  };
  const pair = `Values ${finding.a + 1} and ${finding.b + 1}`;
  const from = labelOf(compiled, finding.from_scheme);
  const to = labelOf(compiled, finding.to_scheme);
  if (finding.outcome === 'consistent') {
    return conclusion(
      compiled,
      'check.consistent',
      params,
      `${pair} are consistent: value ${source + 1} as ${from} gives value ${target + 1} as ${to} through ${finding.rules.join(', then ')}.`,
      finding.explanation,
    );
  }
  return conclusion(
    compiled,
    'check.inconsistent',
    params,
    `${pair} are inconsistent: value ${source + 1} as ${from} gives a ${to} that differs from value ${target + 1}.`,
    finding.explanation,
  );
}

/**
 * Compare supplied values pair by pair (SPEC §6.2, ENG-07, DEC-068). Each distinct value is tried as
 * every scheme that accepts it; a pair is `consistent` when a rule chain from one value, as one of its
 * tried schemes, gives exactly the other value as one of the other's tried schemes, `inconsistent`
 * when such a chain reaches one of the other's tried schemes with a different value, else `no-rule`
 * (a relation without a rule does not connect a pair). A bare nine-digit value that passes the
 * elfproef (DEC-005) joins only when another value's derivation gives exactly it, and then only as
 * the schemes those derivations output; otherwise it only gets a warning. Input values appear
 * nowhere in the result: findings, statements and warnings use positions, ids and labels.
 */
export function check(
  compiled: CompiledModel,
  values: unknown,
  ctx?: unknown,
): Result<ConsistencyFinding[]> {
  if (!Array.isArray(values)) {
    return emptyResult('invalid-input', 'the values must be an array of strings', 'values');
  }
  if (values.length > MAX_VALUES) {
    return emptyResult('too-many-values', `check compares at most ${MAX_VALUES} values.`, 'values');
  }

  const resolved = resolveContext(compiled, ctx);
  const warnings: Warning[] = [...resolved.warnings];

  // Distinct, trimmed values at their first input position; the rest are dropped with a warning.
  const firstAt = new Map<string, number>();
  const entries: Entry[] = [];
  for (let position = 0; position < values.length; position++) {
    const raw: unknown = values[position];
    const ref = `values/${position}`;
    if (typeof raw !== 'string') {
      warnings.push({
        code: 'invalid-input',
        message: `Value ${position + 1} must be a string.`,
        ref,
      });
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed === '') {
      warnings.push({ code: 'empty-input', message: `Value ${position + 1} is empty.`, ref });
      continue;
    }
    if (trimmed.length > MAX_INPUT_LENGTH) {
      warnings.push({
        code: 'input-too-long',
        message: `Value ${position + 1} is longer than ${MAX_INPUT_LENGTH} characters.`,
        ref,
      });
      continue;
    }
    const earlier = firstAt.get(trimmed);
    if (earlier !== undefined) {
      warnings.push({
        code: 'duplicate-value',
        message: `Value ${position + 1} repeats value ${earlier + 1}; it is compared once.`,
        ref,
      });
      continue;
    }
    firstAt.set(trimmed, position);
    entries.push({
      position,
      value: trimmed,
      gated: false,
      candidates: new Map(),
      tried: [],
      derivations: [],
    });
  }

  // Tried schemes: every accepted candidate, in scheme-id order. A gated value waits for a partner.
  for (const entry of entries) {
    const accepted: string[] = [];
    for (const id of compiled.schemeIds) {
      const candidate = evaluateCandidate(compiled, id, entry.value, resolved.known, warnings);
      if (candidate === null) continue;
      entry.candidates.set(id, candidate);
      if (candidate.accepted) accepted.push(id);
    }
    entry.gated = isPossiblePersonalIdentifier(entry.value);
    if (entry.gated) {
      if (accepted.length > 0) {
        warnings.push(personalIdentifierWarning(accepted, `values/${entry.position}`));
      }
    } else {
      entry.tried = accepted;
    }
  }

  for (const entry of entries) {
    if (!entry.gated) entry.derivations = derivationsOf(compiled, entry, resolved.known, warnings);
  }

  // A gated value joins only as the schemes another value's derivation outputs for exactly it.
  for (const entry of entries) {
    if (!entry.gated) continue;
    const output = new Set<string>();
    for (const other of entries) {
      if (other.gated) continue;
      for (const derivation of other.derivations) {
        if (derivation.value === entry.value) output.add(derivation.scheme);
      }
    }
    if (output.size === 0) continue;
    entry.tried = [...output].sort(byCodeUnit);
    entry.derivations = derivationsOf(compiled, entry, resolved.known, warnings);
  }

  const data: ConsistencyFinding[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a !== undefined && b !== undefined) data.push(findingFor(compiled, a, b));
    }
  }

  const conclusions: Conclusion[] = [];
  for (const finding of data) {
    const each = findingConclusion(compiled, finding);
    if (each !== null) conclusions.push(each);
  }
  return { data, conclusions, warnings: dedupeWarnings(warnings) };
}
