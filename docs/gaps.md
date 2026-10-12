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
