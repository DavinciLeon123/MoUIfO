import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildSummary, SUMMARY_URI } from './summary.ts';
import { loadDistModel } from './testing/load-model.ts';
import { connectSpawned, type Spawned } from './testing/spawn-client.ts';
import { CLOSING_SENTENCE, TOOL_ANNOTATIONS, TOOL_NAMES } from './tools.ts';

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

/** MCP-01, MCP-04: both protocol eras list the six tools and read the same summary. */
describe.each(['legacy', 'auto'] as const)('the spawned server in the %s era', (mode) => {
  let spawned: Spawned;

  beforeAll(async () => {
    spawned = await connectSpawned(mode);
    // The negotiated version is part of the test output, so a later SDK change is visible.
    console.info(`stdio era ${mode}: negotiated ${spawned.client.getNegotiatedProtocolVersion()}`);
  }, 30_000);

  afterAll(async () => {
    await spawned.close();
  });

  test('lists exactly the six uio_ tools', async () => {
    const { tools } = await spawned.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(tools).toHaveLength(6);
  });

  test('reads the model summary equal to buildSummary of the shipped model', async () => {
    const reply = await spawned.client.readResource({ uri: SUMMARY_URI });
    expect(reply.contents).toHaveLength(1);
    const content = reply.contents[0] as { mimeType?: string; text: string };
    expect(content.mimeType).toBe('application/json');
    expect(content.text).toBe(JSON.stringify(buildSummary(loadDistModel())));
  });
});
