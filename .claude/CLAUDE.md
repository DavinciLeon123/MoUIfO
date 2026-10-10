## Project rules (read first)

- Read `SPEC.md` (English working translation; the Dutch original is `SPEC.nl.md`) and `DECISIONS.md` before any work.
- `DECISIONS.md` overrides `SPEC.md`, which overrides `SPEC.nl.md`.
- Ask the owner before any new deviation from `SPEC.md` or `DECISIONS.md`, and record an agreed deviation as a new `DECISIONS.md` row.
- The generated sections below (between the GSD markers) are regenerated from planning research, predate `DECISIONS.md` and are never edited by hand. Where they differ from `DECISIONS.md`, `DECISIONS.md` wins; the known differences are listed under "Overridden by DECISIONS.md" directly below.
- `SPEC.md` section 0 refers to `CLAUDE.md`; this file lives at `.claude/CLAUDE.md` (DEC-002).
- Never commit a personal number: tests build valid-looking 9-digit values at runtime, and only entries of `tools/guards/personal-number-allowlist.txt` (public or synthetic, each with a reason) may appear.
- `config.yaml` is the only place for the namespace and the npm scope.

### Overridden by DECISIONS.md

These DECISIONS.md rows override the matching text in the generated sections below; follow the DECISIONS.md value.

- DEC-008 (Node engines): `engines.node` is `>=22.18` for the repository root and every `tools/*` workspace (native `.ts` type stripping is unflagged only from Node 22.18.0); the published `packages/engine` and `packages/mcp` keep `>=22.12`; the CI matrix is Node 22 and 24 with pinned majors (adding Node 26 needs a new DECISIONS.md row). Overrides the `engines.node` = `>=22.12` in the Technology Stack section.
- DEC-006 (MCP SDK): the MCP server uses `@modelcontextprotocol/server` (MCP TypeScript SDK major version 2). Overrides every mention of `@modelcontextprotocol/sdk` in the generated sections (the Project "Tech stack" constraint, the stack flag table, the alternatives table, the fallback variant and the version-compatibility row); the "pending owner OK" wording there is settled.
- DEC-009 (lint gate): `npm run check` is the single local entry (Biome lint + format check + `tsc`), and Biome runs with `--error-on-warnings` because it otherwise exits 0 on warnings; CI fails on any lint or format issue.
- DEC-010 (npm scope): the scope is set only in `config.yaml` (`npm_scope`) and package names are derived from it with `npm run config:sync`; try `@uio`, fall back to `@mouifo`. Overrides the stack section's `@moufo/*` fallback and its "root package.json name template + config.yaml" wording.
- DEC-014 (landscape workbook): the workbook is committed as CSV only and the original xlsx stays local and gitignored; only the Phase 1 export script reads the xlsx, and every later importer reads the committed CSVs. Overrides the stack section's import row that reads the workbook directly.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**UIO Kennismodel (MoUIfO)**

An open-source knowledge model plus engine that helps people who encounter one or more *Unique Identifiers of Organisations* (UIOs) — KvK-nummer, RSIN, btw-nummer, EORI, LEI, EUID, GLN, … — work out for themselves what each identifier is and how they relate. It ships in three layers: a sourced YAML **knowledge model** (published as TTL / JSON-LD / JSON / landscape table), a deterministic TypeScript **engine** (`recognise`, `describe`, `applicability`, `relate`, `derive`, `check`), and **access** via a static website (GitHub Pages) and an MCP server (`npx`). First audience: CoE-DSC insiders and employees, through guided usage (worked example questions and the EORI case), not a blank box.

The authoritative build specification is `SPEC.md` (originally `UIO-Kennismodel-bouwspecificatie.md`, v0.1, 9 Oct 2026, by Leon Roseleur and Joost Wisselink, Davinci Conclusion, for CoE-DSC). This PROJECT.md summarises it; SPEC.md wins on detail.

**Core Value:** Every conclusion about an identifier is traceable to model rules, sources and conditions, and carries its certainty — the knowledge lives in sourced data, never in code or in a language model.

### Constraints

- **Sourcing**: Strict — every statement needs `source` (id in `model/sources/`) and `certainty`; unsourced knowledge is omitted and logged in `docs/gaps.md`. No placeholder expert sources. Consequence: EORI acceptance expectations that rely only on expert sources (e.g. level by issuing country) are asserted only once a source exists.
- **Tech stack**: TypeScript ESM engine, npm workspaces, Vite static site, `@modelcontextprotocol/sdk` stdio — per SPEC §12.
- **Privacy**: Engine bundle contains no `fetch`/`XMLHttpRequest`/`WebSocket` (unit-tested); site has no cookies, analytics or external requests.
- **Determinism**: Same input + model → same output, stable ordering.
- **Knowledge-in-data**: New scheme/relation/rule must require no code change; rule transforms limited to the fixed operation set (SPEC §5.3).
- **Language**: Repo in English; model labels bilingual (`en` required, `nl` where available); UI EN + NL.
- **Process**: Build in SPEC §13 order, each step closed with green tests; deviations from SPEC are flagged and asked first.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Decisions that need the owner's attention first (SPEC deviations / open flags)

