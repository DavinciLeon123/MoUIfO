import { type Applicability, applicability } from './applicability.ts';
import { compileModel } from './compile.ts';
import { describe, type SchemeDescription } from './describe.ts';
import type { Model } from './model-types.ts';
import { type Candidate, recognise } from './recognise.ts';
import { buildEdges, type RelationPath, relate } from './relate.ts';
import type { Context, Result } from './types.ts';

/** The six engine functions of SPEC §6.2 as they exist so far. */
export type Engine = {
  recognise(value: string, hint?: { country?: string }): Result<Candidate[]>;
  describe(schemeId: string): Result<SchemeDescription | null>;
  applicability(schemeId: string, jurisdiction: string): Result<Applicability | null>;
  relate(a: string, b: string, ctx?: Context): Result<RelationPath[]>;
};

/**
 * Compile the model once and return the engine (SPEC §6.1). Refuses a model of another contract and
 * throws one Error that lists every compile problem. The model is only read, never changed.
 */
export function createEngine(model: Model): Engine {
  const compiled = compileModel(model);
  const edges = buildEdges(compiled);
  return Object.freeze({
    recognise: (value: string, hint?: { country?: string }) => recognise(compiled, value, hint),
    describe: (schemeId: string) => describe(compiled, schemeId),
    applicability: (schemeId: string, jurisdiction: string) =>
      applicability(compiled, schemeId, jurisdiction),
    relate: (a: string, b: string, ctx?: Context) => relate(compiled, edges, a, b, ctx),
  });
}
