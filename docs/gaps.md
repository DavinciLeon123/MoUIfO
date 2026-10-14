# Gaps

This file lists knowledge that is not in the model, or is in it with a caveat, and the open question behind each item (DEC-019, strict sourcing). A statement without a source or with an unverified claim is left out of `model/` and logged here instead of being invented. Each entry has four parts: the item, why it is not in the model, the open question, and who or what resolves it. The Appendix B verification table and the end-of-phase human check come first. The other entries come from the Phase 2 seed (plans 02-08 and 02-09), the Phase 3 plans (03-01 to 03-15) and the owner's agreement of 2026-10-14 on the Phase 3 verification (DEC-051).

Every seeded membership, prefix and source was read on its live page while the seed was written. No membership or prefix claim was omitted in plans 02-08 and 02-09, so the list below holds only identifier and label gaps and the interpretations that a human check should look at.

## Appendix B verification (DEC-049)

Each row names the source actually read, the status of the item and the certainty at which the item is in the model (DEC-049). An item that no source states is omitted and logged below. An item stated only by the workbook (DEC-046) or by a documented computation is in the model at the certainty its row gives and is logged as well. A Peppol-code-list-only item is never plain `confirmed`: only ICD 0190 is confirmed, by the scheme owner's own standard. The date is the day the item was read.

| Item | Status | Source | Date checked |
|------|--------|--------|--------------|
| ICD 0106 (KVK number) | not confirmed by the ISO 6523 registry (unreadable, its certificate has expired); stated by the Peppol code list; in the model at likely (long form) | peppol-code-lists-9-7 | 2026-10-12 |
| ICD 0190 (OIN) | confirmed by the scheme owner's standard (OIN Stelsel 2.1.0, section 3.12.1; the ISO 6523 registry was not read); in the model at certain | oin-stelsel-2-1-0, peppol-code-lists-9-7 | 2026-10-12 |
| ICD 0088 (GLN) | not confirmed by the ISO 6523 registry (unreadable, its certificate has expired); stated by the Peppol code list; in the model at likely (long form) | peppol-code-lists-9-7 | 2026-10-12 |
| ICD 0060 (D-U-N-S) | not confirmed by the ISO 6523 registry (unreadable, its certificate has expired); stated by the Peppol code list; in the model at likely (long form) | peppol-code-lists-9-7 | 2026-10-12 |
| ICD 0199 (LEI) | not confirmed by the ISO 6523 registry (unreadable, its certificate has expired); stated by the Peppol code list; in the model at likely (long form) | peppol-code-lists-9-7 | 2026-10-12 |
| ICD 0208 (Belgian enterprise number) | not confirmed by the ISO 6523 registry (unreadable, its certificate has expired); stated by the Peppol code list; in the model at likely (long form) | peppol-code-lists-9-7 | 2026-10-12 |
| Peppol EAS 9944 (Dutch VAT number) | not confirmed by the ISO 6523 registry (an EAS code is not an ICD; the Peppol code list is the only source read); stated by the Peppol code list; in the model at certain as `peppol_eas` only (DEC-036) | peppol-code-lists-9-7 | 2026-10-12 |
| Peppol EAS 0106, 0190, 0088, 0060, 0199, 0208 | not confirmed by the ISO 6523 registry (an EAS code is not an ICD; the Peppol code list is the only source read); stated by the Peppol code list; in the model at certain as `peppol_eas` (DEC-036) | peppol-code-lists-9-7 | 2026-10-12 |
| Elfproef of BSN, RSIN and fi-number | not confirmed by a primary source; in the model at likely on workbook authority (DEC-046) | landscape-v1-2 | 2026-10-12 |
| LEI ISO 7064 mod 97-10 | not confirmed by ISO 17442 (paid, not read); stated by the Peppol code list and passes on the workbook example; in the model at likely | peppol-code-lists-9-7 | 2026-10-12 |
| GLN GS1 mod 10 | not confirmed by the GS1 General Specifications (section 7.9 not extracted); stated by the Peppol code list; in the model at likely | peppol-code-lists-9-7 | 2026-10-12 |
| Mod 97 of the Dutch sole-proprietor VAT number | not confirmed as an official rule (the structure is confirmed by Ondernemersplein, and the rule is computed on its example); in the model at likely (DEC-004, DEC-038, DEC-049) | ondernemersplein-nummers-voor-de-btw, vat-nl-mod97-analysis | 2026-10-12 |
| Dutch EUID format | not confirmed (Implementing Regulation (EU) 2021/1042, Annex point 9, fixes only the structure); in the model at possible on workbook authority (DEC-047) | reg-2021-1042, landscape-v1-2 | 2026-10-12 |
| OIN prefixes 00000001 and 00000003 | confirmed by OIN Stelsel 2.1.0, section 6.2; in the model as rule prefixes (forward rules likely, reverse rules certain) | oin-stelsel-2-1-0 | 2026-10-12 |
| Suffix after the B of the Dutch VAT number | not confirmed; not in the model (no rule to the VAT number, DEC-050) | — | 2026-10-12 |
| GLEIF RA entries RA000463 and RA000025 | confirmed by the GLEIF Registration Authorities List v1.9; in the model as references relations at likely | gleif-ra-list | 2026-10-12 |
| EORI structure | confirmed by the Commission and Douane pages (the Douane page conflicts with the sole-proprietor pattern, see its entry); in the model at certain for the EU and Dutch legal-person patterns and at likely for the sole-proprietor pattern (DEC-046) | commission-eori, douane-eori-nl, landscape-v1-2 | 2026-10-12 |

