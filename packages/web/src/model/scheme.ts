import type {
  Applicability,
  ApplicabilityBasis,
  Certainty,
  Conclusion,
  Host,
  SchemeDescription,
  Text,
} from '../engine-host.ts';

/** The conclusions of one `describe.<field>` key, in the order the engine produced them. */
export type SchemeSection = { key: string; conclusions: Conclusion[] };

export type SchemeSections = { description: SchemeDescription; sections: SchemeSection[] };

/**
 * D-09, WEB-02: the conclusions of `describe(id)` grouped by conclusion key, the groups in the order
 * their key first occurs, so the page takes each group's label from the engine dictionary and puts
 * no scheme fact in code. Null when the model has no such scheme.
 */
export function schemeSections(host: Host, id: string): SchemeSections | null {
  const result = host.engine.describe(id);
  if (result.data === null) return null;
  const sections: SchemeSection[] = [];
  for (const conclusion of result.conclusions) {
    const existing = sections.find((section) => section.key === conclusion.key);
    if (existing === undefined) sections.push({ key: conclusion.key, conclusions: [conclusion] });
    else existing.conclusions.push(conclusion);
  }
  return { description: result.data, sections };
}

/** One applicability status of a scheme in a jurisdiction, with its conclusion when there is one. */
export type ApplicabilityStatusRow = {
  status: string;
  /** The label of the status in the applicability-status vocabulary; the id when it has none. */
  label: Text;
  basis: ApplicabilityBasis;
  /** The ancestor an inherited status comes from, with its label. */
  from: { id: string; label: Text } | null;
  certainty: Certainty | null;
  /** The engine's conclusion of a stated or inherited status; null for no-data. */
  conclusion: Conclusion | null;
};

export type ApplicabilityRow = {
  jurisdiction: string;
  label: Text;
  statuses: ApplicabilityStatusRow[];
  /** What `applicability` returned, which the Dutch sentences may read. */
  data: Applicability;
};

/**
 * DEC-032, DEC-041: `applicability(id, j)` for every jurisdiction of the model in sorted order. Each
 * status is stated, inherited (with the ancestor it comes from) or no-data; a gap stays a gap and
 * is never turned into "not applicable" here.
 */
export function applicabilityRows(host: Host, id: string): ApplicabilityRow[] {
  const jurisdictions = host.model.jurisdictions;
  const statusVocabulary = host.model.vocab['applicability-status']?.values ?? [];
  const labelOf = (jurisdiction: string): Text =>
    Object.hasOwn(jurisdictions, jurisdiction)
      ? (jurisdictions[jurisdiction]?.label ?? { en: jurisdiction })
      : { en: jurisdiction };
  const rows: ApplicabilityRow[] = [];
  for (const jurisdiction of Object.keys(jurisdictions).sort()) {
    const result = host.engine.applicability(id, jurisdiction);
    if (result.data === null) continue;
    const data = result.data;
    rows.push({
      jurisdiction,
      label: labelOf(jurisdiction),
      data,
      statuses: data.statuses.map((entry) => ({
        status: entry.status,
        label: statusVocabulary.find((member) => member.id === entry.status)?.label ?? {
          en: entry.status,
        },
        basis: entry.basis,
        from: entry.from === null ? null : { id: entry.from, label: labelOf(entry.from) },
        certainty: entry.certainty,
        conclusion:
          result.conclusions.find((conclusion) => conclusion.params.status === entry.status) ??
          null,
      })),
    });
  }
  return rows;
}
