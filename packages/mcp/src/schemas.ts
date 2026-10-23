import * as z from 'zod/v4';

// Input schemas (D-07): type and shape only, no length, count or pattern refinement, so a value the
// engine answers with a warning never becomes an SDK error instead (D-09, RESEARCH Pitfall 5). The
// objects are closed: only the keys the engine reads are accepted.

/** The optional context of derive, check and relate (DEC-069): the closed condition keys. */
export const ContextSchema = z.strictObject({
  issuing_country: z.string().optional(),
  entity_form: z.string().optional(),
  context: z.string().optional(),
});

/** The optional hint of recognise. */
export const HintSchema = z.strictObject({
  country: z.string().optional(),
});

// Output schemas (RESEARCH Pitfall 4): the SDK validates structuredContent against the output schema
// before the result leaves the server, so every object the engine may extend is a looseObject.

export const CertaintySchema = z.enum(['certain', 'likely', 'possible']);

export const ConditionSchema = z.looseObject({
  issuing_country: z.string().optional(),
  entity_form: z.string().optional(),
  context: z.string().optional(),
});

export const SourceRefSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  type: z.enum(['law', 'standard', 'register-doc', 'expert', 'analysis']),
  date: z.string(),
  url: z.string().optional(),
  eli: z.string().optional(),
});

export const StepSchema = z.looseObject({
  kind: z.enum(['fact', 'rule', 'pattern', 'checksum', 'assumption', 'component']),
  ref: z.string(),
  certainty: CertaintySchema,
  condition: ConditionSchema.optional(),
  source: SourceRefSchema.nullable(),
  edge: z.enum(['relation', 'rule', 'component']).optional(),
  inverse: z.boolean().optional(),
});

export const ConclusionSchema = z.looseObject({
  key: z.string(),
  params: z.record(z.string(), z.string()),
  statement: z.string(),
  certainty: CertaintySchema,
  explanation: z.array(StepSchema),
});

export const WarningSchema = z.looseObject({
  code: z.string(),
  message: z.string(),
  ref: z.string().optional(),
});

/** The `{ data, conclusions, warnings }` envelope every engine function returns. */
export const ResultOf = <T extends z.ZodType>(data: T) =>
  z.looseObject({
    data,
    conclusions: z.array(ConclusionSchema),
    warnings: z.array(WarningSchema),
  });

/** One derivation (DEC-067), field for field as the engine's `Derivation`. */
export const DerivationSchema = z.looseObject({
  from: z.string(),
  scheme: z.string(),
  value: z.string(),
  rules: z.array(z.string()),
  hops: z.number(),
  certainty: CertaintySchema,
  explanation: z.array(StepSchema),
});
