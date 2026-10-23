import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadDistModel } from './testing/load-model.ts';
import { connectSpawned, type Spawned } from './testing/spawn-client.ts';
import { CLOSING_SENTENCE, TOOL_ANNOTATIONS } from './tools.ts';

/**
 * The tracer over a really spawned `node packages/mcp/dist/cli.js` (D-04, D-05, D-08). The mcp
 * project's globalSetup has built the engine, the package and the model copy before this runs.
 */

let session: Spawned;

beforeAll(async () => {
  session = await connectSpawned('legacy');
}, 30_000);

afterAll(async () => {
  await session.close();
});

test('the spawned server lists uio_derive with its schemas, annotations and the closing sentence', async () => {
  const { tools } = await session.client.listTools();
  const tool = tools.find((t) => t.name === 'uio_derive');
  expect(tool).toBeDefined();
  expect(tool?.inputSchema.type).toBe('object');
  expect(tool?.outputSchema).toBeDefined();
  expect(tool?.annotations).toMatchObject(TOOL_ANNOTATIONS);
  expect(tool?.description?.endsWith(CLOSING_SENTENCE)).toBe(true);
});

test('uio_derive over stdio returns the engine Result unchanged, structured and as one text block', async () => {
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
