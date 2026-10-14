# UIO Knowledge Model — build specification

> Working English translation of `SPEC.nl.md` (v0.1, 9 October 2026). Precedence: `DECISIONS.md` > `SPEC.md` > `SPEC.nl.md`. Deviations are marked with "Amended by DECISIONS.md" notes; the translated text itself is unchanged.

> Build brief for Claude Code. Version 0.1, 9 October 2026.
> Authors: Leon Roseleur and Joost Wisselink (Davinci Conclusion), for CoE-DSC.
> Place this file in the root of the repository as `SPEC.md` and refer to it from `CLAUDE.md`.

> Amended by DECISIONS.md DEC-001: this English `SPEC.md` is the authoritative working document; `SPEC.nl.md` is the unchanged Dutch original.

> Amended by DECISIONS.md DEC-002: the instruction file is `.claude/CLAUDE.md`, not `CLAUDE.md` in the repository root.

## 0. How to use this document

> Amended by DECISIONS.md DEC-001: `DECISIONS.md` overrides this `SPEC.md`, which in turn overrides `SPEC.nl.md`.

> Amended by DECISIONS.md DEC-002: wherever this SPEC says `CLAUDE.md`, the file is `.claude/CLAUDE.md`.

> Amended by DECISIONS.md DEC-019: strict sourcing; unsourced or uncertain knowledge is left out and logged in `docs/gaps.md`, and no expert sources are invented.

- Build in the order of §13. Finish each step with green tests before you begin the next.
- For the choices in §12 the default applies. If you deviate from this specification, report it and ask first.
- Do not invent domain knowledge. Every statement in the model has a source (§5.4). If a source is missing, leave the fact out and record it in `docs/gaps.md`.
- Language in the repository: English (code, README, comments, identifiers). Labels in the model are bilingual (`en` required, `nl` where available).

---

## 1. Purpose and scope

The UIO Knowledge Model helps anyone who encounters one or more *Unique Identifiers of Organisations* (UIOs) to work out for themselves what they are and how they relate to each other. It is an open-source product in three layers: **knowledge model**, **engine** and **access layer**.

**In the model:**
- identifier schemes and their properties;
- the bodies that issue or register them (KvK, Customs, GLEIF, and so on);
- jurisdiction and applicability;
- relations and derivation rules;
- context (conditions), source and certainty.

**Not in the model:**
- the organisations that are identified. Entered values are processed only while a question is being answered and are **never** stored, logged or sent;
- a replacement for checks in the authoritative registers. The product points to them but does not query them;
- a language model as a source of knowledge.

**Principles:**
1. The knowledge lives in the model, not in the code. A new scheme, a new relation or a new rule requires no code change.
2. Every conclusion is traceable to rules, sources and conditions.
3. Uncertainty is not smoothed over but travels along in every answer.
4. AI may interpret questions and phrase answers, but adds no facts.
5. Nothing runs that has to be hosted: only static files and local processes.

## 2. Functional scope (version 0.1)

| Family | Question | Example | Engine function |
|---|---|---|---|
| A. Understand | Recognise | "What kind of number is `NL001469630B01`?" | `recognise` |
| A | Describe | "Who issues an EORI and where do I verify it?" | `describe` |
| A | Jurisdiction and applicability | "Which jurisdiction does a KvK number fall under, and is it applicable in Germany?" | `applicability` |
| A | Level or role | "Does a VAT number designate a legal person?" | `describe` |
| A | Lifecycle | "Does an LEI stay the same after a merger?" | `describe` |
| A | Assurance | "How strongly is a GLN assured?" | `describe` |
| B. Connect | Relation and chain | "How do RSIN and EORI relate to each other?" | `relate` |
| B | Derive | "Which VAT number belongs to this RSIN?" | `derive` |
| B | Consistency | "Do this KvK number and this EUID belong together?" | `check` |
| C. Advise | Choice and obligation | "Which identifier do I need for e-invoicing with Belgian parties?" | **Out of scope for 0.1.** The model must not block this later. |

## 3. Architecture

```
 Contributors (PR / issue)
          │
          ▼
 ┌─────────────────────┐     ┌──────────────────────────────┐
 │Layer 1: model/*.yaml│ ──▶ │ CI: validate · test · build   │
 └─────────────────────┘     │  → dist/ (TTL, JSON-LD, JSON, │
                             │    landscape table)           │
                             └──────────────┬───────────────┘
                                            ▼
                 ┌──────────────────────────────────────────┐
                 │ Layer 2: engine (TypeScript, in-memory)   │
                 │ recognise · describe · applicability ·    │
                 │ relate · derive · check                   │
                 └───────┬──────────────┬───────────────────┘
                         ▼              ▼
              Layer 3: web (static)  MCP server (stdio)    + download of dist/
```

The engine reads **only** the generated `dist/model.json`, a compact, normalised form of the model, not the YAML. This way RDF consumers and the engine have exactly the same source.

## 4. Repository structure

> Amended by DECISIONS.md DEC-008: develop on Node 24, CI matrix Node 22 and 24 with pinned majors; `engines.node` is `>=22.18` for the root and `tools/*`, `>=22.12` for `packages/engine` and `packages/mcp`.

