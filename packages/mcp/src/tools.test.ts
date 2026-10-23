import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { connectInProcess, type InProcess } from './testing/in-process.ts';
import { loadDistModel } from './testing/load-model.ts';
import { CLOSING_SENTENCE } from './tools.ts';

let session: InProcess;

beforeAll(async () => {
  session = await connectInProcess();
});

afterAll(async () => {
  await session.close();
});

test.for(['uio_derive', 'uio_check'])(
  'listTools offers %s with its schemas, annotations and the closing sentence',
  async (name) => {
    const { tools } = await session.client.listTools();
    const tool = tools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.type).toBe('object');
    expect(tool?.outputSchema).toBeDefined();
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool?.description?.endsWith(CLOSING_SENTENCE)).toBe(true);
  },
);

test('uio_derive returns the engine Result unchanged, structured and as one text block', async () => {
  const direct = createEngine(loadDistModel()).derive('NL001469630', 'eori');
  const reply = await session.client.callTool({
    name: 'uio_derive',
    arguments: { value: 'NL001469630', scheme: 'eori' },
  });
  expect(reply.isError).toBeFalsy();
  expect(reply.structuredContent).toEqual(direct);
  const content = reply.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  expect(content[0]?.text).toBe(JSON.stringify(direct));
});

const TRIPLE = ['NL001469630', 'NL001469630B01', '001469630'];

test.for([
  ['without ctx', undefined],
  ['with ctx entity_form legal-person', { entity_form: 'legal-person' }],
] as const)(
  'uio_check %s returns the engine Result unchanged, structured and as one text block',
  async ([, ctx]) => {
    const direct = createEngine(loadDistModel()).check(TRIPLE, ctx);
    expect(direct.data).toHaveLength(3);
    const reply = await session.client.callTool({
      name: 'uio_check',
      arguments: ctx === undefined ? { values: TRIPLE } : { values: TRIPLE, ctx },
    });
    expect(reply.isError).toBeFalsy();
    expect(reply.structuredContent).toEqual(direct);
    const content = reply.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    expect(content[0]?.text).toBe(JSON.stringify(direct));
  },
);
