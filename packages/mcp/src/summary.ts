import type { Label, Model, Text } from '@uio/engine';

/** The URI of the one resource the server serves (D-10). */
export const SUMMARY_URI = 'uio://model/summary';

/**
 * One scheme of the summary: plain values taken from model fields only (D-10). `abbreviation` and
 * `description` are left out when the model has none; the sourced claims stay in `uio_describe`.
 */
export type SchemeSummary = {
  id: string;
  label: Label;
  abbreviation?: string;
  kind: string;
  jurisdiction: string;
  description?: Text;
};

export type ModelSummary = {
  model_version: string;
  contract: number;
  schemes: SchemeSummary[];
};

/** Code-unit order, never a locale comparison (same input and model give the same text). */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function copyText(text: Text): Text {
  return text.nl === undefined ? { en: text.en } : { en: text.en, nl: text.nl };
}

/**
 * The model summary resource (D-10): one item per scheme, sorted by id, in a fixed key order. It
 * writes no text of its own and does not change the model.
 */
export function buildSummary(model: Model): ModelSummary {
  const ids = Object.keys(model.schemes).sort(byCodeUnit);
  const schemes: SchemeSummary[] = ids.map((id) => {
    const scheme = model.schemes[id] as Model['schemes'][string];
    // Keys are added in the D-10 order; an absent optional key is never written.
    const item: Partial<SchemeSummary> = { id, label: copyText(scheme.label) };
    if (scheme.abbreviation !== undefined) item.abbreviation = scheme.abbreviation.value;
    item.kind = scheme.kind.value;
    item.jurisdiction = scheme.jurisdiction.value;
    if (scheme.scope !== undefined) item.description = copyText(scheme.scope);
    return item as SchemeSummary;
  });
  return { model_version: model.model_version, contract: model.contract, schemes };
}
