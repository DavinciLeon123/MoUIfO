import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as z from 'zod/v4';
import * as shipped from './schemas.ts';
import { STRICT_SCHEMAS } from './schemas.ts';
import { connectInProcess, type InProcess } from './testing/in-process.ts';
import { loadDistModel } from './testing/load-model.ts';

// The corpus proof of RESEARCH Pitfall 4: the SDK validates structuredContent against the output
// schema before a result leaves the server, so a schema that is too tight would turn a correct
// answer into isError. Every result of this engine over this model, for a corpus of examples,
// every scheme and jurisdiction and five contexts, must parse against the shipped loose schemas
// (correct) and against their strict twins (complete: every emitted field is typed). Failures are
// collected as tool, call index and the first three issues, never printed as raw values.

const model = loadDistModel();
const engine = createEngine(model);

type SchemaSet = {
  ResultOf: (data: z.ZodType) => z.ZodType;
  CandidateSchema: z.ZodType;
  SchemeDescriptionSchema: z.ZodType;
  ApplicabilitySchema: z.ZodType;
  RelationPathSchema: z.ZodType;
  DerivationSchema: z.ZodType;
  ConsistencyFindingSchema: z.ZodType;
};

function outputs(set: SchemaSet): Record<string, z.ZodType> {
  return {
    recognise: set.ResultOf(z.array(set.CandidateSchema)),
    describe: set.ResultOf(set.SchemeDescriptionSchema.nullable()),
    applicability: set.ResultOf(set.ApplicabilitySchema.nullable()),
    relate: set.ResultOf(z.array(set.RelationPathSchema)),
    derive: set.ResultOf(z.array(set.DerivationSchema)),
    check: set.ResultOf(z.array(set.ConsistencyFindingSchema)),
  };
}

const SETS: [string, Record<string, z.ZodType>][] = [
  ['shipped loose', outputs(shipped)],
  ['strict twin', outputs(STRICT_SCHEMAS)],
];

type Ctx = { issuing_country?: string; entity_form?: string; context?: string } | undefined;

const CONTEXTS: Ctx[] = [
  undefined,
  { issuing_country: 'NL', entity_form: 'legal-person' },
  { entity_form: 'fiscal-unit' },
  { entity_form: 'sole-proprietorship' },
  { issuing_country: 'BE' },
];

const schemeIds = Object.keys(model.schemes);
const jurisdictionIds = Object.keys(model.jurisdictions);

// Every example value and every rule example input and output, deduplicated in input order.
const values: string[] = [
  ...new Set(
    Object.values(model.schemes).flatMap((scheme) => [
      ...(scheme.format?.examples_valid ?? []),
      ...(scheme.format?.examples_invalid ?? []),
      ...(scheme.rules ?? []).flatMap((rule) =>
        (rule.examples ?? []).flatMap((each) => [each.in, each.out]),
      ),
    ]),
  ),
];

type Failure = { tool: string; set: string; call: string; issues: string[] };

describe('output schemas over the real model', () => {
  const failures: Failure[] = [];
  let checked = 0;

  /** Parse one engine Result against every set; a failure records tool, call label and issues. */
  function verify(tool: string, call: string, result: unknown): void {
    checked += 1;
    for (const [set, schemas] of SETS) {
      const schema = schemas[tool];
      if (schema === undefined) throw new Error(`no schema for ${tool}`);
      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        failures.push({
          tool,
          set,
          call,
          issues: parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        });
      }
    }
  }

  beforeAll(() => {
    const first30 = values.slice(0, 30);
    const triple = ['NL001469630', 'NL001469630B01', '001469630', 'DE123456789012345'];

    values.forEach((value, v) => {
      verify('recognise', `recognise#${v}`, engine.recognise(value));
      verify('recognise', `recognise#${v}+NL`, engine.recognise(value, { country: 'NL' }));
      CONTEXTS.forEach((ctx, c) => {
        verify('derive', `derive#${v}/ctx${c}`, engine.derive(value, undefined, ctx));
        for (const id of schemeIds) {
          verify('derive', `derive#${v}/${id}/ctx${c}`, engine.derive(value, id, ctx));
        }
      });
    });

    CONTEXTS.forEach((ctx, c) => {
      verify('check', `check first30/ctx${c}`, engine.check(first30, ctx));
      verify('check', `check triple/ctx${c}`, engine.check(triple, ctx));
      for (const a of schemeIds) {
        for (const b of schemeIds) {
          verify('relate', `relate ${a}>${b}/ctx${c}`, engine.relate(a, b, ctx));
        }
      }
    });

    for (const id of [...schemeIds, 'no-such-scheme']) {
      verify('describe', `describe ${id}`, engine.describe(id));
      for (const j of [...jurisdictionIds, 'ZZ']) {
        verify('applicability', `applicability ${id}/${j}`, engine.applicability(id, j));
      }
    }
  });

  test('more than 3,000 engine results were checked, from the model and not a handful', () => {
    expect(values.length).toBeGreaterThan(20);
    expect(checked).toBeGreaterThan(3000);
  });

  test('every result parses against the shipped loose schemas and their strict twins', () => {
    expect(failures.slice(0, 10)).toEqual([]);
  });

  test('the strict twin is really strict: an unknown field is rejected, the loose schema accepts it', () => {
    const result = engine.check(['NL001469630', 'NL001469630B01']);
    const extended = { ...result, extra: 1 };
    for (const [set, schemas] of SETS) {
      const accepted = schemas.check?.safeParse(extended).success;
      expect(accepted, set).toBe(set === 'shipped loose');
    }
  });
});

describe('uio_describe through MCP for every scheme', () => {
  let session: InProcess;

  beforeAll(async () => {
    session = await connectInProcess();
  });

  afterAll(async () => {
    await session.close();
  });

  test('describe, the largest shape, never comes back as isError', async () => {
    expect(schemeIds.length).toBeGreaterThan(10);
    for (const id of schemeIds) {
      const reply = await session.client.callTool({
        name: 'uio_describe',
        arguments: { scheme: id },
      });
      expect(reply.isError, id).toBeFalsy();
      expect(reply.structuredContent).toEqual(engine.describe(id));
    }
  });
});