| # | SPEC says | Reality (Oct 2026) | Recommendation |
|---|-----------|--------------------|----------------|
| 1 | `@modelcontextprotocol/sdk` (SPEC §7.2, PROJECT constraints) | **MCP TypeScript SDK v2 went stable on 2026-07-27** and ships as **`@modelcontextprotocol/server` 2.3.1** (+ `@modelcontextprotocol/client` for tests). `@modelcontextprotocol/sdk` 1.32.1 is now the **maintenance line** (bug and security fixes "for at least six months after" 2026-07-27, implements spec up to 2025-11-25 only, will not get the 2026-07-28 spec). | **Use v2 (`@modelcontextprotocol/server`).** It is the same project and the same concepts (`McpServer`, `registerTool`, `registerResource`, stdio); starting a greenfield server on a maintenance-only line would force a migration inside the first year. It is also far lighter: 7 packages / 16 MB installed versus the v1 SDK that depends on express, hono, jose, cors, eventsource, etc. **Needs an explicit OK from the owner** because the SPEC names the v1 package. Fallback if refused: `@modelcontextprotocol/sdk@1.32.1` + `zod@^4` (API differs: `server.registerTool` exists in both; v1 uses `StdioServerTransport` + `server.connect`). Confidence HIGH. |
| 2 | "Node LTS" | Active LTS today is **Node 24 "Krypton"** (24.21.0). **Node 26 enters LTS on 2026-10-28** (19 days from today; 26.11.1 is current). Node 24 moves Active to Maintenance on 2026-10-20 and is supported to 2028-04-30; Node 22 is Maintenance to 2027-04-30. | Develop and release on **Node 24**; CI matrix **22 and 24**, add **26 on/after 2026-10-28**. Do not use `lts/*` in CI (it flips to 26 on 2026-10-28 and silently changes the toolchain). Confidence HIGH (nodejs.org dist index + nodejs/Release schedule.json). |
| 3 | npm scope `@uio` (PROJECT: "provisional, unverified") | `@uio/engine`, `@uio/mcp-server`, `@uio/web` all return 404 on the registry (names free), **but this does not prove the scope is claimable**: a user or org named `uio` may already own the scope (npmjs.com returned 403 to automated probing). | Owner should create the npm org `uio` **before** any code relies on the name. Fallback: `@moufo/*` (matches the repo name). Keep the scope in a single place (root `package.json` name template + `config.yaml`) so a rename is a mechanical change. Confidence LOW on availability (unverifiable from here). |
| 4 | SPEC §9: `sources/Analysis of Unique IDs for companies.xlsx` and a conversion script | The workbook has **40 cell hyperlinks** (EUR-Lex ELI, wetten.overheid.nl, register URLs) that carry the *source URLs* the strict-sourcing rule needs. **`read-excel-file` (the modern, popular choice) silently drops hyperlink targets**; `exceljs` finds only 36 of 40. Only SheetJS 0.20.3 returned all 40 (spiked against the real file). One link is polluted with tracking params (`_gl=`, `gclid=`), several have `location` fragments. | Import script uses **SheetJS CE 0.20.3, vendored as a tarball** (see Import section). Strip tracking params in the importer. Confidence HIGH (executed against `UID-table - v1.2.xlsx`). |
| 5 | SPEC §10 test data and §5.2 example use unquoted `examples_invalid: [NL00146963, 001469630]` | In YAML 1.2 core schema, an unquoted `001469630` parses as the **number 1469630** (leading zeros lost silently; long digit strings lose precision as floats). Verified with both `yaml` and `js-yaml`. KvK numbers, RSINs, BSNs, DUNS and GLNs are all digit strings. | Make this a **first-class validator rule** (details in Pitfalls-for-stack below). Every identifier-valued field is `type: string` in the JSON Schema, plus an AST-level check that rejects bare numeric scalars with a leading zero or more than 15 digits anywhere in `model/`. Confidence HIGH (spiked). |

## Recommended Stack

