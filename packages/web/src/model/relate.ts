import type {
  Certainty,
  Conclusion,
  EdgeKind,
  Host,
  RelationPath,
  Step,
  Text,
  Warning,
} from '../engine-host.ts';
import { type Lang, modelText, type Rendered } from '../i18n/text.ts';

/**
 * One hop of a chain, read from the engine's `RelationHop`. `from` and `to` are the schemes in the
 * direction the chain was walked; `statedFrom` and `statedTo` are the same two schemes in the
 * direction the model states the edge, which differs exactly when `inverse` is true, so a row can
 * print the model's own statement and keep it true (DEC-066).
 */
export type HopRow = {
  from: string;
  to: string;
  statedFrom: string;
  statedTo: string;
  edgeType: EdgeKind;
  /** The relation kind id, the rule id or the component prefix. */
  edgeRef: string;
  /**
   * The model's wording of the edge: the vocabulary label of the relation kind (en and, where the
   * model has it, nl); for a rule the rule id and for a component the prefix, which are data.
   */
  edgeLabel: Text;
  inverse: boolean;
  step: Step;
  alsoVia: Step[];
};

/** One shortest chain: its schemes, hops, certainty and the engine conclusion that explains it. */
export type PathView = {
  schemes: string[];
  certainty: Certainty;
  hops: HopRow[];
  conclusion: Conclusion;
  /** What the engine returned for this chain; the Dutch sentence of the conclusion reads it. */
  data: RelationPath;
};

export type RelateViewModel = { paths: PathView[]; warnings: Warning[] };

/** The kind of edge a step records; relate always sets it, the step kind is the fallback. */
function edgeTypeOf(step: Step): EdgeKind {
  if (step.edge !== undefined) return step.edge;
  return step.kind === 'rule' ? 'rule' : step.kind === 'component' ? 'component' : 'relation';
}

/**
 * The model's edge label of a hop step. A relation step's ref is `<scheme>/relations/<n>`: the kind
 * is that entry's `kind`, shown by its relation-kind vocabulary label. A rule step's ref is the rule
 * id and a component step's ref is `<scheme>/components/<prefix>`.
 */
function edgeOf(host: Host, step: Step): { type: EdgeKind; ref: string; label: Text } {
  const type = edgeTypeOf(step);
  if (type === 'rule') return { type, ref: step.ref, label: { en: step.ref } };
  if (type === 'component') {
    const prefix = step.ref.split('/components/')[1] ?? step.ref;
    return { type, ref: prefix, label: { en: prefix } };
  }
  const match = /^(.+)\/relations\/(\d+)$/.exec(step.ref);
  const owner = match?.[1];
  const kind =
    owner !== undefined && Object.hasOwn(host.model.schemes, owner)
      ? host.model.schemes[owner]?.relations?.[Number(match?.[2])]?.kind
      : undefined;
  const id = kind ?? step.ref;
  const label = host.model.vocab['relation-kind']?.values.find((entry) => entry.id === id)?.label;
  return { type, ref: id, label: label ?? { en: id } };
}

/**
 * D-16, WEB-03: the chains `relate(a, b)` found, called once, each hop with the edge type and
 * label, the inverse marking, its sourced step and the parallel edges (`also_via`). Everything shown
 * is the engine's output; a pair without a chain has no paths and is never turned into a statement
 * that the schemes are unrelated.
 */
export function relateView(host: Host, a: string, b: string): RelateViewModel {
  const result = host.engine.relate(a, b);
  const paths = result.data.map((path, index): PathView => {
    const conclusion = result.conclusions[index];
    if (conclusion === undefined) throw new Error('relate returned a chain without its conclusion');
    return {
      schemes: path.schemes,
      certainty: path.certainty,
      conclusion,
      data: path,
      hops: path.hops.map((hop): HopRow => {
        const edge = edgeOf(host, hop.step);
        const inverse = hop.step.inverse === true;
        return {
          from: hop.from,
          to: hop.to,
          statedFrom: inverse ? hop.to : hop.from,
          statedTo: inverse ? hop.from : hop.to,
          edgeType: edge.type,
          edgeRef: edge.ref,
          edgeLabel: edge.label,
          inverse,
          step: hop.step,
          alsoVia: hop.also_via,
        };
      }),
    };
  });
  return { paths, warnings: [] };
}

/** A scheme for a select: its id and its label in the page language. */
export type SchemeOption = { id: string; label: Rendered };

/** Every scheme of the model with its label, sorted by the label in the page language. */
export function schemeOptions(host: Host, lang: Lang): SchemeOption[] {
  return Object.entries(host.model.schemes)
    .map(([id, scheme]) => ({ id, label: modelText(scheme.label, lang) }))
    .sort((x, y) => x.label.text.localeCompare(y.label.text, lang) || x.id.localeCompare(y.id));
}