> Amended by DECISIONS.md DEC-010: the npm scope is set once in `config.yaml` (`npm_scope`) and package names derive from it; `@uio` is tried first, with `@mouifo` as fallback.

> Amended by DECISIONS.md DEC-013: `LICENSE-model` (CC-BY-4.0) also covers `sources/` and `docs/`; code, configuration and tooling stay under EUPL-1.2.

> Amended by DECISIONS.md DEC-014: the landscape workbook is committed as CSV files plus a SHA-256 manifest in `sources/`; the original xlsx stays local and gitignored.

> Amended by DECISIONS.md DEC-018: the v0.9 ontology is tracked as `sources/uio-ontology-v0.9.ttl`, moved from the repository root.

> Amended by DECISIONS.md DEC-031: `model/authorities/` holds authority classes and per-country instances (`instance_of`, `jurisdiction`, own source); a scheme's `issuer` names a class, or an instance for a national-only scheme.

> Amended by DECISIONS.md DEC-032: jurisdictions declare `part_of` with a source and the validator rejects a cycle; the seeded set is minimal (EU, NL, BE, GB and XI), and EL is a prefix alias of GR, not a jurisdiction.

> Amended by DECISIONS.md DEC-040: supersedes DEC-032 in part; GR (Greece, `part_of` EU) is seeded now as a sixth jurisdiction so that the prefix entry EL to GR resolves.

> Amended by DECISIONS.md DEC-045: an authority file exists only for an issuer that a scheme names; a single-organisation issuer is an authority class only, and class plus per-country instance is used only where one authority per country exists.

```
/
├─ SPEC.md                      # this document
├─ README.md                    # what, why, example questions, EORI case, glossary
├─ CONTRIBUTING.md              # one page: adding a scheme/relation/rule, source mandatory
├─ LICENSE                      # EUPL-1.2 (code)
├─ LICENSE-model                # CC-BY-4.0 (everything under model/ and dist/)
├─ config.yaml                  # base namespace etc. (single place)
├─ sources/                     # source material (Excel landscape table, reference to the PBLQ report)
├─ model/
│  ├─ vocab/                    # closed lists: levels, roles, statuses, certainty, relation-kinds
│  ├─ authorities/*.yaml        # KvK, Belastingdienst, Douane, Logius, GLEIF, GS1, D&B, ...
│  ├─ jurisdictions/*.yaml      # NL, BE, DE, FR, LU, GB, CH, AT, EU, GLOBAL
│  ├─ sources/*.yaml            # sources that statements refer to (id, title, url, date)
│  └─ schemes/*.yaml            # one file per identifier scheme (incl. relations and rules)
├─ shapes/                      # SHACL shapes
├─ tools/
│  ├─ build/                    # YAML → model.json, TTL, JSON-LD, landscape table
│  └─ validate/                 # JSON Schema on YAML + SHACL on TTL + referential checks
├─ packages/
│  ├─ engine/                   # @uio/engine (npm), no runtime dependencies on the network
│  ├─ mcp/                      # @uio/mcp-server (npm, runnable with npx)
│  └─ web/                      # static site (Vite), deploy to GitHub Pages
├─ dist/                        # generated, do not edit by hand (in .gitignore; release asset)
├─ docs/
│  ├─ gaps.md                   # missing or uncertain knowledge, with open questions
│  └─ model.md                  # generated model documentation
└─ .github/
   ├─ workflows/ci.yml          # PR: validate, test, build
   ├─ workflows/release.yml     # tag: Pages, npm, dist as release asset
   └─ ISSUE_TEMPLATE/           # new-scheme.yml, correction.yml
```

Monorepo with npm workspaces. Node LTS. No backend, database or telemetry.

## 5. Layer 1 — Knowledge model

### 5.1 Closed lists (`model/vocab/`)

> Amended by DECISIONS.md DEC-032: each applicability status gets an `inherits_down` flag, and results will be classed stated, inherited (from X) or no-data; the engine logic follows in Phase 5.

> Amended by DECISIONS.md DEC-034: the `relation-kind` list gains `specializes`, first used for `vat-nl specializes vat`.

> Amended by DECISIONS.md DEC-041: `inherits_down` is false for `issued`, true for `recognised`, true for `verifiable` and false for `not-applicable`, a modelling decision without an external source; a stated applicability beats an inherited one and an inherited result stays below `certain`.

| List | Values (starter set) |
|---|---|
| `certainty` | `certain`, `likely`, `possible` (ranking: certain > likely > possible) |
| `level` | `legal-entity`, `legal-entity-top-level`, `enterprise`, `establishment`, `natural-person`, `government-organisation`, `location`, `declaring-entity` |
| `role` | `taxpayer`, `economic-operator`, `e-invoicing-participant`, `financial-counterparty` |
| `applicability-status` | `issued` (issued in this jurisdiction), `recognised` (legally/formally recognised), `verifiable` (verifiable from this jurisdiction), `not-applicable` |
| `relation-kind` | `derived-from`, `contains`, `prerequisite`, `same-level`, `different-level`, `equivalent-in` (other country, same function), `may-identify-same-party`, `references` |
| `persistence-event` | `merger`, `acquisition-without-merger`, `split`, `dissolution`, `move-within-country`, `move-to-other-country` |