### Runtime and language

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Node.js | **24.x** (24.21.0 today; `.nvmrc` = `24`; `engines.node` = `>=22.12`) | Dev, CI, build tools, MCP runtime | Supported to 2028-04-30; every dependency below was exercised on 24.18. `>=22.12` is the floor imposed by Vitest 5 (`^22.12 \|\| ^24 \|\| >=26`) and Vite 8 (`^20.19 \|\| >=22.12`). Node 20 is EOL (April 2026), so do not support it. Node 24 runs `.ts` files natively (type stripping is on by default; spiked), which removes the need for `tsx`. | HIGH |
| npm | 11.x (ships with Node 24; local 11.16.0) | Package manager, workspaces | SPEC fixes npm workspaces. Needs >= 11.5.1 for trusted publishing (OIDC), which Node 24 satisfies. | HIGH |
| TypeScript | **7.0.2** (native Go compiler, `tsc` binary) | Type-checking and `.d.ts`/JS emit for published packages | Stable `latest` tag. Spiked: `module: nodenext`, `declaration`, JSON import attributes, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions` all work. Much faster full-repo type-check in CI. **Caveat:** TS 7 ships no JS compiler API, so anything that `import`s `typescript` breaks (typescript-eslint's peer range is still `>=4.8.4 <6.1.0`, read from the registry). That is why this stack uses Biome instead of ESLint+typescript-eslint. **Escape hatch:** pin `typescript@~6.0.3` (everything else in this table accepts it, tsdown included); a one-line change. | MEDIUM (brand-new major; the single real risk is tool compatibility, which this stack avoids) |
| `@types/node` | **24.x** (24.19.1) | Node typings | Match the Node major you develop on, not `latest` (26.x). | HIGH |

### Knowledge-model pipeline (Layer 1, build-time only, Node)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `yaml` (eemeli) | **2.9.1** | Parse `model/**/*.yaml` | YAML 1.2 core schema (so Norwegian `NO` stays a string, `yes` stays a string, dates stay strings), **duplicate keys are a hard error** (`DUPLICATE_KEY`, verified), and the Document/AST API plus `LineCounter` gives line/column for any JSON-Pointer path. That lets validation report `model/schemes/eori.yaml:14:9` and emit GitHub Actions `::error file=,line=,col=` annotations. ISC licence, zero dependencies. | HIGH |
| `ajv` | **8.20.0** | JSON Schema validation of YAML (`Ajv2020` class) | De facto standard; draft 2020-12 supports `unevaluatedProperties`, `$defs`, `if/then` for conditional requirements (e.g. `kind: composite` requires `components`). Use `strict: true`, `allErrors: true`. ESM import under `nodenext` (spiked): `import { Ajv2020 } from 'ajv/dist/2020.js'` and `addFormats.default(ajv)`. **Build/CI only**: Ajv compiles validators with `new Function`, so it must never enter the web bundle (would require CSP `unsafe-eval`) or the engine. | HIGH |
| `ajv-formats` | **3.0.1** | `uri`, `date`, `iri` formats | Needed for source `url`/`date` and `eli` fields. | HIGH |
| `json-schema-to-typescript` | 16.0.0 (dev) | Generate `SchemeFile`/`SourceFile` TS types from the JSON Schemas | One source of truth: the schema defines the YAML shape and the generated type is what the build tool consumes, so they cannot drift. Optional; if skipped, hand-write types and test them against the schema. | MEDIUM |
| `n3` | **2.13.11** | Build RDF quads, **write Turtle** (`Writer`), parse Turtle for SHACL and tests (`Parser`, `Store`) | The reference RDF/JS Turtle implementation (MIT, published 2026-10-08, actively maintained). Spiked: parse, `Store`, Writer with prefixes all fine. Needs **`@types/n3` 1.26.4** (n3 ships no types). `n3@3.0.0-alpha` exists; do not use. | HIGH |
| `jsonld` (jsonld.js) | **9.0.0** (build + test only) | `dist/uio.jsonld`: `fromRDF` then `compact` with an embedded context; JSON-LD to N-Quads for the TTL-vs-JSON-LD equivalence test | The reference implementation (BSD-3). Pulls `@digitalbazaar/http-client`, so **pass a `documentLoader` that throws for every remote URL** and embed the `@context` object inline in the output (no `https://...` context URL; this also honours "no external requests" for consumers). Never import it from engine, mcp or web. | HIGH (spiked `fromRDF`), MEDIUM for output-ordering stability (add a snapshot test) |
| `rdf-validate-shacl` | **0.6.5** | SHACL Core validation of the generated graph in CI | Zazuko-maintained, MIT, **34 transitive packages** and works with a plain `n3.Store` as shapes and data, no factory option needed (spiked: correctly reported the missing label, with message, focus node and path). **Limitation, by its own README: no SHACL-SPARQL constraints.** SPEC §5.6.6 and the n-ary `Statement` model need only Core (`sh:minCount`, `sh:class`, `sh:in`, `sh:node`, `sh:pattern`, `sh:datatype`). Last release May 2025, so low churn, not abandoned. | HIGH |
| `csv-stringify` | 6.9.0 | `dist/landscape-table.csv` | Correct RFC 4180 quoting (the table has commas, quotes and newlines in cells); use `csv-stringify/sync`. MIT. | MEDIUM |

