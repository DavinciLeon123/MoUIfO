import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { type ConditionState, evaluateCondition, resolveContext } from './conditions.ts';
import {
  chainCertainty,
  componentStep,
  conclusion,
  dedupeSteps,
  factStep,
  ruleStep,
} from './explain.ts';
import type { Condition } from './model-types.ts';
import type { Certainty, Conclusion, EdgeKind, Result, Step, Warning } from './types.ts';

/** The longest chain relate looks for (SPEC §6.2, DEC-066). */
const MAX_HOPS = 4;

/** One hop of a chain: the strongest edge between the two schemes and the parallel edges. */
export type RelationHop = {
  /** The scheme the chain leaves, in the direction asked. */
  from: string;
  /** The scheme the chain reaches, in the direction asked. */
  to: string;
  step: Step;
  also_via: Step[];
};

/** One chain of schemes: the sequence, its hops, its certainty and the explanation behind it. */
export type RelationPath = {
  schemes: string[];
  hops: RelationHop[];
  certainty: Certainty;
  explanation: Step[];
};

/** A model edge in its stored direction, with the sourced step it contributes. */
type Edge = {
  kind: EdgeKind;
  from: string;
  to: string;
  step: Step;
  condition: Condition | undefined;
  /** The hop text of the conclusion, in the stored direction, without the inverse mark. */
  text: string;
};

type Traversal = { edge: Edge; inverse: boolean };

type Neighbour = { to: string; traversals: Traversal[] };

/** The edges of the model, built once: every scheme's neighbours with both directions of each edge. */
export type EdgeIndex = {
  edges: Edge[];
  neighbours: Map<string, Neighbour[]>;
};

const KIND_ORDER: Record<EdgeKind, number> = { relation: 0, rule: 1, component: 2 };

/** A copy of a step, so a result never shares an object with the edge index or another result. */
function copyStep(step: Step): Step {
  const copy: Step = { ...step, source: step.source === null ? null : { ...step.source } };
  if (step.condition !== undefined) copy.condition = { ...step.condition };
  return copy;
}

function oriented(edge: Edge, inverse: boolean): Step {
  const step = copyStep(edge.step);
  step.edge = edge.kind;
  step.inverse = inverse;
  return step;
}

/**
 * Build the edge index once at createEngine (SPEC §6.1): every `relations` entry (scheme to
 * target), every rule (input to output) and every `components` entry (composite to component),
 * each a distinct edge, in sorted scheme and rule id order. An edge whose two ends are the same
 * scheme, or whose end is not a scheme of the model, can never lie on a simple chain and is left out.
 */
export function buildEdges(compiled: CompiledModel): EdgeIndex {
  const edges: Edge[] = [];
  const known = (id: string) => compiled.schemes.has(id);
  const add = (edge: Edge) => {
    if (edge.from === edge.to || !known(edge.from) || !known(edge.to)) return;
    edges.push(edge);
  };

  for (const id of compiled.schemeIds) {
    const scheme = compiled.schemes.get(id)?.scheme;
    if (scheme === undefined) continue;
    (scheme.relations ?? []).forEach((relation, index) => {
      add({
        kind: 'relation',
        from: id,
        to: relation.target,
        step: factStep(compiled, `${id}/relations/${index}`, relation),
        condition: relation.condition,
        text: `${id} ${relation.kind} ${relation.target}`,
      });
    });
    for (const component of scheme.components ?? []) {
      add({
        kind: 'component',
        from: id,
        to: component.scheme,
        step: componentStep(compiled, id, component),
        condition: component.condition,
        text: `${id} contains component ${component.scheme} (prefix ${component.prefix})`,
      });
    }
  }
  for (const ruleId of [...compiled.rules.keys()].sort(byCodeUnit)) {
    const rule = compiled.rules.get(ruleId)?.rule;
    if (rule === undefined) continue;
    add({
      kind: 'rule',
      from: rule.input,
      to: rule.output,
      step: ruleStep(compiled, rule),
      condition: rule.condition,
      text: `rule ${rule.id}: ${rule.input} to ${rule.output}`,
    });
  }

  const byScheme = new Map<string, Map<string, Traversal[]>>();
  const link = (from: string, to: string, traversal: Traversal) => {
    const table = byScheme.get(from) ?? new Map<string, Traversal[]>();
    const list = table.get(to) ?? [];
    list.push(traversal);
    table.set(to, list);
    byScheme.set(from, table);
  };
  for (const edge of edges) {
    link(edge.from, edge.to, { edge, inverse: false });
    link(edge.to, edge.from, { edge, inverse: true });
  }
  const neighbours = new Map<string, Neighbour[]>();
  for (const [from, table] of byScheme) {
    neighbours.set(
      from,
      [...table.keys()].sort(byCodeUnit).map((to) => ({ to, traversals: table.get(to) ?? [] })),
    );
  }
  return { edges, neighbours };
}

/** An edge traversal that survived the context: its step, its condition steps and its strength. */
type Option = { traversal: Traversal; step: Step; conditionSteps: Step[]; strength: Certainty };

function toWarning(code: string, message: string, ref?: string): Warning {
  return ref === undefined ? { code, message } : { code, message, ref };
}

function labelOf(compiled: CompiledModel, id: string): string {
  const label = compiled.schemes.get(id)?.scheme.label.en;
  return label === undefined ? id : `${label} (${id})`;
}

/**
 * Relate two schemes (SPEC §6.2, ENG-05, DEC-066): the direct connection or every shortest chain of
 * at most four hops over relations, rules and components, followed in both directions, with no
 * scheme twice. One path per scheme sequence; the strongest edge of each hop is its step and the
 * parallel edges are `also_via`. An edge condition the context contradicts drops the edge; one it
 * does not establish adds an assumption step at `likely` (DEC-069).
 */