### 5.2 Scheme file (`model/schemes/<id>.yaml`)

> Amended by DECISIONS.md DEC-003: the Dutch EORI is derived from the RSIN, and VAT to EORI is a two-step chain via the RSIN, so the strip-suffix rule shown below is not the primary derivation.

> Amended by DECISIONS.md DEC-004: `checksum` is an any-of list, each entry with its own source and certainty, instead of a single algorithm name.

> Amended by DECISIONS.md DEC-028: the JSON Schema is hand-written (draft 2020-12, closed, checked by Ajv at build time only), every model file names it in a `# yaml-language-server` header, and identifier values are always quoted strings.

> Amended by DECISIONS.md DEC-029: each scheme declares a default source that covers its bare header fields (`issuer`, `jurisdiction`, `kind`, `abbreviation`, `availability`, `iso6523_icd`, `peppol_eas`), which may use the long form `{ value, source, certainty }`; every statement carries its own `source` and explicit `certainty`.

> Amended by DECISIONS.md DEC-031: `issuer` names an authority class, or an instance for a national-only scheme; instances and classes live in `model/authorities/`.

> Amended by DECISIONS.md DEC-035: a scheme may declare `context_from.issuing_country` with a `capture` (regex and group) and the `country-prefix` map, each with its own source and certainty, to read the issuing country from the value.

> Amended by DECISIONS.md DEC-036: `iso6523_icd` and `peppol_eas` are separate nullable 4-digit string fields, and a composite scheme names its delegates with explicit `components` and a relation.

> Amended by DECISIONS.md DEC-038: a checksum entry is `{ algorithm, over?, source, certainty }`, where `over` is an optional list of SPEC §5.3 transforms applied before the algorithm.

> Amended by DECISIONS.md DEC-045: an authority counts as referenced when a scheme names it as issuer, when it is the class of such an issuer, or when it is a country instance that the scheme's issuing-country context reaches; no unreferenced authority file is written.

> Amended by DECISIONS.md DEC-046: the workbook is the analysis source `landscape-v1-2` (not `landscape-v1.2`), and its claims have certainty `likely` unless a later row sets a lower one.

> Amended by DECISIONS.md DEC-050: the EORI levels and the associated VAT number of a Dutch EORI or RSIN are not modelled or asserted, because no source states them, and are logged in `docs/gaps.md`.

Validate with a JSON Schema in `tools/validate`. Fields:

```yaml
id: eori                               # kebab-case, unique, becomes the URI suffix
label: { en: Economic Operators Registration and Identification, nl: EORI-nummer }
abbreviation: EORI
iso6523_icd: null                      # ICD code if known
kind: identifier                       # identifier | register | composite (see §9)
issuer: national-customs-authority     # → model/authorities
jurisdiction: EU                       # jurisdiction of issue → model/jurisdictions
legal_basis:
  - { title: "Union Customs Code, Regulation (EU) No 952/2013", eli: "http://data.europa.eu/eli/reg/2013/952/oj", source: landscape-v1.2 }
validation_source: { label: EU EORI validation, url: "https://ec.europa.eu/taxation_customs/dds2/eos/eori_validation.jsp", source: landscape-v1.2 }
mandatory: { text: "Required for cross-border trade involving EU customs", source: landscape-v1.2 }
availability: public-restricted-details
scope: { en: "International trade with EU and UK involving customs; legal persons and sole proprietorships" }
format:
  patterns:
    - { regex: "^NL[0-9]{9}$", condition: { issuing_country: NL }, certainty: likely, source: landscape-v1.2 }
    - { regex: "^[A-Z]{2}[A-Z0-9]{1,15}$", certainty: certain, source: eu-eori-guidance }
  checksum: null                       # name of a checksum algorithm from §6.4, or null
  examples_valid: [NL001469630]
  examples_invalid: [NL00146963, 001469630]
level:
  - { value: legal-entity-top-level, condition: { issuing_country: NL }, certainty: likely, source: expert-customs-2026 }
  - { value: declaring-entity, condition: { issuing_country: "!NL" }, certainty: likely, source: expert-customs-2026 }
roles:
  - { value: economic-operator, certainty: certain, source: landscape-v1.2 }
applicability:
  - { jurisdiction: EU, status: [issued, recognised, verifiable], source: landscape-v1.2 }
  - { jurisdiction: GB, status: [recognised], certainty: possible, source: landscape-v1.2, note: "UK requires a GB EORI after Brexit" }
persistence:
  - { event: merger, behaviour: "Unchanged if entity persists", source: landscape-v1.2 }
trust:
  legal_basis: 1
  registration_quality: 1
  verifiability: 0
  crosswalks: 1
  lifecycle: 1
  source: landscape-v1.2
relations:
  - { kind: derived-from, target: vat-nl, condition: { issuing_country: NL }, certainty: certain, source: landscape-v1.2 }
rules:
  - id: eori-nl-from-vat-nl
    input: vat-nl
    output: eori
    transform: [ { strip_suffix: 3 } ]
    condition: { issuing_country: NL }
    certainty: certain
    source: landscape-v1.2
    examples: [ { in: NL001469630B01, out: NL001469630 } ]
  - id: vat-nl-from-eori-nl
    input: eori
    output: vat-nl
    transform: [ { add_suffix: "B01" } ]
    condition: { issuing_country: NL }
    certainty: likely                  # B01 is assumed; fiscal units can have B02..
    source: landscape-v1.2
    examples: [ { in: NL001469630, out: NL001469630B01 } ]
notes: { en: "Not a general business identifier; often derived from one." }
```

