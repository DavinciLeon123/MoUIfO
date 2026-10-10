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

`elfproef` (11-proof; weights 9…2 and −1 for the last digit; applies to BSN and RSIN, which therefore cannot be told apart by checksum), `iso7064-mod97-10` (LEI, also the VAT id of sole proprietorships), `gs1-mod10` (GLN), `none`. Each algorithm has its own unit tests with known valid and invalid values. Before use, record which schemes have which algorithm, with a source; see Appendix B.

<!-- gsd:write-continue -->
