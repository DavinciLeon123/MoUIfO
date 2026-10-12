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
- **Why it is not in the model:** the model has one jurisdiction per state, and the jurisdiction file cannot express an area narrower than its label. The caveat lives in the `notes` of `GB` and `XI`; no rule can use it yet.
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

- **Item:** the `date` of these registry sources is a DEC-042 fallback, with the kind of date used: kvk-home (JSON-LD `dateModified`), kvk-zoeken (JSON-LD `dateModified`, 2026-01-20 read on 2026-10-12), koop-roo (`DCTERMS.modified`), gs1-nl-gln (read date), dnb-duns (HTTP `Last-Modified`), oin-register (HTTP `Last-Modified`), vies (read date), organisaties-overheid (read date), e-justice-business-registers (HTTP `Last-Modified`), eori-validation (read date), peppol-test-tool (HTTP `Last-Modified`), gs1-verified (read date), dnb-duns-lookup (HTTP `Last-Modified`).
- **Why it is not in the model:** the source schema dates a register-doc by the page's last-updated date, and the schema needs a date for every source. DEC-042 takes the machine-readable modification date, then the date the page was read, when the page states no date. Whether each page also shows a visible version date was not checked for every page.
- **Open question:** does each page show a version date a person can read (for example "Bijgewerkt" or "Last update")? If it does, that date replaces the fallback.
- **Owner or next step:** the end-of-phase human check opens each page and confirms or corrects its `date`; the affected files are adjusted if it differs. Later plans append the ids of their own fallback-dated sources to this entry.

## EUR-Lex ELI of Commission Implementing Regulation (EU) 2017/394 not confirmed

- **Item:** `csdr-its-2017-394` carries the ELI `http://data.europa.eu/eli/reg_impl/2017/394/oj`, and `ucc-952-2013` carries `http://data.europa.eu/eli/reg/2013/952/oj`, the ELI of its workbook link.
- **Why it is not in the model:** the EUR-Lex text read on 2026-10-12 through the Publications Office Cellar (CELEX 32017R0394) names no ELI, and the ELI resolver returned HTTP 202 with an empty body for both strings, so neither could be confirmed. The `reg_impl` form follows the standard EU ELI pattern for implementing regulations, and the `reg/2013/952/oj` form is the ELI behind the workbook's own EUR-Lex link. A wrong ELI fails only a human check, because the validator accepts any http or https URL.
- **Open question:** does `http://data.europa.eu/eli/reg_impl/2017/394/oj` resolve to CELEX 32017R0394, and does `http://data.europa.eu/eli/reg/2013/952/oj` resolve to CELEX 32013R0952?
- **Owner or next step:** the end-of-phase human check opens both ELIs in a browser and changes the file if either one resolves to another act.