### Engine (`@uio/engine`)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| (none) | `dependencies: {}` | Pure TS, ESM, `createEngine(model)` | The strongest possible form of "no network, no I/O dependencies" is **an empty `dependencies` object**. Checksums (elfproef, ISO 7064 mod 97-10, GS1 mod 10), the fixed transform set and BFS are all hand-written (small, unit-tested, and the SPEC requires named algorithms). Do not add a regex library, a graph library or a date library. | HIGH |
| `tsc` (TS 7) | 7.0.2 | Emit `dist/*.js` + `.d.ts` | No bundler needed for a dependency-free library. Ship unbundled ESM with an `exports` map, `"sideEffects": false`, `"files": ["dist"]`. | HIGH |
| `esbuild` | **0.28.2** (dev, **test-only**) | The SPEC §6.3 "engine bundle has no `fetch`/`XMLHttpRequest`/`WebSocket`" unit test | In Vitest, bundle the engine entry with `build({ bundle: true, write: false, metafile: true, platform: 'neutral' })` and assert two things: (1) **every input path is inside `packages/engine/src`** (proves zero third-party code and no `node:` builtins), (2) a regex over the output for `\bfetch\s*\(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `import(`. Spiked and passing. Same esbuild version Vite 8 accepts as optional peer (`^0.27 \|\| ^0.28`). | HIGH |

### Access layer: MCP server (`@uio/mcp-server`)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `@modelcontextprotocol/server` | **2.3.1** (Apache-2.0; `engines.node >=20`) | `McpServer`, `registerTool`, `registerResource`, stdio | Current stable line (spec 2026-07-28). **Spiked end to end**: a server with one tool (with `outputSchema` + `structuredContent`) and the `uio://model/summary` resource answered initialize/tools/call/resources/read over stdio, and **negotiated down correctly** for clients announcing protocol 2025-06-18 and 2025-11-25 (so Claude Desktop and VS Code builds that lag the newest spec keep working). Only 2 runtime deps (`zod`, `@modelcontextprotocol/core`). | HIGH |
| `zod` | **4.6.5** | Tool input/output schemas | v2 takes Standard Schema; import as `import * as z from 'zod/v4'` per the SDK docs. The SDK derives the JSON Schema (SPEC: "een JSON-schema voor de invoer") and validates arguments before your handler runs. | HIGH |
| `@modelcontextprotocol/client` | 2.3.1 (dev) | MCP smoke test in Vitest | Spawn `node packages/mcp/dist/index.js` through `StdioClientTransport` and call the six tools. SPEC §8 says "smoke test op MCP en web (Playwright)"; MCP does not need a browser, so test it with the MCP client in Vitest and keep Playwright for the site. | HIGH |
| `@modelcontextprotocol/inspector` | 2.10.1 (not a dependency; `npx` for manual debugging) | Manual tool exercising | Documented by the SDK for stdio servers. | MEDIUM |

### Access layer: static website (`packages/web`)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Vite | **8.3.4** (Rolldown-based; Node `^20.19 \|\| >=22.12`) | Dev server + production build | Stable since 8.0.0 (2026-03-12, 7 months old). Set `base: './'` (relative asset URLs, works at `https://<owner>.github.io/MoUIfO/` without hard-coding the repo name) and use **hash routing** so GitHub Pages needs no 404-fallback hack. Import `model.json` directly so the model is inside the bundle and the page makes **zero runtime requests** beyond its own static assets. | HIGH |
| Preact | **10.29.8** (pin the 10.x line for v0.1) | UI components (3 views, expandable explanation trees, forms) | SPEC allows "plain TS or Preact". The UI has live-updating results, expandable derivation trees, a form and an SVG graph with accessible state, which is where hand-rolled DOM code gets bug-prone and hard to make WCAG-correct; Preact is 4 kB and has no runtime dependencies. **Why 10, not 11:** Preact **11.0.0 shipped 2026-09-30** (9 days ago, 11.0.1 yesterday) and third-party adapters are still reporting breakage against it; nothing in this project needs an 11 feature. `@preact/signals` 2.11.3 and `@preact/preset-vite` 2.10.6 accept both, so the later upgrade is a version bump plus the official upgrade guide. | MEDIUM-HIGH |
| `@preact/preset-vite` | 2.10.6 (peer `vite` up to 8.x) | JSX transform, prefresh HMR | The standard Preact+Vite integration. | HIGH |
| Plain CSS (custom properties, system font stack) | n/a | Styling, dark/light, high contrast | No CSS framework: zero runtime cost and nothing to audit for external URLs. System font stack means **no font files and no font CDN**. If a brand font is required, self-host via `@fontsource-variable/inter` 5.3.0 imported through Vite so it lands in the bundle (still no external request). | HIGH |

### Testing and quality

| Tool | Version | Purpose | Notes | Confidence |
|------|---------|---------|-------|------------|
| Vitest | **5.0.3** (`engines.node ^22.12 \|\| ^24 \|\| >=26`; peer `vite ^6.4 \|\| ^7 \|\| ^8`) | Unit, model-driven, acceptance (engine level), privacy test, MCP smoke | Spiked on Node 24 + TS 7 + Vite 8: `test.for` table tests and the esbuild-bundle scan ran green. Use `test.projects` (one project per package/tool, all `environment: 'node'`). Model-driven tests: read every YAML in `beforeAll`/at collection time and expand `examples_valid`, `examples_invalid` and rule `examples` into `test.for(cases)`. `@vitest/coverage-v8` 5.0.3 for coverage. Vitest 5.0.0 is only five weeks old; **fallback `vitest@4.1.11`** (tag `V4`) if a blocker appears. | HIGH (works), MEDIUM (maturity) |
| Playwright (`@playwright/test`) | **1.64.0** | Web smoke + EORI acceptance in a real browser, "no external requests" test | Chromium only (`npx playwright install --with-deps chromium`, cache `~/.cache/ms-playwright` keyed on the Playwright version). `webServer: vite preview`. Assert `page.on('request')` sees **only same-origin URLs** and that no `Set-Cookie`/`document.cookie` appears. | HIGH |
| `@axe-core/playwright` | 4.13.0 (axe-core 4.14.0) | Automated WCAG 2.1 AA gate | `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` on each view, in both languages. Automated tooling catches only a subset of WCAG; keep a manual keyboard + screen-reader checklist in the release process. | HIGH |
| Biome | **2.5.15** (dev) | Lint + format for TS/TSX/JSON/CSS, JSX a11y rules | One tool, no dependency on the TypeScript compiler API, so it keeps working with TS 7 (typescript-eslint does not, yet). Type-checking is `tsc --noEmit` (TS 7, fast). **Revisit** when typescript-eslint supports TS 7.1+ if type-aware lint rules are wanted. | MEDIUM |
| `publint` 0.3.25, `@arethetypeswrong/cli` 0.18.5 | dev | Pre-publish package sanity for `@uio/engine` and `@uio/mcp-server` | Run in `release.yml` before `npm publish` (exports map, types resolution under nodenext). | MEDIUM |

### Import script (`tools/import`, run rarely, dev-time only)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **SheetJS CE `xlsx`** | **0.20.3**, **vendored** at `tools/import/vendor/xlsx-0.20.3.tgz` (2.4 MB) and referenced as `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` | Read `UID-table - v1.2.xlsx` (tabs *Overview UIDs*, *Persistence*) **including cell hyperlink targets** (`cell.l.Target`) | Spiked on the real workbook: **40/40 hyperlinks** recovered. License on the 0.20.3 package: **Apache-2.0** (permits redistribution and vendoring; keep the upstream LICENSE inside the vendor folder). The npm registry copy (`xlsx@0.18.5`, March 2022) is a stale mirror with known prototype-pollution/ReDoS advisories fixed only in the CDN builds; **never `npm i xlsx`**. Vendoring removes the need for CI to reach `cdn.sheetjs.com` and gives you a committed, lockfile-pinned artifact. The file is trusted and local, which is the correct threat model for SheetJS. | HIGH |

### CI / release infrastructure

| Technology | Version | Purpose | Notes | Confidence |
|------------|---------|---------|-------|------------|
| GitHub Actions | `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, `softprops/action-gh-release@v3` | CI, Pages deploy, release assets | Latest releases read from the GitHub API today. Add Dependabot for `github-actions` and `npm`. Consider pinning to commit SHAs for third-party actions (`softprops/*`). Alternative to softprops: `gh release create` / `gh release upload` from the runner, zero third-party actions. | HIGH |
| npm trusted publishing (OIDC) | npm CLI >= 11.5.1 (Node 22.14+) | `npm publish` of `@uio/engine` and `@uio/mcp-server` from `release.yml` | No long-lived `NPM_TOKEN` secret; provenance attestation is automatic for public repo + public package. Needs `permissions: id-token: write` on the publish job and a trusted-publisher entry configured on npmjs.com per package (**so the packages must exist or the org be set up first; ties to open flag #3**). Publish `--access public` for scoped packages. | MEDIUM (primary docs read via search; not exercised) |
| `allowScripts` in root `package.json` | npm 11.16 | Install-script allow-list | **Observed today:** npm 11.16 prints `allow-scripts: 1 package has install scripts not yet covered (esbuild@0.28.2 postinstall)`. The field is advisory now and the npm docs say **a future release will block unreviewed install scripts**. Run `npm approve-scripts esbuild` once and commit `"allowScripts": {"esbuild@0.28.2": true}` so CI does not break on a future npm. | HIGH (observed) |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not (or when the alternative wins) |
|----------|-------------|-------------|-----------------------------------------|
| YAML parser | `yaml` 2.9.1 | `js-yaml` 5.4.3 | Same coercion behaviour on `001469630` (verified), but no AST/line-column API (no source-mapped errors) and, as of v5, named exports only. `yaml`'s Document API is the deciding feature. |
| JSON-Schema | `ajv` 2020 | `@cfworker/json-schema`, `zod` for YAML | Ajv has the broadest keyword support and the schema stays language-neutral JSON usable by editors (`# yaml-language-server: $schema=...` gives contributors inline validation in VS Code for free). Zod would put the contract in code, which contradicts "contributors edit data, not TypeScript". |
| Turtle writer | `n3` Writer | `@rdfjs/serializer-turtle` 1.1.5, `rdf-ext` | Stream-based RDF/JS stack: more moving parts for a ~thousands-of-triples graph. `n3` already needed for parsing. |
| JSON-LD | `jsonld` 9.0.0 (`fromRDF` + `compact`) | Hand-written serializer; `jsonld-streaming-serializer` 4.0.0 | Hand-written is tempting (we control the shape) but then nothing proves JSON-LD and TTL say the same thing. Keep jsonld.js as the reference and add the **round-trip test** (JSON-LD to N-Quads equals the TTL quads). Mint statement nodes as **stable URIs** (e.g. `uio:statement/<scheme>/<hash>`), not blank nodes, so output is byte-deterministic and the equivalence test is a sorted-lines comparison. |
| SHACL | `rdf-validate-shacl` 0.6.5 | `shacl-engine` 1.1.2; `pySHACL` | `shacl-engine` is faster and supports SHACL-SPARQL, but pulls **484 transitive packages** (Comunica). `pySHACL` adds Python + pip to an otherwise Node-only CI and a second RDF stack. Choose `shacl-engine` only if a constraint truly needs SPARQL; try `sh:node`/`sh:qualifiedValueShape` first. Both validators produced the same finding on the spike graph, so switching later is cheap (shapes are plain Turtle). |
| MCP SDK | `@modelcontextprotocol/server` 2.3.1 | `@modelcontextprotocol/sdk` 1.32.1 | SPEC-literal, but maintenance-only. See flag #1. |
| Library build | plain `tsc` (engine, mcp) | `tsdown` 0.23.0, `tsup` 8.5.1 | Engine has no dependencies and needs no bundling; mcp can depend on the published engine. `tsup` has had no release since Nov 2025 and the ecosystem moved to `tsdown`, which is still 0.x. Add `tsdown` only if you later want a single-file `npx` artifact. |
| Lint | Biome 2.5.15 | ESLint 10.12.0 + typescript-eslint 8.71.1 | typescript-eslint's peer range excludes TS 7. Fine if you pin TS 6.0.3 instead. |
| UI | Preact 10 + hooks | Plain TS; Preact 11; React | See Preact row above. React is 10x the weight for no gain. Plain TS is viable but loses on a11y-state bookkeeping. |
| Excel | SheetJS 0.20.3 vendored | `exceljs` 4.4.0; `read-excel-file` 9.3.12 | `read-excel-file` drops hyperlinks (0/40); `exceljs` got 36/40 (misses links with `location` fragments), last release 2023, `npm audit` flags its `uuid` dependency (moderate). `read-excel-file` is excellent when you only need cell text, but its API also broke twice in 7.x to 9.x. |
| Monorepo orchestration | npm workspaces + ordered `npm run build --workspaces` | Turborepo 2.11.7, Nx | Seven or eight packages and a sequential build; caching tools are overhead. List workspaces in dependency order (engine, mcp, web, tools). |
| Test runner | Vitest 5 | Node's built-in `node:test` | `node:test` is viable and dependency-free, but Vitest's `test.for` tables, snapshot, coverage and one runner for node + web logic are worth it. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `npm i xlsx` (registry package) | 0.18.5 from 2022, stale mirror with known advisories; real releases are only on cdn.sheetjs.com | Vendored `xlsx-0.20.3.tgz` |
| `read-excel-file` for this import | Drops hyperlink targets; the sources live in hyperlinks | SheetJS 0.20.3 |
| `exceljs` | 4 of 40 hyperlinks missed, unmaintained since 2023, audit noise | SheetJS 0.20.3 |
| `@modelcontextprotocol/sdk` (v1) for new code | Maintenance line, no 2026-07-28 spec, heavy dependency tree (express, hono, jose...) | `@modelcontextprotocol/server` (pending owner OK) |
| Ajv (or any `new Function` code generator) in the web bundle or engine | Needs CSP `unsafe-eval`, bloats bundle, makes the "engine has no dynamic code" audit harder | Validate at build time only; ship pre-validated `model.json` |
| `jsonld` / `@digitalbazaar/http-client` outside build+test | It can fetch remote contexts by default | Throwing `documentLoader`, inline `@context`; keep it in `tools/` only |
| RDF-star / `rdf:reification` for statement metadata | SPEC §5.5 forbids RDF-star; reification is verbose | n-ary `uio:def#Statement` with minted URIs |
| Blank nodes for `Statement` nodes | Non-deterministic labels break byte-stable output and diffs | `uio:statement/<hash of scheme+predicate+object+condition>` |
| typescript-eslint with TypeScript 7 | Peer range `<6.1.0`, no JS API in TS 7; fails at runtime | Biome + `tsc --noEmit` (or pin TS 6.0.3) |
| `tsx` / `ts-node` / `ts-jest` | Node 24 strips types natively; Vitest uses its own transform | `node file.ts` |
| `lts/*` or `node-version: latest` in CI | Node 26 becomes LTS on 2026-10-28 and would silently change the toolchain | Pin `24` (matrix `22`, `24`, then `26`) |
| i18next, FormatJS, Lingui | Weight and pipeline for ~150 strings | Typed dictionaries + `Intl` |
| Google Fonts / any CDN font, analytics, Sentry, service-worker libs | Violates "no external requests, cookies, analytics" | System fonts or `@fontsource-*` bundled |
| localStorage/sessionStorage for the pasted values or language | Breaks the "values never stored" claim | In-memory state; `?lang=` for language |
| d3 / cytoscape / vis-network | Heavy, canvas/a11y problems for a 15-node graph | Hand-written SVG + text list |
| Docker, Turborepo, Nx, Lerna | No backend, small repo | npm workspaces |
| Playwright for the MCP smoke test | No browser involved | `@modelcontextprotocol/client` stdio client in Vitest |
| `console.log` anywhere in `packages/mcp` | Corrupts the stdio JSON-RPC stream | `console.error` |
| `preact@11` for v0.1 | 9 days old, adapters reporting breakage | `preact@^10.29.8`, upgrade after the first release |
| `n3@3.0.0-alpha` / `typescript@next` / Vite beta | Pre-release | Stable `latest` tags |

## Stack Patterns by Variant

- Use `@modelcontextprotocol/sdk@1.32.1` + `zod@^4.6`; same `McpServer.registerTool`/`registerResource`; stdio via `new StdioServerTransport()` + `await server.connect(transport)`.
- Expect a v2 migration within 6-12 months; isolate all SDK calls in `packages/mcp/src/server.ts`, keep tool definitions as plain data.
- Pin `typescript@~6.0.3` workspace-wide, add ESLint 10 + typescript-eslint 8.71 (peer `<6.1.0`), keep Biome for formatting only. Revisit TS 7.1+ when typescript-eslint publishes support.
- Swap `rdf-validate-shacl` for `shacl-engine@1.1.2` behind the same `validateShapes(shapesStore, dataStore)` wrapper in `tools/validate`.
- Add `tsdown` (0.23.0, Node `^22.18 || ^24.11 || >=26`, accepts TS 5/6/7) to `packages/mcp` and bundle `@uio/engine` + `model.json` in; mark nothing else external.
- Keep hash routing (works on Pages). Do not introduce `preact-iso`/`wouter` until there are more than about five routes.

## Stack-level pitfalls to bake into tooling (details belong in PITFALLS.md)

## Installation

# Root (devDependencies shared by all workspaces)

# tools/build + tools/validate (workspace "tools")

# tools/import (dev-time only; vendored tarball, do NOT use the registry package)

# tools/import/package.json -> "xlsx": "file:vendor/xlsx-0.20.3.tgz"

# packages/engine: no runtime dependencies (dependencies: {})

# packages/mcp

# packages/web

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| vitest@5.0.3 | vite@8.3.4, Node `^22.12 \|\| ^24 \|\| >=26`, `@types/node ^22 \|\| >=24` | Verified together on Node 24.18 with TS 7.0.2 |
| vite@8.3.4 | Node `^20.19 \|\| >=22.12`; esbuild `^0.27 \|\| ^0.28` (optional peer); `@preact/preset-vite@2.10.6` (peer `vite` up to 8.x) | Rolldown-based; the Vite config `esbuild` option is superseded by the built-in transformer, so do not carry over old Vite 5-era JSX config |
| typescript@7.0.2 | tsdown 0.23 (peer `^5 \|\| ^6 \|\| ^7`), Vite/Vitest (use their own transform), `tsc --noEmit` | **Not** typescript-eslint (`<6.1.0`), nor any tool importing the `typescript` JS API (ts-morph, typedoc, vite-plugin-dts: check before adding) |
| @modelcontextprotocol/server@2.3.1 | zod ^4.2 (own dependency), Node >=20, clients on protocol 2025-06-18 / 2025-11-25 / 2026-07-28 | Handshake negotiation verified in spike |
| @modelcontextprotocol/sdk@1.32.1 (fallback) | zod `^3.25 \|\| ^4`, Node >=18 | Spec up to 2025-11-25 only |
| preact@10.29.8 | `@preact/signals@2.11.3` (peer `>=10.25 \|\| >=11.0.0-0`), `@preact/preset-vite@2.10.6` | Preact 11 supports the same, upgrade later |
| rdf-validate-shacl@0.6.5 | n3@2.13.11 `Store` as DatasetCore | Spiked; no extra factory needed |
| jsonld@9.0.0 | Node >=18, `@digitalbazaar/http-client` (must be neutralised by custom documentLoader) | Build/test only |
| npm trusted publishing | npm >= 11.5.1, Node >= 22.14 | Node 24 satisfies |

## Open items for later phases

- **Peppol/ICD, checksums, EUID and OIN details** (SPEC Appendix B) are domain facts, not stack questions; out of scope here.
- **`@uio` scope** must be claimed (flag #3).
- **JSON-LD determinism**: snapshot-test `dist/uio.jsonld` early; if `jsonld.compact` ordering proves unstable between versions, sort keys in a post-processing step.
- **Vitest 5 / Preact 11 / TS 7** are all weeks old: re-check release notes at the start of each phase that touches them; fallbacks are named above.
- **BSN/real-looking test values**: tool-independent, covered in SPEC §10.

## Sources

- npm registry (`npm view`, dist-tags, peerDependencies, engines, publish times) for every package listed: yaml 2.9.1, ajv 8.20.0, ajv-formats 3.0.1, n3 2.13.11, jsonld 9.0.0, rdf-validate-shacl 0.6.5, shacl-engine 1.1.2, @modelcontextprotocol/server 2.3.1 and sdk 1.32.1, zod 4.6.5, vitest 5.0.3, vite 8.3.4, @playwright/test 1.64.0, typescript 7.0.2 (6.0.3 line), preact 10.29.8 / 11.0.1, @preact/preset-vite 2.10.6, @preact/signals 2.11.3, esbuild 0.28.2, @biomejs/biome 2.5.15, tsdown 0.23.0, tsup 8.5.1, exceljs 4.4.0, read-excel-file 9.3.12, xlsx 0.18.5 (registry).
- https://nodejs.org/dist/index.json and https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (Node 24 Krypton LTS, Node 26 LTS on 2026-10-28, Node 22 EOL 2027-04-30).
- https://github.com/modelcontextprotocol/typescript-sdk (main README: v2 stable, v1.x maintenance; `docs/get-started/first-server.md`, `docs/servers/resources.md`, `docs/testing.md`) plus an executed stdio spike with protocol negotiation.
- https://docs.sheetjs.com/docs/getting-started/installation/nodejs (0.20.3 install from CDN tarball; registry copy stale) plus an executed hyperlink extraction against `UID-table - v1.2.xlsx` (SheetJS 40/40, exceljs 36/40, read-excel-file 0/40).
- GitHub API releases for actions/checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1, softprops/action-gh-release v3.0.3.
- https://github.com/zazuko/rdf-validate-shacl (package README: Core only, no SHACL-SPARQL) and https://github.com/rdf-ext/shacl-engine (README: SPARQL-based constraints supported); transitive package counts measured with `npm i --package-lock-only` (34 vs 484).
- Local spikes (scratch project, Node 24.18.0, npm 11.16.0): TS 7 compile with nodenext/JSON import attributes/`erasableSyntaxOnly`; native `node file.ts`; Vitest 5 + esbuild bundle scan; Ajv 2020 ESM import; YAML coercion behaviour; npm `allowScripts` warning.
- typescript-eslint and TypeScript 7 status (no JS API in TS 7; peer `<6.1.0`): corroborated by the registry peer range and issue-tracker results. https://typescript-eslint.io (see issue #10940 on TS 7.1+ support, not retrieved directly)
- Preact 11 release and migration notes: https://preactjs.com/guide/v11/upgrade-guide/ and community reports of adapter breakage (registry confirms 11.0.0 published 2026-09-30).
- npm trusted publishing requirements (npm >= 11.5.1, `id-token: write`): https://docs.npmjs.com/trusted-publishers/ and https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/ (not exercised).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