The values above are illustrative. Take the real values from `sources/` (§9). The EU pattern rule and `expert-customs-2026` are **examples of source references**: create them only if that source exists in `model/sources/`. Otherwise the item goes to `docs/gaps.md`.

### 5.3 Rules as data

> Amended by DECISIONS.md DEC-035: the `capture` operation is also used by `context_from` to read the issuing country from a value, and a prefix that the `country-prefix` map does not know gives no context, not an error.

A rule is either a **transformation** of a value, or an **if-then rule** over properties.

**Transformations** are a list of steps from a fixed, small set of operations. Do not add free code or expressions.
- `strip_prefix: n`, `strip_suffix: n`, `add_prefix: "…"`, `add_suffix: "…"`
- `pad_left: { length: n, char: "0" }`, `uppercase`, `remove: " .-"`
- `capture: { regex: "…", group: n }` (extract a part of a value)
- `template: "NL{value}B01"` (with `{value}` and optionally `{capture:n}`)
- After the transformation the engine validates the output against the format of the target scheme. If that fails, there is no conclusion.

**If-then rules** (`kind: inference`) derive a property from a combination of data. Example: if the scheme is `eori` and the country of issue is NL, then the level is `legal-entity-top-level` (`likely`). In 0.1 these rules are expressed through `condition` on `level`, `roles` and `applicability`. A generic rule form (SHACL-AF or SPARQL CONSTRUCT) is allowed later; lay out the data structure so that this is possible.

**Conditions** are closed keys: `issuing_country` (ISO 3166-1 alpha-2, `!` for negation), `entity_form` (for example `sole-proprietorship`, `legal-person`), `context` (free tag, documented in `vocab`). If the engine cannot establish a condition, it records it as an **assumption** in the explanation, and the certainty drops to `likely` at most.

### 5.4 Source and certainty (mandatory)

> Amended by DECISIONS.md DEC-019: strict sourcing; a statement without a source and a certainty is left out of the model and logged in `docs/gaps.md`, and no expert sources are invented.

> Amended by DECISIONS.md DEC-029: a scheme's default source covers its bare header fields and every statement keeps its own `source` and explicit `certainty`; `label`, `notes` and `scope` need no source.

> Amended by DECISIONS.md DEC-030: every source needs `id`, `title`, `date` and `type`, plus the fields of its type (`eli` or `url` for law, `publisher` and `reference` for a standard, `url` for a register document, `method` for an analysis, `role` and `organisation` for an expert).

> Amended by DECISIONS.md DEC-042: a source whose page states no date takes the page's machine-readable modification date, or else the date it was read, and is listed in `docs/gaps.md`.

> Amended by DECISIONS.md DEC-046: the workbook is an `analysis` source whose `method` states that its values are the authors' expert analysis, and its statements have certainty `likely` unless a later row sets a lower one.

- Every statement (level, role, applicability, relation, rule, pattern, trust, persistence) has `source` (id in `model/sources/`) and `certainty` (default `certain` if it follows from law or a standard; otherwise fill in explicitly).
- `model/sources/<id>.yaml`: `id`, `title`, `url?`, `publisher?`, `date`, `type` (`law` | `standard` | `register-doc` | `expert` | `analysis`). For an expert: role and organisation, never a personal name without consent.

### 5.5 RDF mapping

> Amended by DECISIONS.md DEC-011: the base namespace `https://w3id.org/uio/` stays configurable in `config.yaml`; the w3id registration is deferred to Phase 8.

> Amended by DECISIONS.md DEC-017: `UIO ontology v0.9.ttl` is input for the `uio:def#` ontology, not a compatibility target.

- Base namespace from `config.yaml`: default `https://w3id.org/uio/`. Schemes: `uio:scheme/<id>`; authorities: `uio:authority/<id>`; rules: `uio:rule/<id>`; ontology: `uio:def#`.
- Reuse: SKOS (`skos:ConceptScheme`, `skos:prefLabel`, `skos:notation`), ADMS (`adms:Identifier`, `adms:schemaAgency`), W3C ORG (`org:Organization` for authorities), DCTERMS (`dct:source`, `dct:spatial` for jurisdiction), PROV-O (`prov:wasDerivedFrom` to the source), ELI URIs for legislation, EU Authority Tables for countries.
- Statements with condition, certainty and source are modelled **n-ary**: a node `uio:def#Statement` with `uio:def#subject`, `uio:def#predicate`, `uio:def#object`, `uio:def#condition`, `uio:def#certainty`, `dct:source`. No RDF-star, for maximum compatibility.
- Output: `dist/uio.ttl`, `dist/uio.jsonld`, `dist/model.json` (for the engine), `dist/landscape-table.md` and `.csv`, `docs/model.md`.

### 5.6 Validation (CI fails on each of these)

> Amended by DECISIONS.md DEC-028: the validator reports every error of every model file with file, line and column, rejects unquoted numbers with a leading zero or more than 15 digits and duplicate keys, and treats an uncited source as a warning.

