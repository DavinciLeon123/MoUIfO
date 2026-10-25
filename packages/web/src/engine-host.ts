import { assertModelContract, createEngine, type Engine, type Model } from '@uio/engine';

export type * from '@uio/engine';

export type Host = { model: Model; engine: Engine };

/** The only place the website touches the engine package: check the contract, then build. */
export function createHost(raw: unknown): Host {
  assertModelContract(raw);
  return { model: raw, engine: createEngine(raw) };
}
