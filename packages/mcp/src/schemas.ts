import * as z from 'zod/v4';

// Input schemas (D-07): type and shape only, no length, count or pattern refinement, so a value the
// engine answers with a warning never becomes an SDK error instead (D-09, RESEARCH Pitfall 5). The
// input objects are closed at every level: the six tool inputs in tools.ts and the ctx and hint
// objects below are strict objects, so a misnamed key is an input validation error and is never
// dropped silently. The output schemas further down are deliberately loose.

/** The optional context of derive, check and relate (DEC-069): the closed condition keys. */
export const ContextSchema = z.strictObject({
  issuing_country: z.string().optional().describe('ISO 3166 alpha-2 code of the issuing country'),
  entity_form: z.string().optional().describe('legal form id of the organisation'),
  context: z.string().optional().describe('context id'),
});

/** The optional hint of recognise. */
export const HintSchema = z.strictObject({
  country: z.string().optional().describe('ISO 3166 alpha-2 code that re-ranks the candidates'),
});

// Output schemas (RESEARCH Pitfall 4): the SDK validates structuredContent against the output schema
// before the result leaves the server, so every object the engine may extend is a looseObject. The
// same definitions are built a second time with strictObject for the corpus test (STRICT_SCHEMAS):
// the loose set can never reject a correct result, the strict twin proves it also types every field
// the engine emits. One definition per shape, taking the object constructor.

export const CertaintySchema = z.enum(['certain', 'likely', 'possible']);

type ObjectFactory = (shape: z.ZodRawShape) => z.ZodObject;

