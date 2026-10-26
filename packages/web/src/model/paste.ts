import type {
  Candidate,
  Conclusion,
  ConsistencyFinding,
  Derivation,
  Engine,
  Result,
  Warning,
} from '../engine-host.ts';

/**
 * The most values the page runs per-value calls for. It mirrors the engine's check limit
 * (check.ts MAX_VALUES), which the package entry does not export; paste.test.ts feeds 51 lines to
 * prove the two agree.
 */
export const MAX_VALUES = 50;

const VALUE_REF = /^values\/(\d+)$/;

/** One derive conclusion; a `derive.derivation` one is paired with its Derivation from the data. */
export type DerivationRow = { conclusion: Conclusion; derivation: Derivation | null };

/** Code of the engine warning that gates a bare personal-number-shaped value (DEC-005, DEC-022). */
export const PERSONAL_IDENTIFIER = 'possible-personal-identifier';

/**
 * D-03: a value that may be a personal identifier. `candidates` are the recognise candidates in the
 * engine's order (nothing sorted, filtered or promoted); `warning` is the banner's engine sentence.
 */
export type Ambiguity = { warning: Warning; candidates: Candidate[] };

export type PasteValue = {
  /** 1-based, the number shown under Normalised input and used by the engine's "Values 1 and 2". */
  position: number;
  value: string;
  recognise: Result<Candidate[]>;
  derive: Result<Derivation[]>;
  /** The scheme the user declared for this value, or null. */
  declared: string | null;
  derivations: DerivationRow[];
  /** Set when the value is gated; its warning is then shown by the banner, not in `warnings`. */
  ambiguity: Ambiguity | null;
  /** The remaining warnings of the value, in words under it. */
  warnings: Warning[];
};

/** One pair of values from check, with its conclusion when the engine made one (not for no-rule). */
export type PastePair = {
  a: number;
  b: number;
  outcome: ConsistencyFinding['outcome'];
  conclusion: Conclusion | null;
  finding: ConsistencyFinding;
};

export type PasteRun = {
  values: PasteValue[];
  /** How many lines came after the first MAX_VALUES and were left out of the per-value calls. */
  omitted: number;
  check: Result<ConsistencyFinding[]> | null;
  pairs: PastePair[];
  /** Check warnings that name no value. */
  runWarnings: Warning[];
};

/** The 1-based position a check warning names through `values/<index>`, else null. */
function positionOfRef(ref: string | undefined): number | null {
  const match = ref === undefined ? null : VALUE_REF.exec(ref);
  return match?.[1] === undefined ? null : Number(match[1]) + 1;
}

/** Match each derive.derivation conclusion with its Derivation by from, scheme and joined rules. */
function derivationRows(result: Result<Derivation[]>): DerivationRow[] {
  return result.conclusions.map((conclusion) => {
    if (conclusion.key !== 'derive.derivation') return { conclusion, derivation: null };
    const derivation =
      result.data.find(
        (each) =>
          each.from === conclusion.params.from &&
          each.scheme === conclusion.params.scheme &&
          each.rules.join(',') === conclusion.params.rules,
      ) ?? null;
    return { conclusion, derivation };
  });
}

/** Keep the first warning of each code and ref; a check ref naming a value counts as no ref. */
function dedupe(warnings: readonly Warning[]): Warning[] {
  const seen = new Set<string>();
  const kept: Warning[] = [];
  for (const warning of warnings) {
    const ref = positionOfRef(warning.ref) === null ? (warning.ref ?? '') : '';
    const key = `${warning.code}\u0000${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(warning);
  }
  return kept;
}

/**
 * The call plan of the paste view (RESEARCH Pattern 2): per distinct value one `recognise` and one
 * `derive` (as `derive(value, scheme)` when the user declared a scheme for that 1-based position),
 * and one `check` over all lines. Every value reaches the engine exactly as given (no case folding);
 * past MAX_VALUES the per-value calls stop and check carries the too-many-values warning.
 */
export function runPaste(
  engine: Engine,
  lines: readonly string[],
  declared: ReadonlyMap<number, string> = new Map(),
): PasteRun {
  const shown = lines.slice(0, MAX_VALUES);
  const recognised = new Map<string, Result<Candidate[]>>();
  const derived = new Map<string, Result<Derivation[]>>();

  const check = lines.length >= 2 ? engine.check([...lines]) : null;

  const values = shown.map((value, index): PasteValue => {
    const position = index + 1;
    const scheme = declared.get(position) ?? null;
    let recognise = recognised.get(value);
    if (recognise === undefined) {
      recognise = engine.recognise(value);
      recognised.set(value, recognise);
    }
    const deriveKey = `${value}\u0000${scheme ?? ''}`;
    let derive = derived.get(deriveKey);
    if (derive === undefined) {
      derive = scheme === null ? engine.derive(value) : engine.derive(value, scheme);
      derived.set(deriveKey, derive);
    }
    const fromCheck = (check?.warnings ?? []).filter(
      (warning) => positionOfRef(warning.ref) === position,
    );
    const warnings = dedupe([...recognise.warnings, ...derive.warnings, ...fromCheck]);
    const gate = warnings.find((warning) => warning.code === PERSONAL_IDENTIFIER) ?? null;
    return {
      position,
      value,
      recognise,
      derive,
      declared: scheme,
      derivations: derivationRows(derive),
      ambiguity: gate === null ? null : { warning: gate, candidates: [...recognise.data] },
      warnings:
        gate === null
          ? warnings
          : warnings.filter((warning) => warning.code !== PERSONAL_IDENTIFIER),
    };
  });

  const pairs = (check?.data ?? []).map((finding): PastePair => {
    const conclusion =
      check?.conclusions.find(
        (each) => each.params.a === String(finding.a) && each.params.b === String(finding.b),
      ) ?? null;
    return { a: finding.a + 1, b: finding.b + 1, outcome: finding.outcome, conclusion, finding };
  });

  const runWarnings = dedupe(
    (check?.warnings ?? []).filter((warning) => positionOfRef(warning.ref) === null),
  );

  return { values, omitted: lines.length - shown.length, check, pairs, runWarnings };
}