export function relate(
  compiled: CompiledModel,
  index: EdgeIndex,
  a: unknown,
  b: unknown,
  ctx?: unknown,
): Result<RelationPath[]> {
  const warnings: Warning[] = [];
  const ends: [string, unknown][] = [
    ['a', a],
    ['b', b],
  ];
  for (const [ref, value] of ends) {
    if (typeof value !== 'string') {
      warnings.push(toWarning('invalid-input', 'The scheme id must be a string.', ref));
    } else if (!compiled.schemes.has(value)) {
      warnings.push(
        toWarning('unknown-scheme', 'No scheme with this id exists in the model.', ref),
      );
    }
  }
  if (warnings.length > 0 || typeof a !== 'string' || typeof b !== 'string') {
    return { data: [], conclusions: [], warnings };
  }
  if (a === b) {
    warnings.push(toWarning('same-scheme', 'The two scheme ids are the same scheme.'));
    return { data: [], conclusions: [], warnings };
  }

  const resolved = resolveContext(compiled, ctx);
  warnings.push(...resolved.warnings);

  // Evaluate every edge once under the context: false drops it, otherwise it carries its steps.
  const states = new Map<Edge, ConditionState>();
  for (const edge of index.edges) {
    const owner = edge.step.ref;
    states.set(edge, evaluateCondition(edge.condition, resolved.known, owner));
  }
  const options = new Map<string, { to: string; options: Option[] }[]>();
  for (const [from, list] of index.neighbours) {
    const usable: { to: string; options: Option[] }[] = [];
    for (const neighbour of list) {
      const found: Option[] = [];
      for (const traversal of neighbour.traversals) {
        const state = states.get(traversal.edge);
        if (state === undefined || state.state === 'false') continue;
        const step = oriented(traversal.edge, traversal.inverse);
        const strength = chainCertainty(compiled, [step, ...state.steps]);
        found.push({ traversal, step, conditionSteps: state.steps, strength });
      }
      found.sort((x, y) => {
        const byStrength =
          (compiled.rank.get(y.strength) ?? 0) - (compiled.rank.get(x.strength) ?? 0);
        if (byStrength !== 0) return byStrength;
        const byKind = KIND_ORDER[x.traversal.edge.kind] - KIND_ORDER[y.traversal.edge.kind];
        if (byKind !== 0) return byKind;
        const byRef = byCodeUnit(x.step.ref, y.step.ref);
        if (byRef !== 0) return byRef;
        return Number(x.traversal.inverse) - Number(y.traversal.inverse);
      });
      if (found.length > 0) usable.push({ to: neighbour.to, options: found });
    }
    options.set(from, usable);
  }

  // Iterative deepening over simple scheme sequences; the first depth with a chain is the answer.
  let sequences: string[][] = [];
  for (let depth = 1; depth <= MAX_HOPS && sequences.length === 0; depth += 1) {
    const found: string[][] = [];
    const walk = (chain: string[]) => {
      const last = chain[chain.length - 1];
      if (last === undefined) return;
      if (chain.length - 1 === depth) {
        if (last === b) found.push([...chain]);
        return;
      }
      for (const next of options.get(last) ?? []) {
        if (chain.includes(next.to)) continue;
        if (next.to === b && chain.length !== depth) continue;
        chain.push(next.to);
        walk(chain);
        chain.pop();
      }
    };
    walk([a]);
    sequences = found;
  }

  const built = sequences.map((schemes) => {
    const hops: RelationHop[] = [];
    const steps: Step[] = [];
    const texts: string[] = [];
    for (let i = 0; i + 1 < schemes.length; i += 1) {
      const from = schemes[i] as string;
      const to = schemes[i + 1] as string;
      const list = (options.get(from) ?? []).find((each) => each.to === to)?.options ?? [];
      const [chosen, ...rest] = list;
      if (chosen === undefined) throw new Error('a chain hop lost its edge');
      hops.push({
        from,
        to,
        step: copyStep(chosen.step),
        also_via: rest.map((each) => copyStep(each.step)),
      });
      steps.push(chosen.step, ...chosen.conditionSteps);
      texts.push(`${chosen.traversal.edge.text}${chosen.traversal.inverse ? ' (inverse)' : ''}`);
    }
    const explanation = dedupeSteps(steps).map(copyStep);
    const path: RelationPath = {
      schemes,
      hops,
      certainty: chainCertainty(compiled, explanation),
      explanation,
    };
    return { path, text: texts.join('; ') };
  });
  built.sort((x, y) => {
    const byStrength =
      (compiled.rank.get(y.path.certainty) ?? 0) - (compiled.rank.get(x.path.certainty) ?? 0);
    return byStrength !== 0
      ? byStrength
      : byCodeUnit(x.path.schemes.join(' '), y.path.schemes.join(' '));
  });
  const paths = built.map((each) => each.path);

  if (paths.length === 0) {
    warnings.push(
      toWarning('no-chain', 'No chain of at most four steps connects the two schemes.'),
    );
    return { data: [], conclusions: [], warnings };
  }

  const conclusions: Conclusion[] = built.map(({ path, text }) => {
    const count = path.hops.length;
    return conclusion(
      compiled,
      'relate.path',
      { a, b, steps: String(count) },
      `${labelOf(compiled, a)} and ${labelOf(compiled, b)} are connected in ${count} ${count === 1 ? 'step' : 'steps'}: ${text}.`,
      path.explanation,
    );
  });
  return { data: paths, conclusions, warnings };
}
