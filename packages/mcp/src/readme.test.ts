import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createEngine } from '@uio/engine';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { SUMMARY_URI } from './summary.ts';
import { loadDistModel } from './testing/load-model.ts';
import { TOOL_NAMES } from './tools.ts';

/**
 * The README's `## MCP server` section (MCP-06) and DEC-075: the two npx blocks hold the package
 * name as a literal copy of the name derived from `npm_scope` in config.yaml, and this file fails
 * when they differ. The scope is read through `loadConfig`, never written here. The local-build
 * configuration is run exactly as written (MCP-01); the npx blocks are checked as data only, because
 * the package is unpublished and the scope is unproven (DEC-010), so no test contacts the registry.
 */

const PLACEHOLDER = '/absolute/path/to/MoUIfO';
const PRIVACY_SENTENCE =
  'The MCP client sees every value you enter, and so does the language model it uses.';
const PUBLISHED_SENTENCE =
  'The npx form works once the package is published to npm; until then, use the local build.';

const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const scope = loadConfig(REPO_ROOT).npm_scope;
const expectedName = `${scope}/mcp-server`;

/** Every npm-style name that ends in `/mcp-server`, in document order. */
function mcpServerNames(text: string): string[] {
  return text.match(/@[A-Za-z0-9][A-Za-z0-9._-]*\/mcp-server/g) ?? [];
}

/** The names that differ from the one config.yaml derives; an empty list means no drift. */
function nameDrift(text: string): string[] {
  return mcpServerNames(text).filter((name) => name !== expectedName);
}

/** The text of the `## MCP server` section, up to the next `## ` heading. */
function mcpSection(text: string): string {
  const start = text.indexOf('\n## MCP server\n');
  if (start < 0) throw new Error('README.md has no "## MCP server" section');
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, next < 0 ? undefined : next + 1);
}

type McpBlock = {
  command: string;
  args: string[];
  type?: string;
};

type ParsedBlock = { top: 'mcpServers' | 'servers'; entry: McpBlock };

/** The parsed `json` fences of the section, in document order. */
function jsonBlocks(section: string): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  for (const match of section.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    const parsed = JSON.parse(match[1] ?? '') as Record<string, Record<string, McpBlock>>;
    const keys = Object.keys(parsed);
    expect(keys).toHaveLength(1);
    const top = keys[0] as 'mcpServers' | 'servers';
    expect(['mcpServers', 'servers']).toContain(top);
    const entry = parsed[top]?.uio;
    expect(entry).toBeDefined();
    out.push({ top, entry: entry as McpBlock });
  }
  return out;
}

const section = mcpSection(readme);
const blocks = jsonBlocks(section);

describe('the README MCP server section', () => {
  test('has the Local build, Claude Desktop and VS Code subsections', () => {
    expect(section).toContain('\n### Local build\n');
    expect(section).toContain('\n### Claude Desktop\n');
    expect(section).toContain('\n### VS Code\n');
  });

  test('holds the privacy sentence and the publication sentence verbatim', () => {
    expect(section).toContain(PRIVACY_SENTENCE);
    expect(section).toContain(PUBLISHED_SENTENCE);
  });

  test('names every tool and the summary resource', () => {
    for (const name of TOOL_NAMES) expect(section).toContain(name);
    expect(section).toContain(SUMMARY_URI);
  });

  test('has exactly four json blocks: two mcpServers (Claude Desktop) and two servers (VS Code)', () => {
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((b) => b.top === 'mcpServers')).toHaveLength(2);
    const vscode = blocks.filter((b) => b.top === 'servers');
    expect(vscode).toHaveLength(2);
    for (const { entry } of vscode) expect(entry.type).toBe('stdio');
  });

  test.each(['mcpServers', 'servers'] as const)(
    'the %s pair is one local build and one npx entry',
    (top) => {
      const pair = blocks.filter((b) => b.top === top).map((b) => b.entry);
      const local = pair.filter((e) => e.command === 'node');
      const npx = pair.filter((e) => e.command === 'npx');
      expect(local).toHaveLength(1);
      expect(npx).toHaveLength(1);
      expect(local[0]?.args).toEqual([`${PLACEHOLDER}/packages/mcp/dist/cli.js`]);
      expect(npx[0]?.args).toEqual(['-y', expectedName]);
    },
  );
});

describe('DEC-075: the README package name follows config.yaml', () => {
  test('the README holds the name derived from npm_scope and no other mcp-server name', () => {
    expect(readme).toContain(expectedName);
    expect(mcpServerNames(readme).length).toBeGreaterThanOrEqual(2);
    expect(nameDrift(readme)).toEqual([]);
  });

  test('the drift check reports a name that differs from npm_scope, so it cannot pass vacuously', () => {
    const drifted = readme.replaceAll(scope, `${scope}-drift`);
    expect(drifted).not.toBe(readme);
    expect(nameDrift(drifted).length).toBeGreaterThanOrEqual(2);
  });
});

describe('MCP-01: the README local-build configuration runs as written', () => {
  test('the Claude Desktop and VS Code local-build blocks start a server with the six tools and the engine answer', async () => {
    const local = blocks
      .filter((b) => b.entry.command === 'node')
      .map((b) => ({ command: b.entry.command, args: b.entry.args }));
    expect(local).toHaveLength(2);
    expect(local[1]).toEqual(local[0]);

    const root = REPO_ROOT.replace(/\/+$/, '');
    const { command, args } = local[0] as { command: string; args: string[] };
    const resolved = args.map((arg) => arg.replace(PLACEHOLDER, root));
    expect(resolved).toEqual([`${root}/packages/mcp/dist/cli.js`]);

    const transport = new StdioClientTransport({ command, args: resolved, stderr: 'pipe' });
    const client = new Client({ name: 'uio-readme-test', version: '0.0.0' });
    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());

      const reply = await client.callTool({
        name: 'uio_derive',
        arguments: { value: 'NL001469630', scheme: 'eori' },
      });
      expect(reply.isError).toBeFalsy();
      expect(reply.structuredContent).toEqual(
        createEngine(loadDistModel()).derive('NL001469630', 'eori'),
      );

      const summary = await client.readResource({ uri: SUMMARY_URI });
      expect(summary.contents.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  }, 60_000);
});
