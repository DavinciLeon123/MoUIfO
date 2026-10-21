import { lower, weakest } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import type { Component, Condition, Rule } from './model-types.ts';
import type { Certainty, Conclusion, SourceRef, Step } from './types.ts';

/** What a model statement contributes to a step: its certainty, source and optional condition. */
export type StatementLike = { certainty: string; source: string; condition?: Condition };

/** The cited source of a model statement; a source id the model does not hold is a model error. */
export function sourceRef(compiled: CompiledModel, id: string): SourceRef {
  const ref = compiled.sources.get(id);
  if (ref === undefined) throw new Error(`the model cites the unknown source ${id}`);
  return { ...ref };
}

function certaintyOf(compiled: CompiledModel, certainty: string): Certainty {
  const id = certainty as Certainty;
  if (!compiled.rank.has(id)) throw new Error(`the model uses the unknown certainty ${certainty}`);
  return id;
}

function modelStep(
  compiled: CompiledModel,
  kind: Step['kind'],
  ref: string,
  statement: StatementLike,
): Step {
  const step: Step = {
    kind,
    ref,
    certainty: certaintyOf(compiled, statement.certainty),
    source: sourceRef(compiled, statement.source),
  };
  if (statement.condition !== undefined) step.condition = { ...statement.condition };
  return step;
}

export function patternStep(
  compiled: CompiledModel,
  schemeId: string,
  index: number,
  statement: StatementLike,
): Step {
  return modelStep(compiled, 'pattern', `${schemeId}/patterns/${index}`, statement);
}

export function checksumStep(
  compiled: CompiledModel,
  schemeId: string,
  index: number,
  statement: StatementLike,
): Step {
  return modelStep(compiled, 'checksum', `${schemeId}/checksum/${index}`, statement);
}

export function factStep(compiled: CompiledModel, ref: string, statement: StatementLike): Step {
  return modelStep(compiled, 'fact', ref, statement);
}

export function ruleStep(compiled: CompiledModel, rule: Rule): Step {
  return modelStep(compiled, 'rule', rule.id, rule);
}

export function componentStep(
  compiled: CompiledModel,
  schemeId: string,
  component: Component,
): Step {
  return modelStep(compiled, 'component', `${schemeId}/components/${component.prefix}`, component);
}

/** A fact the caller's context establishes (DEC-069): certain, with no source. */
export function ctxStep(key: string, value: string): Step {
  return {
    kind: 'fact',
    ref: `ctx/${key}`,
    certainty: 'certain',
    condition: { [key]: value },
    source: null,
  };
}

/** A condition key nobody established: assumed true at `likely`, with no source (DEC-069). */
export function assumptionStep(ownerRef: string, key: string, value: string): Step {
  return {
    kind: 'assumption',
    ref: `${ownerRef}/condition/${key}`,
    certainty: 'likely',
    condition: { [key]: value },
    source: null,
  };
}

/** Keep the first step of each kind and ref, preserving order. */
export function dedupeSteps(steps: readonly Step[]): Step[] {
  const seen = new Set<string>();
  const result: Step[] = [];
  for (const step of steps) {
    const identity = `${step.kind}\u0000${step.ref}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(step);
  }
  return result;
}

/** The weakest certainty of a chain, read through the model's certainty ranks. */
export function chainCertainty(compiled: CompiledModel, steps: readonly Step[]): Certainty {
  return weakest(steps, compiled.rank);
}

/** The lower of two certainties through the model's ranks. */
export function lowerOf(compiled: CompiledModel, a: Certainty, b: Certainty): Certainty {
  return lower(a, b, compiled.rank);
}

/**
 * A conclusion whose certainty is that of its weakest step (SPEC §5.1, ENG-08). A conclusion needs
 * at least one step, so an empty list throws.
 */
export function conclusion(
  compiled: CompiledModel,
  key: string,
  params: Record<string, string>,
  statement: string,
  steps: readonly Step[],
): Conclusion {
  return {
    key,
    params,
    statement,
    certainty: weakest(steps, compiled.rank),
    explanation: [...steps],
  };
}