function buildOutputSchemas(object: ObjectFactory) {
  const ConditionSchema = object({
    issuing_country: z.string().optional(),
    entity_form: z.string().optional(),
    context: z.string().optional(),
  });

  const SourceRefSchema = object({
    id: z.string(),
    title: z.string(),
    type: z.enum(['law', 'standard', 'register-doc', 'expert', 'analysis']),
    date: z.string(),
    url: z.string().optional(),
    eli: z.string().optional(),
  });

  const StepSchema = object({
    kind: z.enum(['fact', 'rule', 'pattern', 'checksum', 'assumption', 'component']),
    ref: z.string(),
    certainty: CertaintySchema,
    condition: ConditionSchema.optional(),
    source: SourceRefSchema.nullable(),
    edge: z.enum(['relation', 'rule', 'component']).optional(),
    inverse: z.boolean().optional(),
  });

  const ConclusionSchema = object({
    key: z.string(),
    params: z.record(z.string(), z.string()),
    statement: z.string(),
    certainty: CertaintySchema,
    explanation: z.array(StepSchema),
  });

  const WarningSchema = object({
    code: z.string(),
    message: z.string(),
    ref: z.string().optional(),
  });

  /** The `{ data, conclusions, warnings }` envelope every engine function returns. */
  const ResultOf = (data: z.ZodType) =>
    object({
      data,
      conclusions: z.array(ConclusionSchema),
      warnings: z.array(WarningSchema),
    });

  /** One derivation (DEC-067), field for field as the engine's `Derivation`. */
  const DerivationSchema = object({
    from: z.string(),
    scheme: z.string(),
    value: z.string(),
    rules: z.array(z.string()),
    hops: z.number(),
    certainty: CertaintySchema,
    explanation: z.array(StepSchema),
  });

  /** One verdict on a pair of supplied values (DEC-068), field for field as `ConsistencyFinding`. */
  const ConsistencyFindingSchema = object({
    a: z.number(),
    b: z.number(),
    outcome: z.enum(['consistent', 'inconsistent', 'no-rule']),
    direction: z.enum(['a-to-b', 'b-to-a']).nullable(),
    from_scheme: z.string().nullable(),
    to_scheme: z.string().nullable(),
    rules: z.array(z.string()),
    tried: object({ a: z.array(z.string()), b: z.array(z.string()) }),
    certainty: CertaintySchema.nullable(),
    explanation: z.array(StepSchema),
  });

  /** One candidate of recognise (DEC-064); a nested candidate never carries `components`. */
  const candidateShape = {
    scheme: z.string(),
    accepted: z.boolean(),
    certainty: CertaintySchema,
    format: object({ patterns: z.array(z.boolean()), pattern: z.number().nullable() }),
    checksum: object({
      outcomes: z.array(z.enum(['pass', 'fail', 'not-applicable'])),
      result: z.enum(['pass', 'fail', 'none']),
      entry: z.number().nullable(),
    }),
    explanation: z.array(StepSchema),
    specificity: z.number(),
    hint_grade: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    rank_group: z.number(),
  };
  const NestedCandidateSchema = object(candidateShape);
  const CandidateSchema = object({
    ...candidateShape,
    components: z
      .array(
        object({
          prefix: z.string(),
          scheme: z.string(),
          candidates: z.array(NestedCandidateSchema),
        }),
      )
      .optional(),
  });

  /** A value with the source and certainty the model gives it, plus the claim's own extra fields. */
  const SourcedClaimOf = (value: z.ZodType, extra: z.ZodRawShape = {}) =>
    object({
      value,
      certainty: CertaintySchema,
      source: SourceRefSchema,
      condition: ConditionSchema.optional(),
      note: z.string().optional(),
      ...extra,
    });

  const TextSchema = object({ en: z.string(), nl: z.string().optional() });
  const nullableString = z.string().nullable();

  const IssuerInstanceSchema = object({
    id: z.string(),
    label: z.string(),
    jurisdiction: z.string().optional(),
    certainty: CertaintySchema,
    source: SourceRefSchema,
  });

  const ruleLink = object({ id: z.string(), input: z.string(), output: z.string() });
  const trustScore = z.number().nullable();

  /** One scheme as `describe` returns it, field for field as the engine's `SchemeDescription`. */
  const SchemeDescriptionSchema = object({
    id: z.string(),
    label: TextSchema,
    scope: TextSchema.optional(),
    notes: TextSchema.optional(),
    kind: SourcedClaimOf(z.string()),
    issuer: SourcedClaimOf(z.string(), {
      label: z.string(),
      authority_kind: z.enum(['class', 'instance']),
      instances: z.array(IssuerInstanceSchema),
    }),
    jurisdiction: SourcedClaimOf(z.string()),
    abbreviation: SourcedClaimOf(z.string()).optional(),
    availability: SourcedClaimOf(z.string()).optional(),
    iso6523_icd: SourcedClaimOf(nullableString).optional(),
    peppol_eas: SourcedClaimOf(nullableString).optional(),
    legal_basis: z.array(
      SourcedClaimOf(
        object({ title: z.string(), eli: z.string().optional(), url: z.string().optional() }),
      ),
    ),
    validation_source: SourcedClaimOf(object({ label: z.string(), url: z.string() })).optional(),
    mandatory: SourcedClaimOf(z.string()).optional(),
    level: z.array(SourcedClaimOf(z.string())),
    roles: z.array(SourcedClaimOf(z.string())),
    applicability: z.array(
      SourcedClaimOf(object({ jurisdiction: z.string(), status: z.array(z.string()) })),
    ),
    persistence: z.array(SourcedClaimOf(object({ behaviour: z.string(), event: z.string() }))),
    trust: SourcedClaimOf(
      object({
        legal_basis: trustScore,
        registration_quality: trustScore,
        verifiability: trustScore,
        crosswalks: trustScore,
        lifecycle: trustScore,
      }),
    ).optional(),
    relations: z.array(SourcedClaimOf(object({ target: z.string(), kind: z.string() }))),
    format: object({
      patterns: z.array(SourcedClaimOf(z.string())),
      checksum: z.array(
        SourcedClaimOf(object({ algorithm: z.string(), over: z.array(z.unknown()).optional() })),
      ),
      examples_valid: z.array(z.string()),
      examples_invalid: z.array(z.string()),
    }),
    components: z.array(SourcedClaimOf(object({ scheme: z.string(), prefix: z.string() }))),
    context_from: SourcedClaimOf(
      object({
        map: z.string(),
        capture: object({ regex: z.string(), group: z.number() }),
      }),
    ).optional(),
    rules_in: z.array(SourcedClaimOf(ruleLink)),
    rules_out: z.array(SourcedClaimOf(ruleLink)),
  });

  /** The status of one scheme in one jurisdiction (ENG-04). */
  const ApplicabilitySchema = object({
    scheme: z.string(),
    jurisdiction: z.string(),
    statuses: z.array(
      object({
        status: z.string(),
        basis: z.enum(['stated', 'inherited', 'no-data']),
        from: z.string().nullable(),
        certainty: CertaintySchema.nullable(),
        explanation: z.array(StepSchema),
      }),
    ),
  });

  /** One hop of a relation chain: the strongest edge and the parallel edges. */
  const RelationHopSchema = object({
    from: z.string(),
    to: z.string(),
    step: StepSchema,
    also_via: z.array(StepSchema),
  });

  const RelationPathSchema = object({
    schemes: z.array(z.string()),
    hops: z.array(RelationHopSchema),
    certainty: CertaintySchema,
    explanation: z.array(StepSchema),
  });

  return {
    ConditionSchema,
    SourceRefSchema,
    StepSchema,
    ConclusionSchema,
    WarningSchema,
    ResultOf,
    DerivationSchema,
    ConsistencyFindingSchema,
    CandidateSchema,
    SourcedClaimOf,
    SchemeDescriptionSchema,
    ApplicabilitySchema,
    RelationHopSchema,
    RelationPathSchema,
  };
}

const LOOSE_SCHEMAS = buildOutputSchemas(z.looseObject);

/** The same schemas with closed objects, for the corpus test only: never registered with the SDK. */
export const STRICT_SCHEMAS = buildOutputSchemas(z.strictObject);

export const {
  ConditionSchema,
  SourceRefSchema,
  StepSchema,
  ConclusionSchema,
  WarningSchema,
  ResultOf,
  DerivationSchema,
  ConsistencyFindingSchema,
  CandidateSchema,
  SourcedClaimOf,
  SchemeDescriptionSchema,
  ApplicabilitySchema,
  RelationHopSchema,
  RelationPathSchema,
} = LOOSE_SCHEMAS;
