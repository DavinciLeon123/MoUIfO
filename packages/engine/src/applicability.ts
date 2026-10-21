import type { CompiledModel } from './compile.ts';
import { evaluateCondition, type Known } from './conditions.ts';
import { chainCertainty, conclusion, factStep } from './explain.ts';
import type { ApplicabilityEntry } from './model-types.ts';
import type { Certainty, Conclusion, Result, Step, Warning } from './types.ts';

/** How a status was found: stated for the jurisdiction itself, inherited from a parent, or absent. */
export type ApplicabilityBasis = 'stated' | 'inherited' | 'no-data';

export type ApplicabilityStatus = {
  status: string;
  basis: ApplicabilityBasis;
  /** The ancestor an inherited status comes from; null for stated and no-data. */
  from: string | null;
  /** The weakest certainty of the explanation; null for no-data. */
  certainty: Certainty | null;
  explanation: Step[];
};

export type Applicability = {
  scheme: string;
  /** The jurisdiction id the question resolved to (an alias such as EL resolves to GR). */
  jurisdiction: string;
  /** One entry per status of the applicability-status vocabulary, in vocabulary order. */
  statuses: ApplicabilityStatus[];
};

/** Only a stated `not-applicable` may say a scheme does not apply (DEC-032); data gaps never do. */
const NOT_APPLICABLE = 'not-applicable';

const NOTHING: Known = new Map();

function failure(...warnings: Warning[]): Result<null> {
  return { data: null, conclusions: [], warnings };
}

/**
 * Where does a scheme apply (SPEC §6.2, ENG-04)? Per status of the vocabulary: stated for the
 * queried jurisdiction, else inherited from the nearest `part_of` ancestor that states it when the
 * status has `inherits_down` (an inherited result carries an assumption step, so it is at most
 * likely, DEC-041), else no-data. A stated `not-applicable` of the queried jurisdiction keeps
 * every unstated status at no-data. Statements never say "not applicable" from missing data.
 */
export function applicability(
  compiled: CompiledModel,
  schemeId: unknown,
  jurisdiction: unknown,
): Result<Applicability | null> {
  if (typeof schemeId !== 'string' || typeof jurisdiction !== 'string') {
    return failure({
      code: 'invalid-input',
      message: 'The scheme id and the jurisdiction must be strings.',
    });
  }
  const scheme = compiled.schemes.get(schemeId)?.scheme;
  const target = compiled.prefixes.get(jurisdiction)?.jurisdiction ?? jurisdiction;
  const problems: Warning[] = [];
  if (scheme === undefined) {
    problems.push({
      code: 'unknown-scheme',
      message: 'No scheme with this id exists in the model.',
    });
  }
  if (!compiled.jurisdictions.has(target)) {
    problems.push({
      code: 'unknown-jurisdiction',
      message: 'No jurisdiction with this id exists in the model.',
    });
  }
  if (scheme === undefined || problems.length > 0) return failure(...problems);

  const entries: readonly ApplicabilityEntry[] = scheme.applicability ?? [];
  const schemeName = `${scheme.label.en} (${scheme.id})`;
  const labelOf = (id: string): string => {
    const found = Object.hasOwn(compiled.model.jurisdictions, id)
      ? compiled.model.jurisdictions[id]
      : undefined;
    return found === undefined ? id : found.label.en;
  };

  const findEntry = (where: string, status: string): number =>
    entries.findIndex((entry) => entry.jurisdiction === where && entry.status.includes(status));

  /** The fact step of a stated entry and the assumption steps of its condition. */
  const entrySteps = (index: number): Step[] => {
    const entry = entries[index];
    if (entry === undefined) return [];
    const ref = `${scheme.id}/applicability/${index}`;
    return [
      factStep(compiled, ref, entry),
      ...evaluateCondition(entry.condition, NOTHING, ref).steps,
    ];
  };

  /** The part_of fact step of every hop from the queried jurisdiction up to an ancestor. */
  const hopSteps = (chain: readonly { jurisdiction: string; index: number }[]): Step[] =>
    chain.map((hop) => {
      const owner = Object.hasOwn(compiled.model.jurisdictions, hop.jurisdiction)
        ? compiled.model.jurisdictions[hop.jurisdiction]
        : undefined;
      const partOf = owner?.part_of?.[hop.index];
      if (partOf === undefined) {
        throw new Error(`the model has no part_of entry ${hop.index} for ${hop.jurisdiction}`);
      }
      return factStep(compiled, `jurisdictions/${hop.jurisdiction}/part_of/${hop.index}`, partOf);
    });

  const statedNotApplicable = findEntry(target, NOT_APPLICABLE) >= 0;
  const ancestors = compiled.ancestors.get(target) ?? [];
  const conclusions: Conclusion[] = [];
  const statuses: ApplicabilityStatus[] = [];

  for (const { id: status, inherits_down } of compiled.statuses) {
    const noData: ApplicabilityStatus = {
      status,
      basis: 'no-data',
      from: null,
      certainty: null,
      explanation: [],
    };

    const own = findEntry(target, status);
    if (own >= 0) {
      const steps = entrySteps(own);
      const certainty = chainCertainty(compiled, steps);
      statuses.push({ status, basis: 'stated', from: null, certainty, explanation: steps });
      conclusions.push(
        conclusion(
          compiled,
          'applicability.stated',
          { scheme: scheme.id, jurisdiction: target, status },
          `${schemeName} is ${status} in ${labelOf(target)} (stated).`,
          steps,
        ),
      );
      continue;
    }

    if (statedNotApplicable || !inherits_down) {
      statuses.push(noData);
      continue;
    }

    let inherited: ApplicabilityStatus | undefined;
    for (const ancestor of ancestors) {
      const index = findEntry(ancestor.jurisdiction, status);
      if (index < 0) continue;
      const steps: Step[] = [
        ...entrySteps(index),
        ...hopSteps(ancestor.chain),
        {
          kind: 'assumption',
          ref: `vocab/applicability-status/${status}/inherits_down`,
          certainty: 'likely',
          source: null,
        },
      ];
      inherited = {
        status,
        basis: 'inherited',
        from: ancestor.jurisdiction,
        certainty: chainCertainty(compiled, steps),
        explanation: steps,
      };
      conclusions.push(
        conclusion(
          compiled,
          'applicability.inherited',
          { scheme: scheme.id, jurisdiction: target, status, from: ancestor.jurisdiction },
          `${schemeName} is ${status} in ${labelOf(target)}, inherited from ${labelOf(
            ancestor.jurisdiction,
          )} (${ancestor.jurisdiction}).`,
          steps,
        ),
      );
      break;
    }
    statuses.push(inherited ?? noData);
  }

  return {
    data: { scheme: scheme.id, jurisdiction: target, statuses },
    conclusions,
    warnings: [],
  };
}
