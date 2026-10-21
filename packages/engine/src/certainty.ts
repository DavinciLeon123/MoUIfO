import type { Certainty, Step } from './types.ts';

/** A total, locale-free order for ids (ENG-10): code-unit comparison. */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Certainty id to rank, read from the certainty vocabulary at compile time. */
export type RankMap = ReadonlyMap<Certainty, number>;

function rankOf(certainty: Certainty, rank: RankMap): number {
  return rank.get(certainty) ?? 0;
}

/** The lower of two certainties (the first one on a tie). */
export function lower(a: Certainty, b: Certainty, rank: RankMap): Certainty {
  return rankOf(b, rank) < rankOf(a, rank) ? b : a;
}

/** The certainty of the lowest-ranked step: the weakest link of a chain (SPEC §5.1). */
export function weakest(steps: readonly Pick<Step, 'certainty'>[], rank: RankMap): Certainty {
  const first = steps[0];
  if (first === undefined) throw new Error('a conclusion needs at least one step');
  let result = first.certainty;
  for (const step of steps) result = lower(result, step.certainty, rank);
  return result;
}
