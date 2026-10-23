import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createEngine, type Engine, type Model } from '@uio/engine';
import { createServer } from '../server.ts';
import { loadDistModel } from './load-model.ts';

export type InProcess = {
  client: Client;
  engine: Engine;
  model: Model;
  close: () => Promise<void>;
};

/** An MCP client linked in process to `createServer` over the real `dist/model.json`. */
export async function connectInProcess(): Promise<InProcess> {
  const model = loadDistModel();
  const engine = createEngine(model);
  const server = createServer(model, engine);
  const client = new Client({ name: 'uio-mcp-test', version: '0.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    client,
    engine,
    model,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
