import { McpServer } from '@modelcontextprotocol/server';
import type { Engine, Model } from '@uio/engine';
import { CLOSING_SENTENCE, TOOL_ANNOTATIONS, TOOLS } from './tools.ts';

/**
 * The MCP server over one model and its engine (D-05): the only file that calls the SDK registration
 * API. It reads no file, environment variable or argument; it takes what it is given. Every tool
 * returns the engine's Result unchanged, as structuredContent and as the same compact JSON in one
 * text block (D-08), and never as `isError` for a result the engine returns (D-09).
 */
export function createServer(model: Model, engine: Engine): McpServer {
  const server = new McpServer({ name: 'uio-mcp-server', version: model.model_version });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: `${tool.text} ${CLOSING_SENTENCE}`,
        inputSchema: tool.input,
        outputSchema: tool.output,
        annotations: TOOL_ANNOTATIONS,
      },
      (args) => {
        const result = tool.run(engine, args) as Record<string, unknown>;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }
  return server;
}
