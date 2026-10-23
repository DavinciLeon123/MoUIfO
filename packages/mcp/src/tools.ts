import type { ConsistencyFinding, Derivation, Engine, Result } from '@uio/engine';
import * as z from 'zod/v4';
import { ConsistencyFindingSchema, ContextSchema, DerivationSchema, ResultOf } from './schemas.ts';

/** The sentence every tool description ends with (SPEC section 7.2, MCP-03). */
export const CLOSING_SENTENCE =
  'Report conclusions with their certainty and source exactly as returned. Do not add facts about identifiers that are not in the result.';

/** Every tool only reads the model and never reaches outside the process (D-07). */
export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * One tool as plain data (D-05): its name, title, short description without the closing sentence,
 * the zod schemas of its input and output, and `run`, which calls exactly one engine method with the
 * arguments unchanged. The SDK registration lives in server.ts only.
 */
export type ToolDef<I extends z.ZodType = z.ZodType, R = unknown> = {
  name: string;
  title: string;
  text: string;
  input: I;
  output: z.ZodType<R>;
  run: (engine: Engine, args: z.infer<I>) => R;
};

/** Keeps each entry's input type, so `run` receives typed arguments without `any`. */
export function defineTool<I extends z.ZodType, R>(def: ToolDef<I, R>): ToolDef<I, R> {
  return def;
}

const deriveTool = defineTool({
  name: 'uio_derive',
  title: 'Derive identifiers',
  text: "Derive the identifiers that the model's rules produce from one value, at most four rule steps, each with the rules applied, its certainty and its explanation. `scheme` names the scheme of the input value; `ctx` may state issuing_country, entity_form or context.",
  input: z.object({
    value: z.string(),
    scheme: z.string().optional(),
    ctx: ContextSchema.optional(),
  }),
  output: ResultOf(z.array(DerivationSchema)) as z.ZodType<Result<Derivation[]>>,
  run: (engine, args) => engine.derive(args.value, args.scheme, args.ctx),
});

const checkTool = defineTool({
  name: 'uio_check',
  title: 'Check identifiers together',
  text: 'Check whether several values can belong to the same organisation: every pair is consistent, inconsistent or no-rule, with the rule chain, its certainty and its explanation; values are referred to by position and never repeated. `ctx` may state issuing_country, entity_form or context.',
  input: z.object({
    values: z.array(z.string()),
    ctx: ContextSchema.optional(),
  }),
  output: ResultOf(z.array(ConsistencyFindingSchema)) as z.ZodType<Result<ConsistencyFinding[]>>,
  run: (engine, args) => engine.check(args.values, args.ctx),
});

/** The tool table; a new entry needs no change in server.ts. */
export const TOOLS: readonly ToolDef<z.ZodType, unknown>[] = [
  deriveTool as ToolDef,
  checkTool as ToolDef,
];
