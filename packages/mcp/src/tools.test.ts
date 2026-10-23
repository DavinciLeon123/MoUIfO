import { readFileSync } from 'node:fs';
import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { connectInProcess, type InProcess } from './testing/in-process.ts';
import { loadDistModel } from './testing/load-model.ts';
import { CLOSING_SENTENCE, TOOL_ANNOTATIONS, TOOL_NAMES } from './tools.ts';

let session: InProcess;
const direct = createEngine(loadDistModel());

beforeAll(async () => {
  session = await connectInProcess();
});

afterAll(async () => {
  await session.close();
});

type Reply = {
  isError?: boolean;
  structuredContent?: unknown;
  content: { type: string; text: string }[];
};

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  return (await session.client.callTool({ name, arguments: args })) as Reply;
}

const SORTED_NAMES = [
  'uio_applicability',
  'uio_check',
  'uio_derive',
  'uio_describe',
  'uio_recognise',
  'uio_relate',
];

const PROPERTIES: Record<string, { properties: string[]; required: string[] }> = {
  uio_recognise: { properties: ['value', 'hint'], required: ['value'] },
  uio_describe: { properties: ['scheme'], required: ['scheme'] },
  uio_applicability: {
    properties: ['scheme', 'jurisdiction'],
    required: ['scheme', 'jurisdiction'],
  },
  uio_relate: { properties: ['a', 'b', 'ctx'], required: ['a', 'b'] },
  uio_derive: { properties: ['value', 'scheme', 'ctx'], required: ['value'] },
  uio_check: { properties: ['values', 'ctx'], required: ['values'] },
};

type ObjectProps = {
  properties: Record<
    string,
    { properties?: Record<string, unknown>; additionalProperties?: unknown }
  >;
};

describe('the tool list (D-06, D-07, MCP-03)', () => {
  test('lists exactly the six uio_ tools, equal to TOOL_NAMES', async () => {
    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(SORTED_NAMES);
    expect([...TOOL_NAMES].sort()).toEqual(SORTED_NAMES);
  });

  test.for(SORTED_NAMES)(
    '%s has an object input, an output schema and the three annotations',
    async (name) => {
      const { tools } = await session.client.listTools();
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.outputSchema).toBeDefined();
      expect(tool?.annotations).toMatchObject(TOOL_ANNOTATIONS);
    },
  );

  test.for(SORTED_NAMES)(
    '%s input properties and required list mirror the engine signature',
    async (name) => {
      const { tools } = await session.client.listTools();
      const schema = tools.find((t) => t.name === name)?.inputSchema as {
        properties: Record<string, unknown>;
        required?: string[];
      };
      const expected = PROPERTIES[name];
      expect(Object.keys(schema.properties).sort()).toEqual(
        [...(expected?.properties ?? [])].sort(),
      );
      expect([...(schema.required ?? [])].sort()).toEqual([...(expected?.required ?? [])].sort());
    },
  );

  test('ctx lists exactly issuing_country, entity_form and context and forbids others; hint lists exactly country', async () => {
    const { tools } = await session.client.listTools();
    const propertiesOf = (name: string): ObjectProps['properties'] => {
      const tool = tools.find((t) => t.name === name);
      if (tool === undefined) throw new Error(`${name} is not listed`);
      return (tool.inputSchema as ObjectProps).properties;
    };
    for (const name of ['uio_relate', 'uio_derive', 'uio_check']) {
      const ctx = propertiesOf(name).ctx;
      expect(Object.keys(ctx?.properties ?? {}).sort()).toEqual([
        'context',
        'entity_form',
        'issuing_country',
      ]);
      expect(ctx?.additionalProperties).toBe(false);
    }
    const hint = propertiesOf('uio_recognise').hint;
    expect(Object.keys(hint?.properties ?? {})).toEqual(['country']);
    expect(hint?.additionalProperties).toBe(false);
  });

  test('CLOSING_SENTENCE equals the sentence in SPEC.md section 7.2 and every description ends with it once', async () => {
    const spec = readFileSync(new URL('../../../SPEC.md', import.meta.url), 'utf8');
    const match = /Every tool description ends with: \*"(.+)"\*/.exec(spec);
    expect(match).not.toBeNull();
    expect(CLOSING_SENTENCE).toBe(match?.[1]);
    const { tools } = await session.client.listTools();
    expect(tools).toHaveLength(6);
    for (const tool of tools) {
      expect(tool.description?.endsWith(CLOSING_SENTENCE)).toBe(true);
      expect(tool.description?.split(CLOSING_SENTENCE)).toHaveLength(2);
    }
  });
});

const TRIPLE = ['NL001469630', 'NL001469630B01', '001469630'];

