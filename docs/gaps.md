# Gaps

This file lists knowledge that is not in the model, or is in it with a caveat, and the open question behind each item (DEC-019, strict sourcing). A statement without a source or with an unverified claim is left out of `model/` and logged here instead of being invented. Each entry has four parts: the item, why it is not in the model, the open question, and who or what resolves it. The entries below come from the Phase 2 seed (plans 02-08 and 02-09).

Every seeded membership, prefix and source was read on its live page while the seed was written. No membership or prefix claim was omitted in plans 02-08 and 02-09, so the list below holds only identifier and label gaps and the interpretations that a human check should look at.

## ELI of teu-art-52

- **Item:** the ELI (European Legislation Identifier) of the Treaty on European Union, Article 52, source `teu-art-52`.
- **Why it is not in the model:** EUR-Lex, where the ELI is published, cannot be read automatically from the build environment, and an ELI that was not read on its page would be invented. The source carries only the legislation.gov.uk `url` it was read on.
- **Open question:** what is the ELI of the consolidated Treaty on European Union, and does the source schema want it as `eli` next to the `url`?
- **Owner or next step:** a maintainer confirms the ELI by hand on EUR-Lex and adds `eli` to `model/sources/teu-art-52.yaml`.

## ELI of vat-directive-art-215

- **Item:** the ELI of Council Directive 2006/112/EC, as amended by Directive (EU) 2020/1756, source `vat-directive-art-215`.
- **Why it is not in the model:** the same reason as above; the source carries only its legislation.gov.uk `url`.
- **Open question:** what is the ELI of Directive 2006/112/EC, and should the source point at the consolidated text or at the amending directive?
- **Owner or next step:** a maintainer confirms the ELI by hand on EUR-Lex and adds `eli` to `model/sources/vat-directive-art-215.yaml`.

## GB means the United Kingdom, but the GB EORI prefix covers Great Britain only

- **Item:** the jurisdiction `GB` is labelled "United Kingdom" (the state), while the GB prefix of an EORI number applies to customs activities in England, Scotland and Wales only, and the XI prefix covers Northern Ireland (`hmrc-eori-introduction`). XI is `part_of` GB (`nia-1998-s1`).
- **Why it is not in the model:** the model has one jurisdiction per state, and the jurisdiction file cannot express an area narrower than its label. The caveat lives in the `notes` of `GB` and `XI`; no rule can use it yet.
- **Open question:** should a later phase add a separate jurisdiction for Great Britain, or keep GB as the state and let the EORI scheme state its own area? DEC-041 already caps an answer inherited from GB to XI below certain.
- **Owner or next step:** decide in Phase 3 (EORI scheme data) and Phase 5 (inheritance), with the owner.

## Version dates of two seeded sources

- **Item:** the `date` of `vat-directive-art-215` (2020-11-26) and of `hmrc-eori-introduction` (2025-01-24).
- **Why it is not in the model:** the pages do not state one plain version date, so the values are read from page metadata. The legislation.gov.uk timeline marks 26/11/2020 as the first point of the version that holds the XI sentence; the GOV.UK page metadata gives 2025-01-24 as the public update date of this section. The parent EORI manual was last changed on 10 September 2025, which is a different page.
- **Open question:** is the first date of the current version the right `date` for a legislation.gov.uk text without a stated version date, and is the section date the right one for a GOV.UK manual section?
- **Owner or next step:** the end-of-phase human check opens both pages and confirms the two dates; adjust the files and the source-date convention if they differ.