## End-of-phase human check

These checks need a browser or a human reading, because the build environment cannot read them automatically or the source is paid, gated or unreadable. Each one names the entry that holds its open question.

- ELI resolution on EUR-Lex: open `http://data.europa.eu/eli/reg_impl/2017/394/oj` (`csdr-its-2017-394`), `http://data.europa.eu/eli/reg_impl/2021/1042/oj` (`reg-2021-1042`) and `http://data.europa.eu/eli/dir/2017/1132/oj` (`dir-2017-1132`), and confirm that each resolves to the act named (entry "EUR-Lex ELI of Commission Implementing Regulation (EU) 2017/394 not confirmed"). Also confirm the ELIs of `ucc-952-2013` and `ucc-2026-2108` (entry "Union Customs Code succession (Regulation (EU) 2026/2108)").
- Fallback dates (DEC-042): open each page of the entry "Source dates not stated on the page (DEC-042)" and the page of `hmrc-eori-introduction` (entry "Version date of a seeded source"), look for a visible version date (for example "Bijgewerkt" or "Last update"), and correct the `date` where the page shows one.
- Titles and publisher (plan 03-05): the titles of `eori-validation`, `oin-register` and `dnb-duns-lookup`, and the publisher of `organisaties-overheid` (entry "Titles and publisher of pages read in plan 03-05").
- Belgian sources: the FOD Economie pages and Book III of the Code of Economic Law (entry "Official Belgian KBO sources not readable"), the Belgian enterprise-number check digit (entry "Belgian enterprise-number check digit (DEC-048)"), and the KBO Public Search statements behind `availability` and `applicability` of `kbo` (entry "KBO availability and applicability rest on an inference").
- GS1: GS1 General Specifications section 7.9, the check digit of the GLN (entry "GS1 check digit text").
- ISO 17442: the format and check of the LEI (entry "ISO 17442 not read").
- ISO 6523 registry: the ICD codes 0106, 0088, 0060, 0199 and 0208 and the EAS codes (entry "ICD codes stated only by the Peppol code list"). The registry certificate has expired, so the check needs a readable copy.
- TEU date: the version date 2025-03-15 of `teu-art-52` and its Article 52(1) wording in the consolidated text (entry "EUR-Lex text of the two EU sources not re-read").
- Adoption date of the Handelsregisterwet: taken from the wetten page, not from the Staatsblad PDF text (plan 03-04; `handelsregisterwet-2007`).
- LEI validation page: which GLEIF page states the check (entry "LEI validation page not readable").
- Dutch EUID register identifier: the e-Justice or BRIS documentation (entry "Dutch EUID register identifier (Implementing Regulation (EU) 2021/1042 annex)").
- Primary workbook URLs not registered (DAT-05, DEC-051): look for a citable, readable page that backs the EUID legal-basis cell O13 and the Logius issuer cell H15, or an authoritative source that replaces each (entry "DAT-05 reading: two primary workbook URLs not registered (DEC-051)").
- Official statements for the DAT-06 items without a check above (DEC-051): the elfproef and digit count of the RSIN, BSN and fi-number (entry "Elfproef of RSIN, BSN and fi-number rests on the workbook") and the mod 97 check of the sole-proprietor VAT number (entry "Mod 97 check of the Dutch sole-proprietor VAT number"). The ISO 6523, ISO 17442, GS1 and Dutch EUID checks above cover the other items; the open question of the reading is in the entry "DAT-06 reading: items in the model without a primary confirmation (DEC-051)".

## EUR-Lex text of the two EU sources not re-read

