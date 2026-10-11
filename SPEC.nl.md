# UIO Kennismodel — bouwspecificatie

> Bouwopdracht voor Claude Code. Versie 0.1, 9 oktober 2026.
> Opstellers: Leon Roseleur en Joost Wisselink (Davinci Conclusion), voor CoE-DSC.
> Leg dit bestand in de root van de repository als `SPEC.md` en verwijs ernaar vanuit `CLAUDE.md`.

## 0. Hoe je dit document gebruikt

- Bouw in de volgorde van §13. Rond elke stap af met groene tests voordat je de volgende begint.
- Voor de keuzes in §12 geldt de standaard. Wijk je af van deze specificatie, meld dat dan en vraag het eerst.
- Verzin geen domeinkennis. Elke uitspraak in het model heeft een bron (§5.4). Ontbreekt een bron, laat het gegeven dan weg en neem het op in `docs/gaps.md`.
- Taal in de repository: Engels (code, README, commentaar, identifiers). Labels in het model zijn tweetalig (`en` verplicht, `nl` waar beschikbaar).

---

## 1. Doel en afbakening

Het UIO Kennismodel helpt iedereen die een of meer *Unique Identifiers of Organisations* (UIO's) tegenkomt, zelf te herleiden wat ze zijn en hoe ze zich tot elkaar verhouden. Het is een open-sourceproduct in drie lagen: **kennismodel**, **engine** en **ontsluiting**.

**Wel in het model:**
- identifier-schema's en hun eigenschappen;
- de instanties die ze uitgeven of registreren (KvK, Douane, GLEIF, enzovoort);
- jurisdictie en toepasbaarheid;
- relaties en afleidingsregels;
- context (voorwaarden), bron en zekerheid.

**Niet in het model:**
- de organisaties die geïdentificeerd worden. Ingevoerde waarden worden alleen tijdens een vraag verwerkt en **nooit** opgeslagen, gelogd of verstuurd;
- vervanging van controle in de gezaghebbende registers. Het product verwijst ernaar, maar bevraagt ze niet;
- een taalmodel als bron van kennis.

**Principes:**
1. De kennis staat in het model, niet in de code. Een nieuw schema, een nieuwe relatie of een nieuwe regel vraagt geen codewijziging.
2. Elke conclusie is herleidbaar tot regels, bronnen en voorwaarden.
3. Onzekerheid wordt niet weggepoetst, maar gaat mee in elk antwoord.
4. AI mag vragen interpreteren en antwoorden formuleren, maar voegt geen feiten toe.
5. Er draait niets dat gehost moet worden: alleen statische bestanden en lokale processen.

## 2. Functionele scope (versie 0.1)

| Familie | Vraag | Voorbeeld | Enginefunctie |
|---|---|---|---|
| A. Begrijpen | Herkennen | "Wat is `NL001469630B01` voor nummer?" | `recognise` |
| A | Beschrijven | "Wie geeft een EORI uit en waar controleer ik die?" | `describe` |
| A | Jurisdictie en toepasbaarheid | "Onder welke jurisdictie valt een KvK-nummer, en is het in Duitsland toepasbaar?" | `applicability` |
| A | Niveau of rol | "Wijst een btw-nummer een rechtspersoon aan?" | `describe` |
| A | Levensloop | "Blijft een LEI gelijk na een fusie?" | `describe` |
| A | Borging | "Hoe sterk is een GLN geborgd?" | `describe` |
| B. Verbinden | Relatie en keten | "Hoe verhouden RSIN en EORI zich?" | `relate` |
| B | Afleiden | "Welk btw-nummer hoort bij dit RSIN?" | `derive` |
| B | Consistentie | "Horen dit KvK-nummer en dit EUID bij elkaar?" | `check` |
| C. Adviseren | Keuze en verplichting | "Welke identifier heb ik nodig voor e-facturatie met Belgische partijen?" | **Buiten scope van 0.1.** Het model mag dit later niet blokkeren. |

## 3. Architectuur

```
 Bijdragers (PR / issue)
          │
          ▼
 ┌─────────────────────┐     ┌──────────────────────────────┐
 │ Laag 1: model/*.yaml│ ──▶ │ CI: validate · test · build   │
 └─────────────────────┘     │  → dist/ (TTL, JSON-LD, JSON, │
                             │    landscape table)           │
                             └──────────────┬───────────────┘
                                            ▼
                 ┌──────────────────────────────────────────┐
                 │ Laag 2: engine (TypeScript, in-memory)    │
                 │ recognise · describe · applicability ·    │
                 │ relate · derive · check                   │
                 └───────┬──────────────┬───────────────────┘
                         ▼              ▼
              Laag 3: web (static)   MCP-server (stdio)    + download van dist/
```

De engine leest **alleen** de gegenereerde `dist/model.json`, een compacte, genormaliseerde vorm van het model, niet de YAML. Zo hebben RDF-afnemers en de engine precies dezelfde bron.

## 4. Repositorystructuur

```
/
├─ SPEC.md                      # dit document
├─ README.md                    # wat, waarom, voorbeeldvragen, EORI-casus, begrippenlijst
├─ CONTRIBUTING.md              # één pagina: schema/relatie/regel toevoegen, bron verplicht
├─ LICENSE                      # EUPL-1.2 (code)
├─ LICENSE-model                # CC-BY-4.0 (alles onder model/ en dist/)
├─ config.yaml                  # base namespace e.d. (één plek)
├─ sources/                     # bronmateriaal (Excel landscape table, PBLQ-rapport-verwijzing)
├─ model/
│  ├─ vocab/                    # gesloten lijsten: levels, roles, statuses, certainty, relation-kinds
│  ├─ authorities/*.yaml        # KvK, Belastingdienst, Douane, Logius, GLEIF, GS1, D&B, ...
│  ├─ jurisdictions/*.yaml      # NL, BE, DE, FR, LU, GB, CH, AT, EU, GLOBAL
│  ├─ sources/*.yaml            # bronnen waarnaar uitspraken verwijzen (id, titel, url, datum)
│  └─ schemes/*.yaml            # één bestand per identifier-schema (incl. relaties en regels)
├─ shapes/                      # SHACL-shapes
├─ tools/
│  ├─ build/                    # YAML → model.json, TTL, JSON-LD, landscape table
│  └─ validate/                 # JSON-Schema op YAML + SHACL op TTL + referentiële checks
├─ packages/
│  ├─ engine/                   # @uio/engine (npm), geen runtime-afhankelijkheden op netwerk
│  ├─ mcp/                      # @uio/mcp-server (npm, npx-uitvoerbaar)
│  └─ web/                      # statische site (Vite), deploy naar GitHub Pages
├─ dist/                        # gegenereerd, niet handmatig wijzigen (in .gitignore; release-asset)
├─ docs/
│  ├─ gaps.md                   # ontbrekende of onzekere kennis, met open vragen
│  └─ model.md                  # gegenereerde modeldocumentatie
└─ .github/
   ├─ workflows/ci.yml          # PR: validate, test, build
   ├─ workflows/release.yml     # tag: Pages, npm, dist als release-asset
   └─ ISSUE_TEMPLATE/           # new-scheme.yml, correction.yml
```

Monorepo met npm workspaces. Node LTS. Geen backend, database of telemetrie.

## 5. Laag 1 — Kennismodel

### 5.1 Gesloten lijsten (`model/vocab/`)

| Lijst | Waarden (startset) |
|---|---|
| `certainty` | `certain`, `likely`, `possible` (rangorde: certain > likely > possible) |
| `level` | `legal-entity`, `legal-entity-top-level`, `enterprise`, `establishment`, `natural-person`, `government-organisation`, `location`, `declaring-entity` |
| `role` | `taxpayer`, `economic-operator`, `e-invoicing-participant`, `financial-counterparty` |
| `applicability-status` | `issued` (uitgegeven in deze jurisdictie), `recognised` (wettelijk/formeel erkend), `verifiable` (controleerbaar vanuit deze jurisdictie), `not-applicable` |
| `relation-kind` | `derived-from`, `contains`, `prerequisite`, `same-level`, `different-level`, `equivalent-in` (ander land, zelfde functie), `may-identify-same-party`, `references` |
| `persistence-event` | `merger`, `acquisition-without-merger`, `split`, `dissolution`, `move-within-country`, `move-to-other-country` |

### 5.2 Schemabestand (`model/schemes/<id>.yaml`)

Valideer met een JSON-Schema in `tools/validate`. Velden:

```yaml
id: eori                               # kebab-case, uniek, wordt URI-suffix
label: { en: Economic Operators Registration and Identification, nl: EORI-nummer }
abbreviation: EORI
iso6523_icd: null                      # ICD-code indien bekend
kind: identifier                       # identifier | register | composite (zie §9)
issuer: national-customs-authority     # → model/authorities
jurisdiction: EU                       # jurisdictie van uitgifte → model/jurisdictions
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
  checksum: null                       # naam van een checksum-algoritme uit §6.4, of null
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
    certainty: likely                  # B01 is aangenomen; fiscale eenheden kunnen B02.. hebben
    source: landscape-v1.2
    examples: [ { in: NL001469630, out: NL001469630B01 } ]
notes: { en: "Not a general business identifier; often derived from one." }
```

De waarden hierboven zijn illustratief. Neem de echte waarden over uit `sources/` (§9). De EU-patroonregel en `expert-customs-2026` zijn **voorbeelden van bronverwijzingen**: maak ze alleen aan als die bron in `model/sources/` bestaat. Anders gaat het item naar `docs/gaps.md`.

### 5.3 Regels als data

Een regel is óf een **transformatie** van een waarde, óf een **als-dan-regel** over eigenschappen.

**Transformaties** zijn een lijst stappen uit een vaste, kleine set operaties. Voeg geen vrije code of expressies toe.
- `strip_prefix: n`, `strip_suffix: n`, `add_prefix: "…"`, `add_suffix: "…"`
- `pad_left: { length: n, char: "0" }`, `uppercase`, `remove: " .-"`
- `capture: { regex: "…", group: n }` (een deel uit een waarde halen)
- `template: "NL{value}B01"` (met `{value}` en eventueel `{capture:n}`)
- Na de transformatie valideert de engine de uitvoer tegen het formaat van het doelschema. Faalt die, dan is er geen conclusie.

**Als-dan-regels** (`kind: inference`) leiden een eigenschap af uit een combinatie van gegevens. Voorbeeld: als het schema `eori` is en het land van uitgifte NL, dan is het niveau `legal-entity-top-level` (`likely`). In 0.1 worden deze regels uitgedrukt via `condition` op `level`, `roles` en `applicability`. Een generieke regelvorm (SHACL-AF of SPARQL CONSTRUCT) mag later; leg de datastructuur zo neer dat dat kan.

**Condities** zijn gesloten sleutels: `issuing_country` (ISO 3166-1 alpha-2, `!` voor negatie), `entity_form` (bijvoorbeeld `sole-proprietorship`, `legal-person`), `context` (vrije tag, gedocumenteerd in `vocab`). Kan de engine een conditie niet vaststellen, dan neemt hij hem op als **aanname** in de uitleg, en daalt de zekerheid naar maximaal `likely`.

### 5.4 Bron en zekerheid (verplicht)

- Elke uitspraak (level, role, applicability, relation, rule, pattern, trust, persistence) heeft `source` (id in `model/sources/`) en `certainty` (standaard `certain` als het uit wet of standaard volgt; anders expliciet invullen).
- `model/sources/<id>.yaml`: `id`, `title`, `url?`, `publisher?`, `date`, `type` (`law` | `standard` | `register-doc` | `expert` | `analysis`). Bij een expert: rol en organisatie, nooit een persoonsnaam zonder toestemming.

### 5.5 RDF-mapping

- Basis-namespace uit `config.yaml`: standaard `https://w3id.org/uio/`. Schema's: `uio:scheme/<id>`; autoriteiten: `uio:authority/<id>`; regels: `uio:rule/<id>`; ontologie: `uio:def#`.
- Hergebruik: SKOS (`skos:ConceptScheme`, `skos:prefLabel`, `skos:notation`), ADMS (`adms:Identifier`, `adms:schemaAgency`), W3C ORG (`org:Organization` voor autoriteiten), DCTERMS (`dct:source`, `dct:spatial` voor jurisdictie), PROV-O (`prov:wasDerivedFrom` naar bron), ELI-URI's voor wetgeving, EU Authority Tables voor landen.
- Uitspraken met voorwaarde, zekerheid en bron worden **n-ary** gemodelleerd: een knoop `uio:def#Statement` met `uio:def#subject`, `uio:def#predicate`, `uio:def#object`, `uio:def#condition`, `uio:def#certainty`, `dct:source`. Geen RDF-star, voor maximale compatibiliteit.
- Output: `dist/uio.ttl`, `dist/uio.jsonld`, `dist/model.json` (voor de engine), `dist/landscape-table.md` en `.csv`, `docs/model.md`.

### 5.6 Validatie (CI faalt bij elk van deze)

1. YAML voldoet aan het JSON-Schema.
2. Elke verwijzing (issuer, jurisdictie, bron, target, input/output van regels) bestaat.
3. Elke uitspraak heeft een bron en een geldige zekerheid.
4. Elk `examples_valid` matcht minstens één patroon en de checksum; elk `examples_invalid` niet.
5. Elke regel met `examples` geeft precies de verwachte uitvoer.
6. De gegenereerde TTL voldoet aan de SHACL-shapes in `shapes/`.

## 6. Laag 2 — Engine (`packages/engine`)

TypeScript, ESM, geen netwerktoegang, geen afhankelijkheden die I/O doen. Laadt `model.json` (meegebundeld, of meegegeven bij `createEngine(model)`).

### 6.1 API

```ts
createEngine(model: Model): Engine

interface Engine {
  recognise(value: string, hint?: { country?: string }): Result<Candidate[]>
  describe(schemeId: string): Result<SchemeDescription>
  applicability(schemeId: string, jurisdiction: string): Result<Applicability>
  relate(a: string, b: string): Result<RelationPath[]>      // a/b = scheme-id's
  derive(value: string, schemeId?: string, ctx?: Context): Result<Derivation[]>
  check(values: string[], ctx?: Context): Result<ConsistencyFinding[]>
}

interface Result<T> {
  data: T
  conclusions: Conclusion[]     // mensleesbare samenvatting van wat de engine concludeert
  warnings: Warning[]           // o.a. mogelijk BSN, onbekende conditie, geen bron
}

interface Conclusion {
  statement: string             // Engelse zin, i18n-key ernaast
  certainty: 'certain' | 'likely' | 'possible'
  explanation: Step[]           // volledige keten
}

interface Step {
  kind: 'fact' | 'rule' | 'pattern' | 'checksum' | 'assumption'
  ref: string                   // id van schema/regel/uitspraak
  certainty: Certainty
  condition?: Condition
  source: SourceRef
}
```

### 6.2 Gedrag

- **Zwakste schakel:** de zekerheid van een conclusie is het minimum over alle stappen in `explanation`. Een niet vastgestelde conditie telt als stap `assumption` met zekerheid `likely`.
- **`recognise`:** probeer alle patronen van alle schema's en controleer de checksum. Geef alle kandidaten terug, gesorteerd op zekerheid en daarna op specificiteit (lengte van de regex-match zonder wildcards). Meerdere kandidaten is normaal; 9 cijfers kan RSIN, BSN of DUNS zijn.
- **`relate`:** directe relatie, anders de kortste keten (BFS) over `relations` en `rules`, met maximaal 4 stappen. Alle ketens van gelijke lengte worden teruggegeven.
- **`derive`:** pas alle regels toe waarvan `input` overeenkomt, ook herhaald (maximaal 4 stappen, geen cycli). Valideer elke uitvoer tegen het doelformaat.
- **`check`:** herken elke waarde, en zoek voor elk paar een regel die de ene in de andere omzet. Uitkomst per paar: `consistent` / `inconsistent` / `no-rule`, met de regel en de zekerheid.
- **Determinisme:** dezelfde invoer en hetzelfde model geven altijd dezelfde uitvoer, met stabiele sortering.

### 6.3 Privacy

- Geen opslag, logging, telemetrie of netwerkverkeer met waarden. Een unittest controleert dat de engine-bundle geen `fetch`, `XMLHttpRequest` of `WebSocket` bevat.
- **BSN:** als een kale waarde van 9 cijfers de elfproef haalt, kan het een BSN of een RSIN zijn. Het resultaat krijgt dan een waarschuwing `possible-personal-identifier`. De waarde wordt pas verder gebruikt in `derive` en `check` als de gebruiker of de context aangeeft dat het om een RSIN gaat (bijvoorbeeld `derive(value, "rsin")`, of afgeleid uit een btw-nummer).

### 6.4 Checksum-algoritmen (vaste set, aangeroepen bij naam vanuit het model)

`elfproef` (gewichten 9…2 en −1 voor het laatste cijfer; geldt voor BSN en RSIN, die dus niet op checksum te onderscheiden zijn), `iso7064-mod97-10` (LEI, ook btw-id van eenmanszaken), `gs1-mod10` (GLN), `none`. Elk algoritme heeft eigen unittests met bekende geldige en ongeldige waarden. Leg vóór gebruik vast welke schema's welk algoritme hebben, met bron; zie bijlage B.

## 7. Laag 3 — Ontsluiting

### 7.1 Website (`packages/web`)

- Statisch (Vite, geen framework-eis; voorkeur: plain TS of Preact). Gehost op GitHub Pages.
- Drie weergaven:
  1. **"Plak je identifiers"**: één tekstvak, één waarde per regel. Toont herkenning, afleidingen en consistentie, elke conclusie met een uitklapbare uitleg (stappen, bron, voorwaarde, zekerheid).
  2. **Schema's**: lijst en detailpagina per schema (`describe`) met toepasbaarheid per jurisdictie en de relaties als kleine graaf.
  3. **Relatie**: twee schema's kiezen en de keten zien (`relate`).
- Zekerheid zichtbaar met tekst én kleur, niet alleen kleur. Toegankelijk (WCAG 2.1 AA), werkt op mobiel.
- Geen cookies, geen analytics en geen externe requests. Fonts en assets zitten in de bundle.
- Tekst onder het invoerveld: "Values are processed in your browser only and never stored or sent."
- UI-taal: Engels, met Nederlands als tweede taal (eenvoudige i18n).

### 7.2 MCP-server (`packages/mcp`)

- `@modelcontextprotocol/sdk`, stdio-transport, te starten met `npx @uio/mcp-server`.
- Zes tools, één per enginefunctie, met dezelfde namen en een JSON-schema voor de invoer. De uitvoer is de volledige `Result`, inclusief `explanation`.
- Elke tool-description eindigt met: *"Report conclusions with their certainty and source exactly as returned. Do not add facts about identifiers that are not in the result."*
- Eén resource `uio://model/summary` met de lijst schema's, en per schema een korte beschrijving.
- README-sectie met configuratievoorbeelden voor Claude Desktop en VS Code.

### 7.3 Download

Elke release voegt `dist/*` toe als release-asset. De website linkt naar de laatste release.

### 7.4 Later, niet bouwen in 0.1

REST API, een eigen chat met een taalmodel (bijvoorbeeld Jev van TypeSafe AI) en een SPARQL-endpoint. Houd de engine-API zo dat dit dunne lagen kunnen worden.

## 8. Tests en CI

- **Unit:** checksums, transformaties, zekerheidscombinatie, de vijf gedragsregels van §6.2.
- **Modelgedreven:** genereer de tests uit alle `examples_valid`, `examples_invalid` en regel-`examples`.
- **Acceptatie:** de EORI-casus (§10) als end-to-end test op engine-niveau, en als smoke test op MCP en web (Playwright, headless).
- **`ci.yml` (bij een pull request):** install → validate model → build dist → test → build web en mcp.
- **`release.yml` (bij een tag `v*`):** hetzelfde, plus deploy naar Pages, `npm publish` van engine en mcp, en dist als release-asset.
- Semver voor het model: een nieuw schema of een nieuwe regel is minor; een gewijzigde betekenis of een verwijdering is major. Houd `CHANGELOG.md` bij.

## 9. Startdata

**Bron:** `sources/Analysis of Unique IDs for companies.xlsx` (tabblad *Overzicht UID* = landscape table, *Persistence*, *KvK in NL en buitenland*). Lever ook een conversiescript `tools/import/excel.ts`, of zet de waarden handmatig over. Leg in beide gevallen per veld `source: landscape-v1.2` vast.

**Startset van 14 schema's:** `kvk-number`, `kvk-establishment-number` (vestigingsnummer), `oin`, `rsin`, `vat` (generiek) plus `vat-nl`, `roo`, `peppol-id`, `lei`, `gln`, `euid`, `eori`, `duns`, `bsn`, `fi-number`.

**Bekende aandachtspunten:**
- De Excel heeft **twee kolommen LEI** (deels Nederlands). Voeg ze samen; zet tegenstrijdige waarden (persistence: medium tegenover low) in `docs/gaps.md`.
- **ROO** is een register, geen identifier. Gebruik `kind: register`, met een URL als identificatie.
- **Peppol-ID** is samengesteld (`<ICD>:<waarde>`). Gebruik `kind: composite`. De engine herkent het voorvoegsel en delegeert de waarde aan het onderliggende schema.
- **BSN** en **fi-nummer** staan niet in de Excel. Modelleer ze minimaal (uitgever, jurisdictie, formaat, relatie fi-nummer → RSIN) met een bron, of zet ze in `docs/gaps.md`.
- **Equivalenten in het buitenland** (KBO, Handelsregister HRB/HRA, SIREN/SIRET, RCSL, Companies House, UID-CH, Firmenbuch) komen uit het tabblad *KvK in NL en buitenland*. Modelleer ze als lichte schema's met `equivalent-in` naar `kvk-number`.
- De **trust score** (vijf deelscores) en **persistence** (zes gebeurtenissen) komen rechtstreeks uit de Excel.

## 10. Acceptatiecasus: EORI

**Invoer:** `derive("NL001469630", "eori")` en `check(["NL001469630", "NL001469630B01", "001469630"])`.

**Verwacht** (zekerheid tussen haakjes; de bronnen volgen uit het model):

| Conclusie | Zekerheid |
|---|---|
| Uitgegeven door de Nederlandse Douane; te controleren via de EU-validatie van EORI | certain |
| Bijbehorend btw-nummer `NL001469630B01` (regel `vat-nl-from-eori-nl`) | likely |
| Bijbehorend RSIN `001469630` (via het btw-nummer; geldt niet voor eenmanszaken: aanname `entity_form = legal-person`) | likely (zwakste schakel) |
| Wijst waarschijnlijk de rechtspersoon op topniveau aan (voorwaarde: NL) | likely |
| Via het RSIN op te zoeken in het Handelsregister (verwijzing, geen opzoeking) | certain |
| `check`: alle drie de paren `consistent`, met regel en zekerheid | — |

**Contrast:** `derive("DE123456789012345", "eori")` geeft geen Nederlands btw-nummer, en als niveau `declaring-entity` (likely).

`RSIN 001469630` voldoet aan de elfproef. Controleer dit in de test; de waarde komt uit de Excel (ABN AMRO Schadeverzekering N.V., openbare gegevens). Gebruik in de tests verder alleen waarden uit openbare voorbeelden in `sources/`, of synthetische waarden die de checksum halen.

## 11. Definition of done (v0.1)

- [ ] Alle 14 schema's staan in `model/schemes/`, met bron bij elke uitspraak; hiaten staan in `docs/gaps.md`.
- [ ] CI is groen: validatie, SHACL, modelgedreven tests, unit- en acceptatietests.
- [ ] De zes enginefuncties werken voor alle schema's, en elke conclusie heeft een uitleg.
- [ ] De website staat op GitHub Pages en de EORI-casus werkt daar.
- [ ] De MCP-server is te starten via `npx` en beantwoordt de voorbeeldvragen uit §2 in Claude Desktop.
- [ ] `dist/` (TTL, JSON-LD, landscape table) is te downloaden bij release `v0.1.0`.
- [ ] README (inclusief begrippenlijst en EORI-casus), CONTRIBUTING (één pagina) en beide LICENSE-bestanden zijn aanwezig.

## 12. Open keuzes en standaarden

| Keuze | Standaard tot besluit |
|---|---|
| Eigenaar van de repository en de namespace | Namespace `https://w3id.org/uio/`, op één plek instelbaar in `config.yaml`. Repo-eigenaar volgt. |
| Taal van de engine | TypeScript |
| Licenties | Code onder EUPL-1.2; model en dist onder CC-BY-4.0 |
| BSN | Herkennen en waarschuwen, niet verder verwerken (§6.3) |
| Definitie van "toepasbaar" | Vier statussen (§5.1); per jurisdictie zijn er meerdere tegelijk mogelijk |

## 13. Bouwvolgorde

1. Monorepo-opzet, licenties, `config.yaml`, CI-skelet.
2. Gesloten lijsten, JSON-Schema voor de YAML, validatietool.
3. Startdata: `eori`, `vat-nl`, `rsin`, `kvk-number`, `euid` volledig (dit dekt de EORI-casus); daarna de overige schema's.
4. Build: YAML → `model.json`, TTL, JSON-LD, landscape table; SHACL-shapes.
5. Engine: checksums en transformaties → `recognise`, `describe`, `applicability` → `relate`, `derive`, `check` → acceptatietest EORI.
6. MCP-server.
7. Website.
8. README, CONTRIBUTING, issue-sjablonen, release `v0.1.0`.

---

## Bijlage A — Startdata in het kort (uit de landscape table)

| Schema | Uitgever | Jurisdictie | Formaat (volgens bron) | Gerelateerd aan |
|---|---|---|---|---|
| KvK-nummer | Kamer van Koophandel | NL | 8 cijfers | Oorsprong van veel andere ID's |
| Vestigingsnummer | Kamer van Koophandel | NL | 12 cijfers | KvK-nummer |
| OIN | Logius | NL | 20 cijfers: prefix(8) + KvK-nummer of RSIN + suffix | KvK-nummer of RSIN |
| RSIN | Kamer van Koophandel | NL | 9 cijfers | btw-nummer; gebaseerd op fi-nummer |
| btw-nummer (NL) | Belastingdienst | NL (btw-id's wereldwijd) | NL + 9 cijfers + B + 2 cijfers | RSIN (niet bij eenmanszaken) |
| ROO | Logius / KOOP | NL | n.v.t. (register, URL) | KvK-nummer, OIN |
| Peppol-ID | OpenPeppol | NL / internationaal | Eén van: KvK-nummer, OIN, btw-nummer, IBAN, GLN, met ICD-voorvoegsel | RSIN, OIN, btw-nummer |
| LEI | LOU's onder GLEIF | wereldwijd | 20 tekens: LOU(4) + ID(14) + controlecijfers(2), ISO 17442 | KvK-nummer via RA-codes |
| GLN | GS1 | wereldwijd | 13 cijfers (GS1) | geen |
| EUID | nationaal register, via BRIS | EU | landcode + registercode + nationaal nummer (+ controlecijfer) | KvK-nummer |
| EORI | nationale douane | EU | NL: btw-nummer zonder laatste 3 tekens | btw-nummer, KvK-nummer |
| DUNS | Dun & Bradstreet | wereldwijd | 9 cijfers | KvK-nummer, LEI, btw-nummer |
| BSN | Rijksoverheid (BRP) | NL | 9 cijfers, elfproef-variant | (persoonsgebonden) |
| fi-nummer | Belastingdienst | NL | 9 cijfers | RSIN |

## Bijlage B — Te verifiëren details (niet overnemen zonder bron)

Dit zijn veelgebruikte waarden. Ze moeten eerst met een gezaghebbende bron in `model/sources/` worden bevestigd voordat ze het model in gaan.

- ISO 6523 ICD-codes: 0106 (KvK), 0190 (OIN), 0088 (GLN), 0060 (DUNS), 0199 (LEI); Peppol EAS 9944 (btw-nummer NL).
- Checksums: BSN, RSIN en fi-nummer via elfproef (laatste gewicht −1); LEI via ISO 7064 mod 97-10; GLN via GS1 mod 10; btw-id eenmanszaak (sinds 2020) via mod 97.
- Formaat van het Nederlandse EUID: de Excel noemt `NL.KVK.05058078`; controleer dit tegen het e-Justice Portal of BRIS-documentatie.
- OIN-opbouw: prefix `00000001` (op basis van RSIN) en `00000003` (op basis van KvK-nummer); controleer dit in de Logius-documentatie.
