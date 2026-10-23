import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

/** Absolute path of the built bin entry, `packages/mcp/dist/cli.js`. */
export const CLI_PATH: string = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

/**
 * The one stderr capture the privacy tests rely on: everything the stream emits, as text, readable
 * at any time. It accepts the Buffer chunks of a child process and the strings of a stream with an
 * encoding alike. A positive control in privacy.test.ts runs a child that writes a value to stderr
 * through this same function, so an empty capture can never be mistaken for a clean one.
 */
export function captureStderr(
  stream:
    | { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown }
    | null
    | undefined,
): () => string {
  let captured = '';
  stream?.on('data', (chunk) => {
    captured += chunk.toString();
  });
  return () => captured;
}

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
  const stderr = captureStderr(transport.stderr);
  const client = new Client(
    { name: 'uio-mcp-test', version: '0.0.0' },
    { versionNegotiation: { mode } },
  );
  await client.connect(transport);
  return { client, stderr, close: () => client.close() };
}