- **Item:** `teu-art-52` (ELI `http://data.europa.eu/eli/treaty/teu_2016/2025-03-15`) and `vat-directive-art-215` (ELI `http://data.europa.eu/eli/dir/2006/112/2025-04-14`) now cite EUR-Lex, with the ELIs supplied by the owner on 2026-10-12.
- **Why it is not in the model:** the EUR-Lex pages themselves cannot be read automatically from the build environment (HTTP 202 with an empty body), so the EUR-Lex reading is not in the model as confirmed. On 2026-10-12 the Publications Office Cellar was read instead. The consolidated VAT Directive (CELEX 02006L0112-20250414) has Article 215 with the sentence that Greece may use the prefix "EL" and the sentence that the prefix "XI" shall be used for Northern Ireland, so `vat-directive-art-215` is confirmed for those two claims. For the TEU the Cellar returned the 2016 text (CELEX 12016M052), which does not show the 2025-03-15 version named by the ELI. The TEU Art. 52(1) wording (the Netherlands, Belgium and Greece) was read earlier on the legislation.gov.uk mirror. The `teu-art-52` `url` is its ELI (the owner's CELEX link pointed at the 2016 text), and its date 2025-03-15 is the version date in that ELI, so that date is not confirmed.
- **Open question:** does the consolidated TEU of 2025-03-15 state the Art. 52(1) wording that `teu-art-52` cites, and is 2025-03-15 the right `date` for `teu-art-52`?
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

- **Item:** the date of these registry sources is a DEC-042 fallback, with the kind of date used: `kvk-home` (JSON-LD dateModified), `kvk-zoeken` (JSON-LD dateModified, 2026-01-20 read on 2026-10-12), `koop-roo` (DCTERMS.modified), `gs1-nl-gln` (read date), `dnb-duns` (HTTP Last-Modified), `oin-register` (HTTP Last-Modified), `vies` (read date), `organisaties-overheid` (read date), `e-justice-business-registers` (HTTP Last-Modified), `eori-validation` (read date), `peppol-test-tool` (HTTP Last-Modified), `gs1-verified` (read date), `dnb-duns-lookup` (HTTP Last-Modified), `commission-eori` (JSON-LD dateModified, 2026-06-03; the page shows no visible date), `ondernemersplein-nummers-voor-de-btw` (JSON-LD dateModified, 2026-08-04; no visible date found on the page), and `gs1-gln-allocation-rules` (month stated, day not stated: the cover reads "Aug 2022"; the date used is 2022-08-01).
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

## No rule from the fi-number to the RSIN or the OIN

- **Item:** the `rsin` and `oin` schemes relate to `fi-number` as `may-identify-same-party`, and no rule takes a fi-number as its input. No RSIN and no OIN is derived from a fi-nummer in the model.
- **Why it is not in the model:** `derived-from` means that a rule derives the subject identifier (SPEC section 5.1), so it would claim a rule that no source states in full. For the RSIN no transform is stated: the workbook says the RSIN replaced the fi-nummer (remark "predecessed by fi-number"), and no read source gives a conversion. For the OIN, OIN Stelsel 2.1.0 gives the prefix `00000002` for a fi-nummer and the suffix rule for a 9-digit number (sections 6.1 and 6.2), which would allow a rule, but no owner decision has asked for one.
- **Open question:** does the owner want an `oin-from-fi-number` rule built from those sections of the standard, and does any source state how an RSIN relates to a fi-nummer by a rule?
- **Owner or next step:** the owner decides; a rule is then added with its own citation and a `derived-from` relation can replace the `may-identify-same-party` edge.

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

- **Item:** the ICD code `0106` of `kvk-number`, held as `iso6523_icd` at likely from `peppol-code-lists-9-7`, and any other ICD code that only the Peppol Code Lists v9.7 state. The ICD code `0088` of `gln` is held the same way, at likely from the same list, as are `0060` of `duns`, `0199` of `lei` (plan 03-11) and `0208` of `kbo` (plan 03-12). The EAS code `0106` is certain from the same list, because the list is the only source for both values.
- **Why it is not in the model:** it is in the model at likely, not certain. The ISO/IEC 6523 ICD registry (iso6523.info) could not be read on 2026-10-12, because its certificate has expired, so no read source confirms the ICD value beyond the Peppol list. The Peppol list also gives a RegEx note for 0106 (17 digits) that does not match the KVK number's 8 digits; that note is not used.
- **Open question:** does the ISO/IEC 6523 ICD registry list 0106 as the code of the Netherlands Chamber of Commerce, as the Peppol list states?
- **Owner or next step:** a human check of the ISO 6523 registry once its certificate is readable (G8). If the registry differs, the `iso6523_icd` statement of `kvk-number` changes or is removed.

## Levels and roles without a source

- **Item:** the level and role statements that the model omits for lack of a source. `kvk-number` declares neither a level nor a role. `oin` and `fi-number` declare no level either. `vat` and `peppol-id` declare no level either; the workbook gives `vat` the role `taxpayer` and `peppol-id` the role `e-invoicing-participant`, both at likely (DEC-046). `lei` declares no level either: its Peppol entry speaks of the legal entity whose official name an LEI records, but no level statement is written for it in plan 03-11; its role `financial-counterparty` is the workbook's, at likely. `kbo` declares neither a level nor a role: the KBO Public Search page states neither (plan 03-12). The `euid` level `legal-entity` is modelled at likely on the workbook's scope text alone, with no primary source behind it.
- **Why it is not in the model:** no read source states the level of a KVK number or the role it plays. The KVK page says that "your business or organisation" has an 8-digit KVK number, which does not name a level. The research (G13) finds no sourced level or role for `kvk-number`, `oin`, `fi-number` or `duns`, and no sourced level for `vat`, `peppol-id` or `lei`; a statement without a source is not written (DEC-019). The `roo` level (KOOP page) and the `bsn` level (Wabb Article 1) are sourced and so are not listed. The `euid` level rests on the workbook (DEC-046) and is marked likely for that reason.
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

## IBAN component of the Peppol participant identifier

- **Item:** the workbook lists five components of the Peppol participant identifier, "either one of KvK-nr, OIN, VAT-nr, IBAN, GLN" (format row of the Overview tab), and its example uses the Peppol code 9918, which is the IBAN. The model holds four components of `peppol-id`: 0106 (`kvk-number`), 0190 (`oin`), 9944 (`vat-nl`) and 0088 (`gln`).
- **Why it is not in the model:** the model has no IBAN scheme and no source for one. The Peppol Code Lists v9.7 give the code 9918 and a RegEx for it, but the IBAN's own definition (ISO 13616) was not read. DEC-036 forbids adding a component by inference from a code, so the IBAN is not added as a component.
- **Open question:** should the model hold an IBAN scheme, with an IBAN source read, as a fifth explicit component of `peppol-id`?
- **Owner or next step:** the owner decides whether an IBAN scheme is added. If it is, the IBAN becomes a fifth explicit component with its own source (DEC-036) and this entry is removed.

## Peppol participant identifier wrapper syntax

- **Item:** the pattern `iso6523-actorid-upis::<code>:<value>` of `peppol-id`, with a four-digit code and an alphanumeric value. The wrapper rests on the workbook example of the identifier alone (research assumption A4) and on no OpenPeppol text. The pattern is held at likely.
- **Why it is not in the model:** the OpenPeppol participant identifier policy, which would state the wrapper and any restriction on the value after the code, was not read. The example in the model is the workbook's own, and no other example is written.
- **Open question:** does the OpenPeppol policy state the `iso6523-actorid-upis::` wrapper, and does it restrict the value that follows the code?
- **Owner or next step:** a human check of the OpenPeppol policy on participant identifiers. Until then the pattern stays at likely; if the policy differs, the pattern changes.

## GS1 check digit text

- **Item:** the structure and the check of the GLN in `gln`: 13 digits, the last one a check digit, with the GS1 mod 10 check and weights 1 and 3. The Peppol Code Lists v9.7 entry 0088 states "13 digits including check digits", "RegEx: [0-9]{13}" and "Check Digit: mod10 (weights 1, 3)", so the pattern and the checksum are held at likely from that list.
- **Why it is not in the model:** the GS1 General Specifications, section 7.9, where GS1 gives the check digit calculation, was not extracted (research assumption A2). The GS1 GLN Allocation Rules Standard 3.0.2 was read; it does not state the length or the check digit. The example pair in the model is synthetic: the value that passes and the value with a wrong check digit were computed for the test.
- **Open question:** do GS1 General Specifications section 7.9 and the length statement agree with the Peppol entry?
- **Owner or next step:** the end-of-phase human check (G7) reads GS1 General Specifications section 7.9. If it differs, the pattern or the checksum of `gln` changes.

## ISO 17442 not read

- **Item:** the LEI format and check digits of `lei`: the pattern `^[A-Z0-9]{18}[0-9]{2}$` and the ISO 7064 mod 97-10 check, both at likely. Their source is the Peppol Code Lists v9.7 (`peppol-code-lists-9-7`, entry 0199), which quotes the ISO 17442 format and check rule. The standard itself was not read.
- **Why it is not in the model:** ISO 17442 is a paid standard, and no free copy was read on 2026-10-12. Under DEC-049 the status of this item is "not confirmed" by the standard. It is in the model at likely because the Peppol list states it, and the workbook example `724500G3PJTYPL2L9M11` passes the check (executed), while the same value with a changed last digit fails it. The research table marked the check "confirmed" on the Peppol text alone; the status recorded here is the stricter one.
- **Open question:** does ISO 17442 state the same 18 alphanumeric characters and two digits, and the same ISO/IEC 7064 mod 97-10 check, as the Peppol list?
- **Owner or next step:** a human check of ISO 17442, or of a free GLEIF statement of the check. If it differs, the `format` and `checksum` statements of `lei` change, and the status in this entry is updated.

## LEI validation page not readable

- **Item:** the `validation_source` of `lei`. The workbook gives "GLEIF index / API" as its validation source. The page proposed for it, https://search.gleif.org/, answered HTTP 200 on 2026-10-12, but its static HTML carries only the title "LEI Search" and no statement text, so what the page checks could not be read.
- **Why it is not in the model:** a validation source needs a page whose statement can be read (DEC-019). `lei` is therefore written without a `validation_source`. The workbook is not cited as a validation source for it, because the workbook's own source (`landscape-v1-2`) does not name a page that can be checked.
- **Open question:** which GLEIF page (the search page as rendered in a browser, or the GLEIF API documentation) states that an LEI can be checked there?
- **Owner or next step:** a human opens https://search.gleif.org/ in a browser, names the page that states the check, and confirms its date. Then `lei` gets a `validation_source` (label, url, certainty certain) with a source file for that page.

## LEI columns of the workbook

- **Item:** the LEI column of the workbook. SPEC §9 says the workbook has two LEI columns that may contradict each other; the plan checked this before modelling `lei`.
- **Why it is not in the model:** nothing contradicts. The workbook has one LEI column (in the snapshot: Overview column M, Persistence column J), and both tabs rate its persistence "medium". No conflict is recorded, and `lei` takes its one column, as DEC-023 states. The check is logged so that the question is closed rather than dropped.
- **Open question:** does the two-column statement of SPEC §9 describe another version of the workbook?
- **Owner or next step:** the owner confirms that the statement is out of date (DEC-023 already corrects it), or names the other workbook version in which two LEI columns occur.

## D-U-N-S check digit stated both ways by the Peppol list

- **Item:** whether a D-U-N-S number carries a check digit. `duns` holds `checksum: none` at likely, from the Peppol Code Lists v9.7 (entry 0060). Its usage text says "Check digits were removed to get a bigger number area". The same entry's structure text still says "Eight identification digits and a check digit", and its display rule ends in a check digit C.
- **Why it is not in the model:** the usage text is the statement about the nine-digit form, so `none` is modelled at likely on it; the structure text is an older description and is not followed. The D&B page (`dnb-duns`) calls the number "a unique nine-digit identifier" and states no check rule, so it does not settle the question. A `none` entry is a claim that the values carry no check digit; the Peppol list contradicts itself on that claim, so it stays at likely (T-03-26).
- **Open question:** does a current D&B or Peppol statement say whether the nine-digit D-U-N-S number carries a check digit?
- **Owner or next step:** a human check of the D&B documentation and of the Peppol entry. If a check digit is confirmed, `duns` gets the matching checksum entry and its examples are re-checked (rule 6). If no source states that the values carry no check digit, the `none` entry is removed.

## KBO equivalent-in relation to the KVK number (DEC-048)

- **Item:** the `equivalent-in` relation from `kbo` to `kvk-number`, which DEC-020 asked for. The model holds `kbo` without it.
- **Why it is not in the model:** the owner answered on 2026-10-12 (DEC-048) that no readable official Belgian source supports the relation, because the FOD Economie pages are CAPTCHA-gated (see "Official Belgian KBO sources not readable"). The GLEIF registration authority list gives the two registers their codes (RA000463 for the Dutch register, RA000025 for the Belgian one), which shows that both are registers; it does not state that their numbers are equivalent. The workbook's validation note for the KVK number ("B: Kruispuntbank") names the Belgian register without stating an equivalence.
- **Open question:** does an official Belgian or Dutch source state that a KVK number and a Belgian enterprise number identify the same entity, or that they stand in an equivalent-in relation?
- **Owner or next step:** the owner names an official source that states the equivalence, or a readable FOD Economie page does so, and records a new DECISIONS row. Then `kbo` gets the relation at the certainty that source supports. Until then the relation stays out.

## Belgian enterprise-number check digit (DEC-048)

- **Item:** the check digit of the Belgian enterprise number. `kbo` has no checksum entry.
- **Why it is not in the model:** Peppol Code Lists v9.7, entry 0208, states "Check digit: mod97". DEC-048 (owner answer 3, 2026-10-12) records the Belgian rule as 97 minus the first eight digits mod 97. That is a different computation from `iso7064-mod97-10`, the only mod 97 member of the closed checksum vocabulary (`model/vocab/checksum.yaml`). Adding the rule needs a new kernel algorithm, a vocabulary member and a DECISIONS row, which is a Phase 2 contract change, so the owner chose to omit it and log it. The Belgian rule was not read from an official Belgian source, because the FOD Economie pages were not readable.
- **Open question:** what does an official Belgian source state as the check of the enterprise number, and is it the rule of DEC-048?
- **Owner or next step:** when an official source is read, the owner decides whether the vocabulary gains a member (a DECISIONS row and a kernel algorithm). Until then `kbo` keeps no checksum entry, so its pattern accepts a ten-digit value whose check digit is wrong.

## Official Belgian KBO sources not readable

- **Item:** the official Belgian sources for `kbo` beyond the KBO Public Search. The FOD Economie information pages on the enterprise number and the Code of Economic Law, Book III, were not read.
- **Why it is not in the model:** the FOD Economie pages returned a CAPTCHA to the researcher (research G5), and the Code of Economic Law, Book III, was not read. D-13 asks for official Belgian sources, so the `kbo` statements rest on the KBO Public Search (the register's own search page, dated by the database situation it states, 11/10/2026) and on the Peppol Code Lists v9.7, entry 0208, which carries the pattern at likely. `kbo` has no legal basis, because no text read states one.
- **Open question:** does Book III of the Code of Economic Law, or an FOD Economie information page, state the form, the check digit and the legal basis of the enterprise number, and does it confirm the pattern `^[01][0-9]{9}$`?
- **Owner or next step:** a human opens the FOD Economie pages and Book III in a browser and checks the pattern, the check digit and the legal basis. A legal basis is added with its own source, and the pattern changes if the reading differs.

## KBO trust and persistence

- **Item:** the trust sub-scores and the persistence events of `kbo`. The scheme holds neither.
- **Why it is not in the model:** the workbook has no KBO column, so no workbook statement exists for `kbo`. DEC-046 takes trust and persistence only from the workbook, and the Belgian sources read give no trust or persistence statement that could be cited. A score or an event without a source is not written (DEC-019).
- **Open question:** does an official Belgian source state how the enterprise number behaves on a merger, a split or a move, and how far it is verifiable?
- **Owner or next step:** the owner names a source for each sub-score and event, or accepts that `kbo` stays without them. A later workbook version with a KBO column would add them at likely (DEC-046).

## Persistence summary ratings and not-assessed cells (DAT-08, plan 03-14)

- **Item:** the persistence summary ratings of the workbook, and the persistence and trust cells the workbook does not assess.
- **Why it is not in the model:** each scheme of the persistence tab carries a summary rating (high, medium, low-medium, low, variable; the OIN reads "high within NL" and the GLN "Low"). The model has no schema field for such a rating, and a composite or summary score is out of scope, so no rating is stored. Cells that read `n/a` or are empty are not modelled: all six events for `bsn`, and "move to another country" for `kvk-establishment-number` and `roo`. The trust cells of `bsn` and `fi-number` are blank in the workbook, so their five sub-scores are null, never 0.
- **Open question:** does the owner want the workbook's summary ratings in the model, and if so, in which field and with which vocabulary?
- **Owner or next step:** a schema decision if the ratings are wanted (a DECISIONS row and a schema field). Until then the ratings stay out of the model, and the not-assessed cells stay unmodelled.

## Workbook references row has no scheme field (plan 03-15)

- **Item:** the workbook's Overview row 25, "references", gives one search or register page for most identifiers: "Zoeken bij KVK" for the KvK number, "OIN Register" for the OIN, "Register van Overheidsorganisaties" for the ROO, "NPa Peppol Test Tool" for the Peppol-ID, "GLEIF Registration Authorities List" for the LEI, "Verified by GS1 (NL)" for the GLN, "European e-Justice Portal" for the EUID, "EORI number validation" for the EORI and "D&B D-U-N-S Number Lookup" for the D-U-N-S number. The scheme schema has no field for this row.
- **Why it is not in the model:** a page is cited only where a statement needs it (DEC-043). The model takes these pages through `validation_source` where the validation row (Overview row 16, "where can the UID be validated") names the same page, or as the source of a statement, as the GLEIF Registration Authorities List backs the `references` relations of `lei` (DEC-043). Where row 16 names another page, the row 25 page is not a validation source and no field holds it. For the LEI, row 16 names "GLEIF index / API", whose page cannot be read (entry "LEI validation page not readable"), while row 25 names the Registration Authorities List. The planning notes called row 25 "where can the ID be searched"; that wording belongs to row 16, and row 25 is "references".
- **Open question:** should a scheme carry its reference pages in a field of their own, so that the row 25 page sits beside the validation source of row 16?
- **Owner or next step:** the owner decides on a schema field through a new DECISIONS row. Until then the reference pages are cited only where a statement needs them.

## Workbook claims checked against primary sources (DAT-06)

- **Item:** each workbook claim that the Phase 3 plans used was compared with the primary source read for it (the EU texts, the Dutch and Belgian legal texts, the standards and the register pages named in the model). Four workbook claims fail against the primary sources read, three by contradicting them and one by a target that does not back its label: the sole-proprietor VAT format in cells J10 and J11 (entry "Workbook VAT format cells and the official structure"), the hyperlinks whose target does not back their label (entry "Workbook hyperlinks whose target does not back their label"), the RSIN long name (entry "RSIN long name differs between the workbook and the KVK"), and the sole-proprietor EORI pattern that the Douane page contradicts (entry "Dutch sole-proprietor EORI and the non-Dutch NL plus fi-number form").
- **Why it is not in the model:** the model follows the primary source where the two disagree. The VAT structure follows Ondernemersplein, the RSIN name follows the KVK page, and the hyperlinks are kept only where they back their claim. The sole-proprietor EORI pattern stays in the model at likely, because the owner accepted it, and its Douane conflict is logged. No other workbook claim was found to contradict a primary source that was read. Claims that no primary source states stay at likely on workbook authority (DEC-046), and each has its own entry.
- **Open question:** does the next workbook version correct the four claims, and does it state the sole-proprietor EORI form in line with Douane?
- **Owner or next step:** the workbook authors, at the next workbook version; the owner confirms the replacements.

## EUID abbreviation and the issuing-country condition of its prerequisite (plan 03-08)

- **Item:** two points on `euid`. (a) The scheme has no `abbreviation`. A bare header `EUID` would need the default source `dir-2017-1132` to state it at certain, and the Directive's text, read through the Publications Office Cellar, does not name the EUID or "European Unique Identifier". (b) The `prerequisite` relation from `euid` to `kvk-number` carries the condition `issuing_country: NL`. The schema and the validator accept it, but the model does not say how the issuing country of an EUID value is read, because `euid` has no `context_from`.
- **Why it is not in the model:** (a) no read source states the abbreviation at certain (DEC-019), so the field is left unset. The workbook gives an abbreviation only at likely, so the long form at likely, as the BSN has it, is an option the owner decides. (b) The engine has no handling of `issuing_country` yet, so the condition is data only and no reader applies it.
- **Open question:** does an e-Justice or BRIS document state the abbreviation EUID? How does the engine read the issuing country of an EUID value, and should `euid` gain a `context_from` for it?
- **Owner or next step:** the owner decides the abbreviation form, after the e-Justice check. Phase 5 builds `recognise` and adds the issuing-country reader, or the condition is removed.

## Certainty of the OIN forward rules (plan 03-09)

- **Item:** the two forward rules of `oin`, `oin-from-kvk-number` and `oin-from-rsin`, are at likely. Their relations and both reverse rules are at certain. OIN Stelsel 2.1.0, sections 6.1 and 6.2, state the prefix and suffix that the forward rules use.
- **Why it is not in the model:** the rule file gives no reason for the lower certainty of the forward rules, although the standard states the transform in the sections named. The rules stay at likely until the owner decides, and the reverse rules keep the full prefix at certain.
- **Open question:** should the forward rules be raised to certain on sections 6.1 and 6.2, or is there a reason the forward direction is less certain, for example a case the standard leaves open?
- **Owner or next step:** the owner decides. A change raises the two certainty values, or the reason is written into the rule notes.

## BSN abbreviation and issuer in the long form, Wabb not read (plan 03-09)

- **Item:** the `bsn` scheme's abbreviation `BSN` and issuer `rvig` are written in the long form at likely, sourced to the workbook (`landscape-v1-2`).
- **Why it is not in the model:** the Wabb page (`wabb`, Article 1) returned an empty reply on 2026-10-12, so neither value could be checked against its text. A bare value needs the default source at certain (authoring rule 3), and no text read so far states the abbreviation or names RvIG as the issuer.
- **Open question:** does the Wabb text, or another RvIG or Logius page, state the abbreviation BSN and name RvIG as the issuer?
- **Owner or next step:** a human reads the Wabb page in a browser, or the read is retried. If the page states both, the two values become bare at certain, with `wabb` as the default source.

## KBO availability and applicability rest on an inference (plan 03-12)

- **Item:** the `kbo` scheme's `availability: public`, written as a bare value on the default source `kbo-public-search` at certain, and its applicability `BE issued`.
- **Why it is not in the model:** both come from the KBO Public Search page, which states that the CBE Public Search "displays the public data of all registered entities". That sentence does not literally say that enterprise numbers are public, and the page does not use the word "issued", so both values are inferred from it while the header carries them at certain. The page's "situation in the CBE database on 11/10/2026" was read as 11 October 2026 (day, month, year) and was not re-opened in plan 03-12.
- **Open question:** does the KBO Public Search page, or an official Belgian text, state that enterprise numbers are public and that the register issues them?
- **Owner or next step:** the owner, or a human reading the page, decides. If the reading is not supported, `availability` and `applicability` change or are removed.

## Titles and publisher of pages read in plan 03-05

- **Item:** the titles of three registry sources and the publisher of one. The page title of `eori-validation` is "EOS" and that of `oin-register` is "COR"; the titles used in the model, "EU EORI number validation" and "OIN register (Logius)", are the plan's examples. `dnb-duns-lookup` returned no `<title>`, so its title is taken from the workbook label. The publisher of `organisaties-overheid` is KOOP, an inference: the page is rendered by JavaScript and does not name its operator in the fetched HTML.
- **Why it is not in the model:** a title and a publisher are content that a test cannot prove, and the fetched pages give no more than their own title or a sibling page. The publisher KOOP follows the sibling ROO page, which is the register that `organisaties-overheid` belongs to.
- **Open question:** does each page state its own title, and does `organisaties-overheid` name KOOP or another operator as its publisher?
- **Owner or next step:** the end-of-phase human check opens the three pages and the `organisaties-overheid` page; the title or publisher changes where a page says otherwise.

## DAT-05 reading: two primary workbook URLs not registered (DEC-051)

- **Item:** requirement DAT-05 and ROADMAP Phase 3 success criterion 3, "every primary source URL from the Excel hyperlinks is registered in `model/sources/`". 20 of the 22 distinct primary URLs (Overview rows 13, 15, 16 and 25) are registered. The two that are not are the Digital Single Market communication PDF in cell O13 (row 13, legal basis of `euid`) and the Logius landing page in cell H15 (row 15, issuing authority of `oin`). A correction to an earlier note: the dead AFM MiFID II link is in cells D49 and H49 of glossary row 49, so it is not a primary-row exception.
- **Why it is not in the model:** neither page can back the claim of its cell (DEC-043). The PDF is a Commission policy communication, not a legal act, and the model cites Directive (EU) 2017/1132 and Implementing Regulation (EU) 2021/1042 for the EUID legal basis. The Logius page is the landing page of an issuer modelled as an authority class that carries no source (DEC-045), and the OIN issuer claim rests on `oin-stelsel-2-1-0`. The committed snapshot records both as `registered: false` with the reason. The owner agreed on 2026-10-14, for now, that DEC-043 with these two exceptions meets DAT-05 (DEC-051). See also items (b) and (c) of the entry "Workbook hyperlinks whose target does not back their label".
- **Open question:** is there a citable, readable page that backs each of the two cells, or an authoritative source that replaces each link?
- **Owner or next step:** the owner, through the first new bullet of the "End-of-phase human check". Register each URL as a source (and set its snapshot disposition to registered) when such a page exists, or cite the authoritative replacement. A new DECISIONS row then drops the DAT-05 exception of DEC-051, and this entry is removed.

## DAT-06 reading: items in the model without a primary confirmation (DEC-051)

- **Item:** requirement DAT-06 ("only verified items enter the model") and the items that one named source states but no primary source confirms, each with its source id and model certainty as the Appendix B rows give them. These are: ICD 0106, 0088, 0060, 0199 and 0208 at likely (`peppol-code-lists-9-7`); the Peppol EAS codes at certain as `peppol_eas` (DEC-036, `peppol-code-lists-9-7` only); the elfproef of RSIN, BSN and fi-number at likely (`landscape-v1-2`, DEC-046); the LEI ISO 7064 mod 97-10 and the GLN GS1 mod 10 at likely (`peppol-code-lists-9-7`); the mod 97 of the Dutch sole-proprietor VAT number at likely (`vat-nl-mod97-analysis`, DEC-049); and the Dutch EUID form `NL.KVK` at possible (`landscape-v1-2`, DEC-047). The table "Appendix B verification (DEC-049)" is the record; if it differs from this list, the table wins.
- **Why it is not in the model:** these items are in the model, but not as confirmed. The owner agreed on 2026-10-14, for now, that the DEC-049 rule (an item no source states is omitted) is the operative reading of DAT-06 (DEC-051). So an item stated by one named source enters at the certainty of its row, and the literal DAT-06 sentence, read as "confirmed by a primary source", is not met for these items. The EAS codes sit at certain, above the likely or possible of the agreed reading; the same repair settles their certainty. No model file is changed here.
- **Open question:** does each item's primary source confirm it? The primary sources are the ISO 6523 registry, ISO 17442, GS1 General Specifications section 7.9, an official statement of the elfproef for the RSIN, BSN and fi-number, a Belastingdienst or Ondernemersplein statement of the sole-proprietor mod 97, and the e-Justice or BRIS documentation for the Dutch EUID. Once all are checked, is DAT-06 amended to the DEC-049 wording, or closed?
- **Owner or next step:** work through the rows of "Appendix B verification (DEC-049)" whose status starts "not confirmed", using the matching bullets of the "End-of-phase human check" (the ISO 6523 registry, ISO 17442, GS1, the Dutch EUID register identifier, and the bullet on official statements for the DAT-06 items). Raise an item to certain when its primary source confirms it, or remove it when the source contradicts it, and update its table row and its own entry. Then amend the DAT-06 wording or close it through a new DECISIONS row that closes the DAT-06 part of DEC-051.

## Over-broad drive-letter alternative in the personal-path pattern (plan 03-01)

- **Item:** `PERSONAL_PATH_PATTERN` in `tools/import/src/manifest.ts` marks a personal storage location in committed export output (T-01-22). Its drive-letter alternative `[A-Z]:\\` runs under the `i` flag, so it matches any letter followed by a colon and a backslash, including JSON-escaped text that ends in a colon before a line break.
- **Why it is not in the model:** it is a tooling follow-up, not model knowledge, and no model statement depends on it. Plan 03-01 met the false positive on the serialized snapshot and worked around it (owner-approved option A: the snapshot test applies the pattern to the decoded string values). The pattern itself was left unchanged, and this entry does not change it either. The Phase 3 verification lists it as a follow-up.
- **Open question:** how should the drive-letter alternative be narrowed (for example an uppercase-only letter class, or a drive letter at the start of a path) so that the other markers keep their case-insensitive match?
- **Owner or next step:** a separate tooling change narrows the pattern, adds a test case for the escaped line break, and removes this entry.