const CASES: [string, string, Record<string, unknown>, () => unknown][] = [
  [
    'uio_recognise a bare EORI',
    'uio_recognise',
    { value: 'NL001469630' },
    () => direct.recognise('NL001469630'),
  ],
  [
    'uio_recognise a VAT number with hint country NL',
    'uio_recognise',
    { value: 'NL001469630B01', hint: { country: 'NL' } },
    () => direct.recognise('NL001469630B01', { country: 'NL' }),
  ],
  ['uio_describe eori', 'uio_describe', { scheme: 'eori' }, () => direct.describe('eori')],
  [
    'uio_applicability eori in NL',
    'uio_applicability',
    { scheme: 'eori', jurisdiction: 'NL' },
    () => direct.applicability('eori', 'NL'),
  ],
  [
    'uio_relate rsin to eori',
    'uio_relate',
    { a: 'rsin', b: 'eori' },
    () => direct.relate('rsin', 'eori'),
  ],
  [
    'uio_relate kbo to eori with ctx entity_form legal-person',
    'uio_relate',
    { a: 'kbo', b: 'eori', ctx: { entity_form: 'legal-person' } },
    () => direct.relate('kbo', 'eori', { entity_form: 'legal-person' }),
  ],
  [
    'uio_derive an EORI as eori',
    'uio_derive',
    { value: 'NL001469630', scheme: 'eori' },
    () => direct.derive('NL001469630', 'eori'),
  ],
  ['uio_check the SPEC triple', 'uio_check', { values: TRIPLE }, () => direct.check(TRIPLE)],
  [
    'uio_check the SPEC triple with ctx entity_form legal-person',
    'uio_check',
    { values: TRIPLE, ctx: { entity_form: 'legal-person' } },
    () => direct.check(TRIPLE, { entity_form: 'legal-person' }),
  ],
];

describe('every tool returns the engine Result unchanged (D-08)', () => {
  test.for(CASES)(
    '%s: structuredContent equals the engine and the text is its exact JSON',
    async ([, name, args, expectedOf]) => {
      const expected = expectedOf();
      const reply = await call(name, args);
      expect(reply.isError).toBeFalsy();
      expect(reply.structuredContent).toEqual(expected);
      expect(reply.content).toHaveLength(1);
      expect(reply.content[0]?.type).toBe('text');
      expect(reply.content[0]?.text).toBe(JSON.stringify(expected));
    },
  );

  test('the representative calls are not vacuous: each returns data', () => {
    for (const [, , , expectedOf] of CASES) {
      const result = expectedOf() as { data: unknown };
      expect(result.data).not.toBeNull();
      expect(Array.isArray(result.data) ? result.data.length : 1).toBeGreaterThan(0);
    }
  });
});

describe('engine warnings stay results, never isError (D-09)', () => {
  const longValue = 'A'.repeat(300);
  const manyValues = Array.from({ length: 51 }, (_, i) => `AB${i}`);

  test.for([
    ['unknown scheme in describe', 'uio_describe', { scheme: 'no-such-scheme' }, 'unknown-scheme'],
    [
      'unknown jurisdiction in applicability',
      'uio_applicability',
      { scheme: 'eori', jurisdiction: 'ZZ' },
      'unknown-jurisdiction',
    ],
    ['empty input in recognise', 'uio_recognise', { value: '' }, 'empty-input'],
    ['a 300-character value in recognise', 'uio_recognise', { value: longValue }, 'input-too-long'],
    ['51 values in check', 'uio_check', { values: manyValues }, 'too-many-values'],
    ['the same scheme twice in relate', 'uio_relate', { a: 'eori', b: 'eori' }, 'same-scheme'],
  ] as const)('D-09 %s is a normal result with warning %s', async ([, name, args, code]) => {
    const reply = await call(name, args as Record<string, unknown>);
    expect(reply.isError).toBeFalsy();
    const result = reply.structuredContent as { data: unknown; warnings: { code: string }[] };
    expect(result.warnings.map((w) => w.code)).toContain(code);
    expect(reply.content[0]?.text).toBe(JSON.stringify(reply.structuredContent));
  });

  test('D-09 an unknown scheme gives data null in describe and applicability', async () => {
    for (const [name, args] of [
      ['uio_describe', { scheme: 'no-such-scheme' }],
      ['uio_applicability', { scheme: 'no-such-scheme', jurisdiction: 'NL' }],
    ] as const) {
      const reply = await call(name, args);
      expect((reply.structuredContent as { data: unknown }).data).toBeNull();
    }
  });
});

describe('the SDK rejects a wrong input shape before the engine runs (D-07)', () => {
  test.for([
    ['a number for value', 'uio_derive', { value: 7 }],
    ['a missing value', 'uio_derive', {}],
    ['an extra ctx key', 'uio_check', { values: TRIPLE, ctx: { colour: 'red' } }],
    [
      'an extra hint key',
      'uio_recognise',
      { value: 'NL001469630', hint: { country: 'NL', region: 'x' } },
    ],
    ['an array for a', 'uio_relate', { a: ['eori'], b: 'rsin' }],
  ] as const)('Input validation error: %s is an isError result', async ([, name, args]) => {
    const reply = await call(name, args as Record<string, unknown>);
    expect(reply.isError).toBe(true);
    expect(reply.content[0]?.text.startsWith('Input validation error')).toBe(true);
  });
});