> Amended by DECISIONS.md DEC-039: an `examples_valid` value must be accepted by the scheme, and an `examples_invalid` value is valid when the scheme does not accept it, so a pattern match with every checksum entry failing is a valid invalid example.

1. YAML conforms to the JSON Schema.
2. Every reference (issuer, jurisdiction, source, target, input/output of rules) exists.
3. Every statement has a source and a valid certainty.
4. Every `examples_valid` matches at least one pattern and the checksum; every `examples_invalid` does not.
5. Every rule with `examples` gives exactly the expected output.
6. The generated TTL conforms to the SHACL shapes in `shapes/`.

## 6. Layer 2 — Engine (`packages/engine`)

TypeScript, ESM, no network access, no dependencies that do I/O. Loads `model.json` (bundled, or supplied via `createEngine(model)`).

### 6.1 API

```ts
createEngine(model: Model): Engine

interface Engine {
  recognise(value: string, hint?: { country?: string }): Result<Candidate[]>
  describe(schemeId: string): Result<SchemeDescription>
  applicability(schemeId: string, jurisdiction: string): Result<Applicability>
  relate(a: string, b: string): Result<RelationPath[]>      // a/b = scheme ids
  derive(value: string, schemeId?: string, ctx?: Context): Result<Derivation[]>
  check(values: string[], ctx?: Context): Result<ConsistencyFinding[]>
}

interface Result<T> {
  data: T
  conclusions: Conclusion[]     // human-readable summary of what the engine concludes
  warnings: Warning[]           // e.g. possible BSN, unknown condition, no source
}

interface Conclusion {
  statement: string             // English sentence, i18n key alongside
  certainty: 'certain' | 'likely' | 'possible'
  explanation: Step[]           // full chain
}

interface Step {
  kind: 'fact' | 'rule' | 'pattern' | 'checksum' | 'assumption'
  ref: string                   // id of scheme/rule/statement
  certainty: Certainty
  condition?: Condition
  source: SourceRef
}
```

### 6.2 Behaviour

> Amended by DECISIONS.md DEC-041: when applicability is resolved through `part_of`, a stated applicability beats an inherited one and an inherited result is capped below `certain`.

- **Weakest link:** the certainty of a conclusion is the minimum over all steps in `explanation`. A condition that is not established counts as an `assumption` step with certainty `likely`.
- **`recognise`:** try all patterns of all schemes and check the checksum. Return all candidates, sorted by certainty and then by specificity (length of the regex match without wildcards). Multiple candidates are normal; 9 digits can be RSIN, BSN or DUNS.
- **`relate`:** a direct relation, otherwise the shortest chain (BFS) over `relations` and `rules`, with at most 4 steps. All chains of equal length are returned.
- **`derive`:** apply all rules whose `input` matches, also repeatedly (at most 4 steps, no cycles). Validate every output against the target format.
- **`check`:** recognise each value, and for each pair look for a rule that converts one into the other. Outcome per pair: `consistent` / `inconsistent` / `no-rule`, with the rule and the certainty.
- **Determinism:** the same input and the same model always give the same output, with stable sorting.

### 6.3 Privacy

> Amended by DECISIONS.md DEC-005: a bare 9-digit value (possibly a BSN) joins `check` only when another supplied value derives it; otherwise it only gets the `possible-personal-identifier` warning.

> Amended by DECISIONS.md DEC-022: a personal-number guard in `tools/guards` scans tracked files and the added lines of every pull-request commit; output masks the value, and a value-level allow-list holds public or synthetic values only.

- No storage, logging, telemetry or network traffic with values. A unit test checks that the engine bundle contains no `fetch`, `XMLHttpRequest` or `WebSocket`.
- **BSN:** if a bare 9-digit value passes the elfproef, it can be a BSN or an RSIN. The result then gets a warning `possible-personal-identifier`. The value is only used further in `derive` and `check` if the user or the context indicates that it is an RSIN (for example `derive(value, "rsin")`, or derived from a VAT number).

### 6.4 Checksum algorithms (fixed set, called by name from the model)

> Amended by DECISIONS.md DEC-004: a scheme's checksum is an any-of list with a source and certainty per entry; for `vat-nl` it is elfproef or ISO 7064 mod 97-10, with the mod 97 entry marked `likely`.

> Amended by DECISIONS.md DEC-037: the checksum kernel and the SPEC §5.3 transform set are built in Phase 2 in `packages/engine` with zero dependencies, and mod 97-10 uses per-character remainders, never floating point.

> Amended by DECISIONS.md DEC-038: a checksum entry may carry an `over` list of transforms applied before the algorithm, so `vat-nl` runs elfproef on the 9-digit core and mod 97-10 on the whole value.

`elfproef` (11-proof; weights 9…2 and −1 for the last digit; applies to BSN and RSIN, which therefore cannot be told apart by checksum), `iso7064-mod97-10` (LEI, also the VAT id of sole proprietorships), `gs1-mod10` (GLN), `none`. Each algorithm has its own unit tests with known valid and invalid values. Before use, record which schemes have which algorithm, with a source; see Appendix B.

## 7. Layer 3 — Access

### 7.1 Website (`packages/web`)

