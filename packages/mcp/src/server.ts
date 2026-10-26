import { McpServer } from '@modelcontextprotocol/server';
import type { Engine, Model } from '@uio/engine';
import { buildSummary, SUMMARY_URI } from './summary.ts';
import { CLOSING_SENTENCE, TOOL_ANNOTATIONS, TOOLS } from './tools.ts';

/**
 * The MCP server over one model and its engine (D-05): the only file that calls the SDK registration
 * API. It reads no file, environment variable or argument; it takes what it is given. Every tool
 * returns the engine's Result unchanged, as structuredContent and as the same compact JSON in one
 * text block (D-08), and never as `isError` for a result the engine returns (D-09). The model
 * summary is the one resource (D-10), computed once per server from model fields only.
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
  const summary = JSON.stringify(buildSummary(model));
  server.registerResource(
    'model-summary',
    SUMMARY_URI,
    {
      title: 'Model summary',
      description:
        'Every identifier scheme of the model with its labels, abbreviation, kind, jurisdiction and scope text.',
      mimeType: 'application/json',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: summary }] }),
  );
  return server;
}
