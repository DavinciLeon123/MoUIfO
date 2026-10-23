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

test('listTools offers uio_derive with its schemas, annotations and the closing sentence', async () => {
  const { tools } = await session.client.listTools();
  const tool = tools.find((t) => t.name === 'uio_derive');
  expect(tool).toBeDefined();
  expect(tool?.inputSchema.type).toBe('object');
  expect(tool?.outputSchema).toBeDefined();
  expect(tool?.annotations).toMatchObject({
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  });
  expect(tool?.description?.endsWith(CLOSING_SENTENCE)).toBe(true);
});

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
