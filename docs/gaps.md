# Gaps

This file lists knowledge that is not in the model, or is in it with a caveat, and the open question behind each item (DEC-019, strict sourcing). A statement without a source or with an unverified claim is left out of `model/` and logged here instead of being invented. Each entry has four parts: the item, why it is not in the model, the open question, and who or what resolves it. The entries below come from the Phase 2 seed (plans 02-08 and 02-09).

Every seeded membership, prefix and source was read on its live page while the seed was written. No membership or prefix claim was omitted in plans 02-08 and 02-09, so the list below holds only identifier and label gaps and the interpretations that a human check should look at.

## EUR-Lex text of the two EU sources not re-read

- **Item:** `teu-art-52` (ELI `http://data.europa.eu/eli/treaty/teu_2016/2025-03-15`) and `vat-directive-art-215` (ELI `http://data.europa.eu/eli/dir/2006/112/2025-04-14`) now cite EUR-Lex, with the ELIs supplied by the owner on 2026-10-12.
- **Why it is a caveat:** EUR-Lex cannot be read automatically from the build environment (HTTP 202 with an empty body), so the cited wording (TEU Art. 52(1) naming the Netherlands, Belgium and Greece; Directive Art. 215 with the "EL" and "XI" prefix sentences) was read earlier on the legislation.gov.uk mirror and not yet on EUR-Lex. The `teu-art-52` `url` is its ELI (the owner's CELEX link pointed at the 2016 text, not the 2025-03-15 consolidated version), and its date 2025-03-15 is the version date in that ELI.
- **Open question:** does the EUR-Lex text read the same for those claims, and is the ELI version date the right `date` for `teu-art-52`?
- **Owner or next step:** the end-of-phase human check opens both EUR-Lex pages and confirms text and date; adjust the files if they differ.

## GB means the United Kingdom, but the GB EORI prefix covers Great Britain only

- **Item:** the jurisdiction `GB` is labelled "United Kingdom" (the state), while the GB prefix of an EORI number applies to customs activities in England, Scotland and Wales only, and the XI prefix covers Northern Ireland (`hmrc-eori-introduction`). XI is `part_of` GB (`nia-1998-s1`).
- **Why it is not in the model:** the model has one jurisdiction per state, and the jurisdiction file cannot express an area narrower than its label. The caveat lives in the `notes` of `GB` and `XI`; no rule can use it yet. The `eori` scheme (plan 03-06) states GB and XI applicability separately, with notes, so the answer for XI does not flow down from GB (DEC-041); GB stays the state.
- **Open question:** should a later phase add a separate jurisdiction for Great Britain, or keep GB as the state and let the EORI scheme state its own area? DEC-041 already caps an answer inherited from GB to XI below certain.
- **Owner or next step:** decide in Phase 3 (EORI scheme data) and Phase 5 (inheritance), with the owner.

## Version date of a seeded source

- **Item:** the `date` of `hmrc-eori-introduction` (2025-01-24).
- **Why it is not in the model:** the page does not state one plain version date, so the value is read from page metadata: the GOV.UK page metadata gives 2025-01-24 as the public update date of this section. The parent EORI manual was last changed on 10 September 2025, which is a different page.
- **Open question:** is the section date the right one for a GOV.UK manual section?
- **Owner or next step:** the end-of-phase human check opens the page and confirms the date; adjust the file if it differs.

## Workbook hyperlinks whose target does not back their label

- **Item:** several hyperlinks of the workbook (`landscape-v1.2-links.csv`) do not back the label of their cell. (a) The RSIN and fi-number legal-basis cells (I13 and S13, labelled "Tax legislation") link to the Handelsregisterbesluit 2008; the page names neither the RSIN nor a fiscal number. (b) The EUID legal-basis cell (O13, "Digital Single Market (EU)") links to a Commission policy communication PDF, not to a legal act. (c) The Logius landing page (H15) is not registered. (d) The AFM MiFID II glossary link (D49 and H49) is dead: it redirects to the AFM "Pagina niet gevonden" page. (e) The DNB EMIR glossary link (D48 and H48) refuses automated clients (HTTP 403). (f) The D&B lookup link (Q25) redirects to my.dnb.com/lookup.
- **Why it is not in the model:** a page is cited only for a claim it supports (DEC-043). The Handelsregisterbesluit 2008 is cited for the KvK number only: the page refers to the unique number of article 12, under a, of the Handelsregisterwet, and nothing in it supports an RSIN or a fiscal number. The policy communication cannot back the EUID legal basis. The Logius landing page is an issuer modelled as an authority class that carries no source (DEC-045). The glossary links are not primary hyperlinks (DEC-043), and the dead and refused pages could not be read.
- **Open question:** which pages should the workbook cite for the RSIN and fi-number legal basis, for the EUID legal basis (O13), and for the AFM and DNB glossary entries?
- **Owner or next step:** the workbook authors, at the next workbook version; the owner decides the replacement pages. The model keeps the registered links as they are until then.

## Source dates not stated on the page (DEC-042)

- **Item:** the `date` of these registry sources is a DEC-042 fallback, with the kind of date used: kvk-home (JSON-LD `dateModified`), kvk-zoeken (JSON-LD `dateModified`, 2026-01-20 read on 2026-10-12), koop-roo (`DCTERMS.modified`), gs1-nl-gln (read date), dnb-duns (HTTP `Last-Modified`), oin-register (HTTP `Last-Modified`), vies (read date), organisaties-overheid (read date), e-justice-business-registers (HTTP `Last-Modified`), eori-validation (read date), peppol-test-tool (HTTP `Last-Modified`), gs1-verified (read date), dnb-duns-lookup (HTTP `Last-Modified`), commission-eori (JSON-LD `dateModified`, 2026-06-03; the page shows no visible date), ondernemersplein-nummers-voor-de-btw (JSON-LD `dateModified`, 2026-08-04; no visible date found on the page).
- **Why it is not in the model:** the source schema dates a register-doc by the page's last-updated date, and the schema needs a date for every source. DEC-042 takes the machine-readable modification date, then the date the page was read, when the page states no date. Whether each page also shows a visible version date was not checked for every page.
- **Open question:** does each page show a version date a person can read (for example "Bijgewerkt" or "Last update")? If it does, that date replaces the fallback.
- **Owner or next step:** the end-of-phase human check opens each page and confirms or corrects its `date`; the affected files are adjusted if it differs. Later plans append the ids of their own fallback-dated sources to this entry.

## EUR-Lex ELI of Commission Implementing Regulation (EU) 2017/394 not confirmed

- **Item:** `csdr-its-2017-394` carries the ELI `http://data.europa.eu/eli/reg_impl/2017/394/oj`, and `ucc-952-2013` carries `http://data.europa.eu/eli/reg/2013/952/oj`, the ELI of its workbook link.
- **Why it is not in the model:** the EUR-Lex text read on 2026-10-12 through the Publications Office Cellar (CELEX 32017R0394) names no ELI, and the ELI resolver returned HTTP 202 with an empty body for both strings, so neither could be confirmed. The `reg_impl` form follows the standard EU ELI pattern for implementing regulations, and the `reg/2013/952/oj` form is the ELI behind the workbook's own EUR-Lex link. A wrong ELI fails only a human check, because the validator accepts any http or https URL.
- **Open question:** does `http://data.europa.eu/eli/reg_impl/2017/394/oj` resolve to CELEX 32017R0394, and does `http://data.europa.eu/eli/reg/2013/952/oj` resolve to CELEX 32013R0952?
- **Owner or next step:** the end-of-phase human check opens both ELIs in a browser and changes the file if either one resolves to another act.

## EORI level claims of SPEC §10 (DEC-050)

- **Item:** SPEC §10 expects the EORI of a Dutch legal person to designate its top-level legal person (level `legal-entity-top-level`), and the EORI of a foreign party to designate its `declaring-entity`, both at likely.
- **Why it is not in the model:** no source supports either level (DEC-050). The `eori` scheme therefore declares no level, and the start-data test fails if one is added without a source.
- **Open question:** does a customs source (the Union Customs Code, a Commission page or a Douane page) state which legal entity or declaring entity an EORI number designates?
- **Owner or next step:** the owner names a customs or expert source; a new DECISIONS row then adds the level with its citation. Phase 5 acceptance asserts only sourced conclusions.

## Dutch sole-proprietor EORI and the non-Dutch NL plus fi-number form

- **Item:** the `eori` scheme admits the Dutch sole-proprietor form, NL followed by 10 digits, at likely, sourced only to the workbook (DEC-046; the owner accepted this at likely on 2026-10-12). The workbook also lists a "non-Dutch: NL + fi-nummer" form, which the model does not contain.
- **Why it is not in the model:** the Douane page read on 2026-10-12 states that the EORI number is always based on the RSIN, and the KvK RSIN page states that only sole proprietorships receive no RSIN. No read source states how a sole proprietor's EORI is built, so no derivation is written (D-08). The NL plus fi-number form rests on the workbook only; the Phase 3 research records the Handboek Douane page that describes it as valid until 30 April 2016, and that page was not re-read for this entry.
- **Open question:** what does Douane state about the EORI number of a sole proprietor, and about a foreign party with a Dutch fiscal number?
- **Owner or next step:** a Douane statement on sole proprietors and foreign parties; then a derivation or a pattern at its own certainty, or the current 10-digit pattern is removed.

## Elfproef of RSIN, BSN and fi-number rests on the workbook

- **Item:** the 9-digit pattern and the elfproef check of the `rsin` scheme are stated at likely, on the workbook only (DEC-046). The `bsn` and `fi-number` schemes carry the same pattern and check at likely on the same basis.
- **Why it is not in the model:** no primary source read states the digit count or the check. The Wabb text read gives no digit rule, and the research found no primary source for the RSIN or fi-number elfproef (Appendix B, gap G9). The SPEC §10 example passes the elfproef, which is consistent with the workbook but is not proof of it.
- **Open question:** does an official source state the elfproef, and the digit count, for the RSIN, the BSN and the fi-number?
- **Owner or next step:** the end-of-phase human check; the certainty of these statements rises to certain only once a source states them.

## BSN and fi-number have no valid example

- **Item:** the `bsn` and `fi-number` schemes have no `examples_valid`. Both carry the 9-digit pattern and the elfproef at likely from the workbook, and the workbook gives "?" as the example in every row of both schemes.
- **Why it is not in the model:** no public example of either number is read. A valid-looking nine-digit value committed to the repository would be a possible personal number, which the personal-number guard refuses (DEC-022, DEC-025), and an allow-list entry for one may only land as a separate change that the owner merges first. The model keeps two invalid examples per scheme, each rejected by the format (DEC-039); a test that needs a valid value builds one at runtime.
- **Open question:** does the owner want a synthetic, elfproef-valid BSN example for Phase 5 `recognise`, admitted through the allow-list as its own change merged before the model change?
- **Owner or next step:** the owner decides. Until then the model shows the two schemes with invalid examples only.

## BSN validation register without a URL

- **Item:** the workbook names the validation source of the BSN as the BRP (Basisregistratie Personen) and gives no URL. The `bsn` scheme therefore has no `validation_source`.
- **Why it is not in the model:** a validation source needs a label and a URL, and no read source gives a URL at which a BSN can be checked. The workbook gives the BSN availability as restricted, so a public check may not exist.
- **Open question:** is there a public page, from the RvIG or Logius, that states how a BSN is verified, and does the BRP offer any open check?
- **Owner or next step:** the owner or the RvIG names a source; the `validation_source` is then added at its own certainty.

## RSIN long name differs between the workbook and the KVK

- **Item:** the workbook gives the RSIN the name "Rechtspersonen en Samenwerkingsverbanden Identificatie Nummer", and the KVK RSIN page gives "Rechtspersonen en Samenwerkingsverbanden Informatienummer" (Legal Entities and Partnerships Information Number). The model uses the KVK name in the `label`; the workbook's name stays in the committed snapshot.
- **Why it is not in the model:** the issuer's own name is the one the scheme label should carry, and the workbook's variant is an analysis claim, not a primary statement (DEC-046). Both names are logged here, so the difference is not hidden.
- **Open question:** which name do the workbook authors intend, and should the workbook be corrected at its next version?
- **Owner or next step:** the workbook authors at the next workbook version; the owner confirms the label.

## Union Customs Code succession (Regulation (EU) 2026/2108)

- **Item:** Regulation (EU) No 952/2013 (Union Customs Code, Article 9) is the legal basis in force on 2026-10-12. Regulation (EU) 2026/2108, published in the Official Journal on 19 September 2026, names the EORI number in Article 26, applies from 21 September 2027 (Article 287(2)) and repeals Regulation (EU) No 952/2013. The `eori` scheme states both legal bases with their own certainty and notes.
- **Why it is not in the model:** both legal bases are stated for the dates they apply; the model does not replace 952/2013 before 21 September 2027. Article 9 of 952/2013 requires registration only and does not name the EORI number. The ELI of 2026/2108 was supplied by the owner; the Cellar text of CELEX 32026R2108 confirms the title, the date of 16 September 2026 and Article 26, but not the ELI string.
- **Open question:** from 21 September 2027, does the legal basis of `eori` move to Article 26 alone, and does Article 9 of 952/2013 remain a basis for the registration obligation?
- **Owner or next step:** recheck in Phase 8, when the regulation applies; the end-of-phase human check confirms the ELI in a browser.

## Mod 97 check of the Dutch sole-proprietor VAT number

- **Item:** the ISO 7064 mod 97-10 checksum entry of `vat-nl`, which applies to sole proprietors and is modelled at `likely`. The structure of a sole proprietor's VAT number (NL, 9 digits, the letter B, 2 digits) is stated by the Ondernemersplein page and is modelled at `certain`; the check-digit rule is not stated there.
- **Why it is not in the model:** the entry is in the model because the owner decided on 2026-10-12 that the any-of checksum of DEC-004 and DEC-038 governs over D-06 for this entry (DEC-049). No official text read states the check: neither Ondernemersplein page read on 2026-10-12, nor the text of the Wet op de omzetbelasting 1968, mentions it. The entry rests on `vat-nl-mod97-analysis`, a computation over the official example on the Ondernemersplein page. The mod 97 check passes on that example and the elfproef over its 9-digit core fails. The computation shows the check is consistent with the example; it is not a source for the rule.
- **Open question:** does the Belastingdienst or Ondernemersplein state that a sole proprietor's VAT number carries an ISO 7064 mod 97-10 check digit, and over which characters is the check computed?
- **Owner or next step:** an official statement of the check. Until one is read the entry stays at `likely`, and the end-of-phase human check looks for it.

## Suffix after the B of the Dutch VAT number, and no RSIN-to-VAT rule (DEC-050)

- **Item:** SPEC §5.2 and §10 derive a VAT number from an RSIN or an EORI with a fixed suffix `B01` (the `vat-nl-from-rsin` example of SPEC §5.2). The model has no rule with output `vat-nl`, so no VAT number is derived from an RSIN or an EORI.
- **Why it is not in the model:** the Ondernemersplein pages state that the VAT number ends in the letter B and 2 digits, but neither states which two digits a given legal person receives (DEC-050, DEC-019). The workbook's VAT example for ABN AMRO Schadeverzekering ends in B01; that is one company's number, not a rule. A fixed `B01` would be an assumption. Third-party text reports other digits for fiscal units and other legal persons (B02 and higher); no official source read states them, so they are not modelled.
- **Open question:** does a Belastingdienst source state which two digits follow the B for a legal person, a sole proprietor and a fiscal unit? If it does, is the RSIN-to-VAT direction a rule for each entity form?
- **Owner or next step:** the owner names a Belastingdienst source. Then a rule is added with its own citation and a new DECISIONS row. Until then Phase 5 does not derive a VAT number from an EORI or an RSIN; the chain runs VAT to RSIN to EORI only (DEC-003).

## Workbook VAT format cells and the official structure

- **Item:** the workbook's VAT-nr cells J10 and J11. J10 gives "in NL: NL + num(9) + B + [subnummer]" and "for EMZ: NL + 10 random digits (no BSN)". J11 gives "Dutch single person enterprise: [NL][unique ID(9)][B][[verification(2)]" and "other Dutch enterprises: [NL][RSIN]".
- **Why it is not in the model:** the sole-proprietor form in J10 (NL plus 10 random digits) contradicts the official structure, which the Ondernemersplein page states as NL, 9 digits, the letter B and 2 digits, and which J11 also gives for the sole proprietor. J11's legal-person form omits the letter B and the two digits that the Ondernemersplein page states for other legal forms. The model follows the Ondernemersplein pages; the workbook gives the VAT rule only at `likely` (DEC-046). The page "Btw-identificatienummer opvragen, controleren en vermelden" also describes a different number, the omzetbelasting-nummer (ob-nummer), which for a sole proprietor is built from the BSN with the letter B and 2 digits. That number is not the VAT identification number and is not modelled.
- **Open question:** does the next workbook version correct J10 and J11 to the official structure?
- **Owner or next step:** the workbook authors, at the next workbook version. The model keeps the official structure until then.

## Dutch EUID register identifier (Implementing Regulation (EU) 2021/1042 annex)

- **Item:** the Dutch form of the EUID, `NL.KVK.` followed by the 8-digit KVK number, which the `euid` scheme admits as its only format pattern at certainty `possible` (DEC-047, the owner's "low certainty" of 2026-10-12). The same entry covers the `prerequisite` relation from `euid` to `kvk-number`, at likely, which rests on the workbook's prerequisite row ("presence of CoC-nr") and applies to the Dutch form only.
- **Why it is not in the model:** only the structure is confirmed. Regulation (EU) 2021/1042, Annex point 9 (read through the Publications Office Cellar on 2026-10-12), gives the country code, the register identifier, the registration number and an optional verification digit; it names neither `NL.KVK` nor `NLNHR`, the form the SPEC mentions. Directive (EU) 2017/1132, Article 16(1), does not name the form either. The workbook's example is the only source of the form. No rule derives an EUID from a KVK number (DEC-047), because no source states that the registration number of a Dutch EUID equals the KVK number.
- **Open question:** which register identifier does a Dutch EUID carry, `KVK`, `NLNHR` or another code? Does its registration number equal the 8-digit KVK number? Does the e-Justice portal or BRIS documentation state the Dutch format?
- **Owner or next step:** the owner checks the e-Justice or BRIS documentation for the Dutch format. The EUID part of the release stays gated on this (DEC-047). A sourced pattern replaces the workbook form through a new DECISIONS row; the owner decides.

## ICD codes stated only by the Peppol code list

- **Item:** the ICD code `0106` of `kvk-number`, held as `iso6523_icd` at likely from `peppol-code-lists-9-7`, and any other ICD code that only the Peppol Code Lists v9.7 state. The EAS code `0106` is certain from the same list, because the list is the only source for both values.
- **Why it is not in the model:** it is in the model at likely, not certain. The ISO/IEC 6523 ICD registry (iso6523.info) could not be read on 2026-10-12, because its certificate has expired, so no read source confirms the ICD value beyond the Peppol list. The Peppol list also gives a RegEx note for 0106 (17 digits) that does not match the KVK number's 8 digits; that note is not used.
- **Open question:** does the ISO/IEC 6523 ICD registry list 0106 as the code of the Netherlands Chamber of Commerce, as the Peppol list states?
- **Owner or next step:** a human check of the ISO 6523 registry once its certificate is readable (G8). If the registry differs, the `iso6523_icd` statement of `kvk-number` changes or is removed.

## Levels and roles without a source

- **Item:** the level and role statements that the model omits for lack of a source. `kvk-number` declares neither a level nor a role. `oin` and `fi-number` declare no level either. The `euid` level `legal-entity` is modelled at likely on the workbook's scope text alone, with no primary source behind it.
- **Why it is not in the model:** no read source states the level of a KVK number or the role it plays. The KVK page says that "your business or organisation" has an 8-digit KVK number, which does not name a level. The research (G13) finds no sourced level or role for `kvk-number`, `oin`, `fi-number`, `vat`, `duns` or `peppol-id`, and a statement without a source is not written (DEC-019). The `roo` level (KOOP page) and the `bsn` level (Wabb Article 1) are sourced and so are not listed. The `euid` level rests on the workbook (DEC-046) and is marked likely for that reason.
- **Open question:** does a read source state whether a KVK number identifies a legal entity or an establishment, and what role the KVK number and the EUID play in a transaction?
- **Owner or next step:** the owner names a source for each level and role, or accepts the omission. Later plans add their own levels and roles with their sources (G13).

## One validation source per scheme

- **Item:** the workbook names two validation sources for the KVK number: "NL/D: Handelsregister / B: Kruispuntbank" (the Belgian Kruispuntbank for a Belgian enterprise number). The model holds one `validation_source` for `kvk-number`: the KVK Business Register search (`kvk-zoeken`).
- **Why it is not in the model:** the scheme schema takes one `validation_source`, so the Belgian source cannot sit beside the Dutch one. The Belgian half belongs with the KBO scheme (DEC-048), whose official Belgian sources are CAPTCHA-gated (G5).
- **Open question:** should `validation_source` take a list, so that a scheme can name more than one register search, for example the Handelsregister and the Kruispuntbank for the KVK number?
- **Owner or next step:** the owner decides on a schema change through a new DECISIONS row. Until then the Handelsregister search stays the single validation source of `kvk-number`.

## EUID participating countries (BRIS)

- **Item:** the number of countries in which the Business Registers Interconnection System (BRIS) applies. The workbook's glossary gives BRIS as "applies in 31 participating countries". The model states the jurisdiction of `euid` as `EU` only.
- **Why it is not in the model:** no read source lists the 31 countries. The model's jurisdiction vocabulary has EU and no area that could hold the non-EU participants, and the jurisdictions may not change in Phase 3. The EU jurisdiction is the claim the Directive (Article 16(1)) and the Regulation (Annex point 9) support, because both apply to the registers of the Member States.
- **Open question:** which countries take part in BRIS, and should the EUID be stated for an EEA or other area, with a new jurisdiction?
- **Owner or next step:** the owner or the BRIS documentation names the participating countries. A jurisdiction change is a new DECISIONS row, since the vocabulary is not changed in Phase 3.