- Static (Vite, no framework requirement; preference: plain TS or Preact). Hosted on GitHub Pages.
- Three views:
  1. **"Paste your identifiers"**: one text box, one value per line. Shows recognition, derivations and consistency, each conclusion with an expandable explanation (steps, source, condition, certainty).
  2. **Schemes**: list and detail page per scheme (`describe`) with applicability per jurisdiction and the relations as a small graph.
  3. **Relation**: pick two schemes and see the chain (`relate`).
- Certainty visible with text and colour, not colour alone. Accessible (WCAG 2.1 AA), works on mobile.
- No cookies, no analytics and no external requests. Fonts and assets are in the bundle.
- Text under the input field: "Values are processed in your browser only and never stored or sent."
- UI language: English, with Dutch as second language (simple i18n).

### 7.2 MCP server (`packages/mcp`)

> Amended by DECISIONS.md DEC-006: the MCP server uses `@modelcontextprotocol/server` (MCP TypeScript SDK major version 2) instead of `@modelcontextprotocol/sdk`.

> Amended by DECISIONS.md DEC-010: the package name derives from the npm scope set once in `config.yaml` (`npm_scope`), so `npx @uio/mcp-server` holds only while the scope is `@uio`.

- `@modelcontextprotocol/sdk`, stdio transport, startable with `npx @uio/mcp-server`.
- Six tools, one per engine function, with the same names and a JSON schema for the input. The output is the full `Result`, including `explanation`.
- Every tool description ends with: *"Report conclusions with their certainty and source exactly as returned. Do not add facts about identifiers that are not in the result."*
- One resource `uio://model/summary` with the list of schemes, and a short description per scheme.
- README section with configuration examples for Claude Desktop and VS Code.

### 7.3 Download

Every release adds `dist/*` as a release asset. The website links to the latest release.

### 7.4 Later, do not build in 0.1

REST API, a dedicated chat with a language model (for example Jev by TypeSafe AI) and a SPARQL endpoint. Keep the engine API such that these can become thin layers.

## 8. Tests and CI

> Amended by DECISIONS.md DEC-009: `npm run check` is the single local entry (Biome lint, format check and `tsc`), and Biome runs with `--error-on-warnings` so CI fails on any lint or format issue.

> Amended by DECISIONS.md DEC-022: a personal-number guard (`tools/guards`) also runs in CI over the tree and over every commit of a pull request.

- **Unit:** checksums, transformations, certainty combination, the five behaviour rules of §6.2.
- **Model-driven:** generate the tests from all `examples_valid`, `examples_invalid` and rule `examples`.
- **Acceptance:** the EORI case (§10) as an end-to-end test at engine level, and as a smoke test on MCP and web (Playwright, headless).
- **`ci.yml` (on a pull request):** install → validate model → build dist → test → build web and mcp.
- **`release.yml` (on a tag `v*`):** the same, plus deploy to Pages, `npm publish` of engine and mcp, and dist as release asset.
- Semver for the model: a new scheme or a new rule is minor; a changed meaning or a removal is major. Maintain `CHANGELOG.md`.

## 9. Starter data

> Amended by DECISIONS.md DEC-014: the importer reads the committed CSV exports in `sources/` (with a SHA-256 manifest), never the xlsx.

> Amended by DECISIONS.md DEC-015: `sources/landscape-v1.2*` is committed only after written confirmation from Davinci Conclusion that the UID table content may be published under CC-BY-4.0.

> Amended by DECISIONS.md DEC-016: the confirmation of Davinci Conclusion alone suffices, and the attribution cells of the Overview tab stay in the export as the credit line ("Davinci Conclusion, as produced for the CoE-DSC").

> Amended by DECISIONS.md DEC-020: KBO (Belgium) is the only foreign equivalent in v0.1, as a light scheme with an `equivalent-in` relation to `kvk-number`.

> Amended by DECISIONS.md DEC-023: the workbook is `UID-table - v1.2.xlsx` with tabs `Overview UIDs` and `Persistence`; it has one LEI column, BSN and fi-number columns are present (sparse), and it has 14 scheme columns where this section lists 15 ids.

> Amended by DECISIONS.md DEC-033: v0.1 has 16 schemes (the 15 ids plus KBO); `vat` is the generic EU VAT identifier and `vat-nl` the Dutch form, and both cite the workbook column `VAT-nr`.

> Amended by DECISIONS.md DEC-043: each distinct cleaned URL among the 40 workbook hyperlinks becomes at most one source file, and each primary hyperlink is registered unless it cannot back a claim.

> Amended by DECISIONS.md DEC-044: `npm run import:snapshot` writes the committed, byte-stable JSON snapshot `sources/landscape-snapshot-v1.2.json` from the committed CSVs, and the importer writes no draft YAML.

> Amended by DECISIONS.md DEC-046: the workbook source id is `landscape-v1-2`, replacing `landscape-v1.2`, because a source id must be kebab-case.

> Amended by DECISIONS.md DEC-048: `kbo` is a light scheme without the `equivalent-in` relation to `kvk-number` and without a checksum entry, because no readable official Belgian source supports either; both gaps are logged.

