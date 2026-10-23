# MoUIfO
Mapping of Unique Identifiers for Organizations

The UIO Knowledge Model is a sourced YAML knowledge model about Unique Identifiers of Organisations (KvK number, RSIN, VAT number, EORI, LEI, EUID, GLN and others), a deterministic TypeScript engine that answers questions from that model, and access through a static website and an MCP server. The first audience is the CoE-DSC. Maintainer: Leon Roseleur, Davinci Conclusion.

## Status

Phase 1: repository foundations. There is no model data yet.

## Documents

- `SPEC.md`: English working translation of the build specification
- `SPEC.nl.md`: Dutch original of the build specification
- `DECISIONS.md`: append-only decision log; it overrides `SPEC.md`
- `LICENSE`: EUPL-1.2 (code)
- `LICENSE-model`: CC BY 4.0 legal code (model content)

## Licences

- Code, configuration and tooling are licensed under EUPL-1.2, see `LICENSE`.
- Everything under `model/`, `dist/`, `sources/`, `docs/`, `ontology/` and `shapes/` is licensed under CC-BY-4.0, see `LICENSE-model`. Credit line for the CC-BY content: Davinci Conclusion, as produced for the CoE-DSC.
- The licence scope is recorded in `DECISIONS.md` as DEC-013, extended to `ontology/` and `shapes/` by DEC-058.

## Development

- Node 24 per `.nvmrc`; Node 22.18 or newer is supported.
- Commands: `npm install`, `npm test`, `npm run check`, `npm run guard`, `npm run validate`, `npm run build`.
- `config.yaml` is the single place for the namespace and the npm scope. After changing `npm_scope`, run `npm run config:sync` and then `npm install`, and update the MCP configuration examples in this README (DEC-075); a test checks them against config.yaml.
- npm builds workspaces in glob order (engine, mcp, web). A new workspace that others depend on and that sorts earlier must be listed explicitly in dependency order.

## MCP server

`packages/mcp` is a stdio MCP server built on `@modelcontextprotocol/server`. It exposes the six engine functions as the tools `uio_recognise`, `uio_describe`, `uio_applicability`, `uio_relate`, `uio_derive` and `uio_check`, and the resource `uio://model/summary`. Every answer is the engine's full Result (conclusions with certainty, source and explanation), and the tool descriptions ask the model to report them exactly as returned.

The MCP client sees every value you enter, and so does the language model it uses. The server itself stores, logs and sends nothing, and reads only the model shipped inside the package.

The npx form works once the package is published to npm; until then, use the local build. Once it is published, pin a version in the configuration, because the model version equals the package version.

Answers can be tens of kilobytes (the description of one scheme is about 30 KB of JSON). They are never shortened.

### Local build

Run `npm install` and `npm run build` in your checkout. The server is then `packages/mcp/dist/cli.js`. In the examples below, replace `/absolute/path/to/MoUIfO` with the absolute path of your checkout.

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`), then restart Claude Desktop. Local build:

```json
{
  "mcpServers": {
    "uio": {
      "command": "node",
      "args": ["/absolute/path/to/MoUIfO/packages/mcp/dist/cli.js"]
    }
  }
}
```

From npm, after publication:

```json
{
  "mcpServers": {
    "uio": {
      "command": "npx",
      "args": ["-y", "@uio/mcp-server"]
    }
  }
}
```

### VS Code

Edit `.vscode/mcp.json` in your workspace, then start the server from the MCP view. Local build:

```json
{
  "servers": {
    "uio": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/MoUIfO/packages/mcp/dist/cli.js"]
    }
  }
}
```

From npm, after publication:

```json
{
  "servers": {
    "uio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@uio/mcp-server"]
    }
  }
}
```

## Personal numbers

Never commit a BSN or any other personal number. CI fails a pull request that adds an elfproef-valid 9-digit value outside `tools/guards/personal-number-allowlist.txt`, also when a later commit removes it.
