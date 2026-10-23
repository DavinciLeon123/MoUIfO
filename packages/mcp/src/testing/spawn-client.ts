import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

/** Absolute path of the built bin entry, `packages/mcp/dist/cli.js`. */
export const CLI_PATH: string = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

export type Spawned = {
  client: Client;
  stderr: () => string;
  close: () => Promise<void>;
};

/**
 * A real child process of `node dist/cli.js` behind the SDK's stdio client. stderr is piped and its
 * listener is attached before `connect()` (RESEARCH Pitfall 7), so nothing early is lost.
 */
export async function connectSpawned(mode: 'legacy' | 'auto' = 'legacy'): Promise<Spawned> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const client = new Client(
    { name: 'uio-mcp-test', version: '0.0.0' },
    { versionNegotiation: { mode } },
  );
  await client.connect(transport);
  return { client, stderr: () => stderr, close: () => client.close() };
}