> Amended by DECISIONS.md DEC-051: for now, DEC-043 with its two primary-row exceptions (the Digital Single Market communication PDF of cell O13 and the Logius landing page of cell H15) is accepted as registering every primary hyperlink URL, and registering or replacing both is deferred and logged in `docs/gaps.md`.

**Source:** `sources/Analysis of Unique IDs for companies.xlsx` (tab *Overzicht UID* = landscape table, *Persistence*, *KvK in NL en buitenland*). Also deliver a conversion script `tools/import/excel.ts`, or transfer the values by hand. In both cases record `source: landscape-v1.2` per field.

**Starter set of 14 schemes:** `kvk-number`, `kvk-establishment-number` (establishment number), `oin`, `rsin`, `vat` (generic) plus `vat-nl`, `roo`, `peppol-id`, `lei`, `gln`, `euid`, `eori`, `duns`, `bsn`, `fi-number`.

**Known points of attention:**
- The Excel has **two LEI columns** (partly Dutch). Merge them; put contradictory values (persistence: medium versus low) in `docs/gaps.md`.
- **ROO** is a register, not an identifier. Use `kind: register`, with a URL as identification.
- **Peppol-ID** is composite (`<ICD>:<value>`). Use `kind: composite`. The engine recognises the prefix and delegates the value to the underlying scheme.
- **BSN** and **fi-number** are not in the Excel. Model them minimally (issuer, jurisdiction, format, relation fi-number → RSIN) with a source, or put them in `docs/gaps.md`.
- **Foreign equivalents** (KBO, Handelsregister HRB/HRA, SIREN/SIRET, RCSL, Companies House, UID-CH, Firmenbuch) come from the tab *KvK in NL en buitenland*. Model them as light schemes with `equivalent-in` to `kvk-number`.
- The **trust score** (five sub-scores) and **persistence** (six events) come directly from the Excel.

## 10. Acceptance case: EORI

> Amended by DECISIONS.md DEC-003: the Dutch EORI is derived from the RSIN, and VAT to EORI is a two-step chain (VAT number to RSIN, then RSIN to EORI).

> Amended by DECISIONS.md DEC-005: a bare 9-digit value (possibly a BSN) joins `check` only when another supplied value derives it.

> Amended by DECISIONS.md DEC-050: the EORI levels and the associated VAT number of a Dutch EORI are not asserted by the acceptance test, because no source supports them, and are logged in `docs/gaps.md`.

**Input:** `derive("NL001469630", "eori")` and `check(["NL001469630", "NL001469630B01", "001469630"])`.

**Expected** (certainty in brackets; the sources follow from the model):

| Conclusion | Certainty |
|---|---|
| Issued by Dutch Customs; to be verified via the EU validation of EORI | certain |
| Associated VAT number `NL001469630B01` (rule `vat-nl-from-eori-nl`) | likely |
| Associated RSIN `001469630` (via the VAT number; does not apply to sole proprietorships: assumption `entity_form = legal-person`) | likely (weakest link) |
| Probably designates the top-level legal person (condition: NL) | likely |
| Can be looked up via the RSIN in the Handelsregister (reference, not a lookup) | certain |
| `check`: all three pairs `consistent`, with rule and certainty | — |

**Contrast:** `derive("DE123456789012345", "eori")` gives no Dutch VAT number, and as level `declaring-entity` (likely).

`RSIN 001469630` passes the elfproef. Check this in the test; the value comes from the Excel (ABN AMRO Schadeverzekering N.V., public data). In the tests, otherwise use only values from public examples in `sources/`, or synthetic values that pass the checksum.

## 11. Definition of done (v0.1)

> Amended by DECISIONS.md DEC-023: the scheme count is reconciled in Phase 2, because `vat` and `vat-nl` share one workbook column (14 columns against 15 ids).

> Amended by DECISIONS.md DEC-033: the scheme count for v0.1 is 16 (the 15 ids plus KBO), with `vat` as the generic EU VAT identifier and `vat-nl` as the Dutch form.

- [ ] All 14 schemes are in `model/schemes/`, with a source for every statement; gaps are in `docs/gaps.md`.
- [ ] CI is green: validation, SHACL, model-driven tests, unit and acceptance tests.
- [ ] The six engine functions work for all schemes, and every conclusion has an explanation.
- [ ] The website is on GitHub Pages and the EORI case works there.
- [ ] The MCP server can be started via `npx` and answers the example questions from §2 in Claude Desktop.
- [ ] `dist/` (TTL, JSON-LD, landscape table) can be downloaded at release `v0.1.0`.
- [ ] README (including glossary and EORI case), CONTRIBUTING (one page) and both LICENSE files are present.

## 12. Open choices and defaults

> Amended by DECISIONS.md DEC-007: TypeScript 7 (7.0.2) with Biome 2.5 for lint and format, plus `tsc --noEmit`; no ESLint or Prettier.

> Amended by DECISIONS.md DEC-011: the base namespace `https://w3id.org/uio/` is configurable in `config.yaml`; the w3id registration is deferred to Phase 8, with namespace maintainers Leon Roseleur and Joost Wisselink.

> Amended by DECISIONS.md DEC-012: the repository stays `DavinciLeon123/MoUIfO` for v0.1, and the GitHub Pages base path is configurable as `pages_base_path` in `config.yaml`.

