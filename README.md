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
- Everything under `model/`, `dist/`, `sources/` and `docs/` is licensed under CC-BY-4.0, see `LICENSE-model`. Credit line for the CC-BY content: Davinci Conclusion, as produced for the CoE-DSC.
- The licence scope is recorded in `DECISIONS.md` as DEC-013.

## Development

- Node 24 per `.nvmrc`; Node 22.18 or newer is supported.
- Commands: `npm install`, `npm test`, `npm run check`, `npm run guard`, `npm run validate`, `npm run build`.
- `config.yaml` is the single place for the namespace and the npm scope. After changing `npm_scope`, run `npm run config:sync` and then `npm install`.
- npm builds workspaces in glob order (engine, mcp, web). A new workspace that others depend on and that sorts earlier must be listed explicitly in dependency order.

## Personal numbers

Never commit a BSN or any other personal number. CI fails a pull request that adds an elfproef-valid 9-digit value outside `tools/guards/personal-number-allowlist.txt`, also when a later commit removes it.
