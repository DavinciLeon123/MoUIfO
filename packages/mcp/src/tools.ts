import type {
  Applicability,
  Candidate,
  ConsistencyFinding,
  Derivation,
  Engine,
  RelationPath,
  Result,
  SchemeDescription,
} from '@uio/engine';
import * as z from 'zod/v4';
import {
  ApplicabilitySchema,
  CandidateSchema,
  ConsistencyFindingSchema,
  ContextSchema,
  DerivationSchema,
  HintSchema,
  RelationPathSchema,
  ResultOf,
  SchemeDescriptionSchema,
} from './schemas.ts';

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

const recogniseTool = defineTool({
  name: 'uio_recognise',
  title: 'Recognise an identifier',
  text: 'Recognise which identifier schemes one value can belong to: every scheme whose pattern matches the whole value, with its format and checksum results apart, its certainty and its explanation. Several candidates are normal; `hint.country` only re-ranks them.',
  input: z.object({
    value: z.string().describe('one identifier value as entered'),
    hint: HintSchema.optional(),
  }),
  output: ResultOf(z.array(CandidateSchema)) as unknown as z.ZodType<Result<Candidate[]>>,
  run: (engine, args) => engine.recognise(args.value, args.hint),
});

const describeTool = defineTool({
  name: 'uio_describe',
  title: 'Describe a scheme',
  text: 'Describe one identifier scheme by its id: every sourced claim the model holds about it, such as issuer, jurisdiction, format, checksum, relations, rules, applicability and persistence, each with its source and certainty.',
  input: z.object({
    scheme: z.string().describe('scheme id, for example the id of the EORI scheme'),
  }),
  output: ResultOf(SchemeDescriptionSchema.nullable()) as unknown as z.ZodType<
    Result<SchemeDescription | null>
  >,
  run: (engine, args) => engine.describe(args.scheme),
});

const applicabilityTool = defineTool({
  name: 'uio_applicability',
  title: 'Applicability in a jurisdiction',
  text: 'Tell for one scheme and one jurisdiction id whether the scheme is issued, recognised or verifiable there, stated by the model or inherited from a parent jurisdiction, with source and certainty.',
  input: z.object({
    scheme: z.string().describe('scheme id'),
    jurisdiction: z.string().describe('jurisdiction id, for example an ISO 3166 alpha-2 code'),
  }),
  output: ResultOf(ApplicabilitySchema.nullable()) as unknown as z.ZodType<
    Result<Applicability | null>
  >,
  run: (engine, args) => engine.applicability(args.scheme, args.jurisdiction),
});

const relateTool = defineTool({
  name: 'uio_relate',
  title: 'Relate two schemes',
  text: "Find how two schemes are connected: every shortest chain of at most four hops over the model's relations, rules and components, each hop with its source and certainty. `ctx` may state issuing_country, entity_form or context.",
  input: z.object({
    a: z.string().describe('scheme id of the start of the chain'),
    b: z.string().describe('scheme id of the end of the chain'),
    ctx: ContextSchema.optional(),
  }),
  output: ResultOf(z.array(RelationPathSchema)) as unknown as z.ZodType<Result<RelationPath[]>>,
  run: (engine, args) => engine.relate(args.a, args.b, args.ctx),
});

const deriveTool = defineTool({
  name: 'uio_derive',
  title: 'Derive identifiers',
  text: "Derive the identifiers that the model's rules produce from one value, at most four rule steps, each with the rules applied, its certainty and its explanation. `scheme` names the scheme of the input value; `ctx` may state issuing_country, entity_form or context.",
  input: z.object({
    value: z.string().describe('one identifier value as entered'),
    scheme: z.string().optional().describe('scheme id of the input value, when known'),
    ctx: ContextSchema.optional(),
  }),
  output: ResultOf(z.array(DerivationSchema)) as unknown as z.ZodType<Result<Derivation[]>>,
  run: (engine, args) => engine.derive(args.value, args.scheme, args.ctx),
});

const checkTool = defineTool({
  name: 'uio_check',
  title: 'Check identifiers together',
  text: 'Check whether several values can belong to the same organisation: every pair is consistent, inconsistent or no-rule, with the rule chain, its certainty and its explanation; values are referred to by position and never repeated. `ctx` may state issuing_country, entity_form or context.',
  input: z.object({
    values: z.array(z.string()).describe('the identifier values as entered, compared pairwise'),
    ctx: ContextSchema.optional(),
  }),
  output: ResultOf(z.array(ConsistencyFindingSchema)) as unknown as z.ZodType<
    Result<ConsistencyFinding[]>
  >,
  run: (engine, args) => engine.check(args.values, args.ctx),
});

/** The tool table; a new entry needs no change in server.ts. */
export const TOOLS: readonly ToolDef<z.ZodType, unknown>[] = [
  recogniseTool as ToolDef,
  describeTool as ToolDef,
  applicabilityTool as ToolDef,
  relateTool as ToolDef,
  deriveTool as ToolDef,
  checkTool as ToolDef,
];

/** The six tool names, in the table's order: one tool per engine function (D-06). */
export const TOOL_NAMES = [
  'uio_recognise',
  'uio_describe',
  'uio_applicability',
  'uio_relate',
  'uio_derive',
  'uio_check',
] as const;