> Amended by DECISIONS.md DEC-013: `LICENSE-model` (CC-BY-4.0) also covers `sources/` and `docs/`.

| Choice | Default until decided |
|---|---|
| Owner of the repository and the namespace | Namespace `https://w3id.org/uio/`, configurable in one place in `config.yaml`. Repo owner to follow. |
| Language of the engine | TypeScript |
| Licences | Code under EUPL-1.2; model and dist under CC-BY-4.0 |
| BSN | Recognise and warn, do not process further (§6.3) |
| Definition of "applicable" | Four statuses (§5.1); per jurisdiction several are possible at the same time |

## 13. Build order

> Amended by DECISIONS.md DEC-037: the checksum kernel and the transform set of step 5 are built in Phase 2, ahead of step 5, because the validator of step 2 runs them.

1. Monorepo setup, licences, `config.yaml`, CI skeleton.
2. Closed lists, JSON Schema for the YAML, validation tool.
3. Starter data: `eori`, `vat-nl`, `rsin`, `kvk-number`, `euid` in full (this covers the EORI case); then the other schemes.
4. Build: YAML → `model.json`, TTL, JSON-LD, landscape table; SHACL shapes.
5. Engine: checksums and transformations → `recognise`, `describe`, `applicability` → `relate`, `derive`, `check` → EORI acceptance test.
6. MCP server.
7. Website.
8. README, CONTRIBUTING, issue templates, release `v0.1.0`.

---

## Appendix A — Start data in brief (from the landscape table)

> Amended by DECISIONS.md DEC-003: for the Dutch EORI the primary derivation is from the RSIN (NL + RSIN for legal persons), not from the VAT number.

| Scheme | Issuer | Jurisdiction | Format (according to source) | Related to |
|---|---|---|---|---|
| KvK number | Kamer van Koophandel | NL | 8 digits | Origin of many other IDs |
| Establishment number | Kamer van Koophandel | NL | 12 digits | KvK number |
| OIN | Logius | NL | 20 digits: prefix(8) + KvK number or RSIN + suffix | KvK number or RSIN |
| RSIN | Kamer van Koophandel | NL | 9 digits | VAT number; based on fi-number |
| VAT number (NL) | Belastingdienst | NL (VAT ids worldwide) | NL + 9 digits + B + 2 digits | RSIN (not for sole proprietorships) |
| ROO | Logius / KOOP | NL | n/a (register, URL) | KvK number, OIN |
| Peppol-ID | OpenPeppol | NL / international | One of: KvK number, OIN, VAT number, IBAN, GLN, with ICD prefix | RSIN, OIN, VAT number |
| LEI | LOUs under GLEIF | worldwide | 20 characters: LOU(4) + ID(14) + check digits(2), ISO 17442 | KvK number via RA codes |
| GLN | GS1 | worldwide | 13 digits (GS1) | none |
| EUID | national register, via BRIS | EU | country code + register code + national number (+ check digit) | KvK number |
| EORI | national customs | EU | NL: VAT number without the last 3 characters | VAT number, KvK number |
| DUNS | Dun & Bradstreet | worldwide | 9 digits | KvK number, LEI, VAT number |
| BSN | Rijksoverheid (BRP) | NL | 9 digits, elfproef variant | (person-related) |
| fi-number | Belastingdienst | NL | 9 digits | RSIN |

## Appendix B — Details to verify (do not adopt without a source)

> Amended by DECISIONS.md DEC-004: the checksum of a scheme is an any-of list with its own source and certainty per entry; for `vat-nl` the mod 97 entry is marked `likely`.

> Amended by DECISIONS.md DEC-036: ICD codes and Peppol EAS codes are separate header fields `iso6523_icd` and `peppol_eas`; 9944 is a Peppol EAS value, not an ISO 6523 ICD.

> Amended by DECISIONS.md DEC-047: the Dutch EUID form `NL.KVK.` plus the 8-digit KVK number is admitted at certainty `possible`, sourced to the workbook only.

> Amended by DECISIONS.md DEC-049: each Appendix B item is verified in a table in `docs/gaps.md`; an item no source states is omitted and logged, and the Dutch sole-proprietor VAT mod 97 entry is modelled at `likely`.

> Amended by DECISIONS.md DEC-051: for now, an item stated by one named source but not confirmed by a primary source may enter the model at the certainty DEC-049 gives it (`likely` or `possible`), and confirming each item against its primary source is deferred and logged in `docs/gaps.md`.

These are commonly used values. They must first be confirmed with an authoritative source in `model/sources/` before they enter the model.

- ISO 6523 ICD codes: 0106 (KvK), 0190 (OIN), 0088 (GLN), 0060 (DUNS), 0199 (LEI); Peppol EAS 9944 (VAT number NL).
- Checksums: BSN, RSIN and fi-number via elfproef (last weight −1); LEI via ISO 7064 mod 97-10; GLN via GS1 mod 10; VAT id of a sole proprietorship (since 2020) via mod 97.
- Format of the Dutch EUID: the Excel mentions `NL.KVK.05058078`; check this against the e-Justice Portal or BRIS documentation.
- OIN structure: prefix `00000001` (based on RSIN) and `00000003` (based on KvK number); check this in the Logius documentation.
