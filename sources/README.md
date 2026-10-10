# Sources

Source material the UIO knowledge model is built from, with its provenance.

## Licence

Everything in `sources/` is licensed under CC-BY-4.0 (`LICENSE-model` in the repository root; see `DECISIONS.md` DEC-013).
Code elsewhere in the repository is EUPL-1.2 (`LICENSE`).

## Provenance

| File | Original name | Version | Date | SHA-256 (original) | SHA-256 (repository copy) | Licence | Status |
|------|---------------|---------|------|--------------------|---------------------------|---------|--------|
| landscape-v1.2-overview-uids.csv, landscape-v1.2-persistence.csv, landscape-v1.2-links.csv | UID-table - v1.2.xlsx | 1.2 | 2026-07-03 | 9c929660b53d329dfa4f6a23f83cee0770a1819e5b9ef3a12c20d865c6afed03 | see landscape-v1.2.sha256 | CC-BY-4.0 (confirmed 2026-10-10, DEC-024) | committed |
| uio-ontology-v0.9.ttl | UIO ontology v0.9.ttl | 0.9 | — | 919e99f270e8ad000e866c4693569019aeb0358d7f6143a5bc4e8d83962c2af7 | 6998c44f229a896b2f05507bbfe4f224c51450134155b60c39c31b7b4cf81c49 | CC-BY-4.0 (LICENSE-model, DEC-013) | committed; line endings normalised to LF (DEC-018) |

The original SHA-256 of the ontology is that of the file with CRLF line endings. The repository copy differs only in
line endings (CRLF converted to LF), so the two hashes are expected to differ.

## Landscape export

The landscape table is exported from the workbook `UID-table - v1.2.xlsx` to three CSV files plus a SHA-256 manifest:

- `landscape-v1.2-overview-uids.csv` (tab `Overview UIDs`)
- `landscape-v1.2-persistence.csv` (tab `Persistence`)
- `landscape-v1.2-links.csv` (header `tab,cell,text,url`, one row per cell hyperlink)
- `landscape-v1.2.sha256` (coreutils format, sorted)

What the export contains and what it leaves out:

- The CSVs hold cell values only. Document properties, author fields and storage paths of the workbook never reach the repository.
- Every tab is anchored at cell A1, so CSV column N is spreadsheet column N. The Persistence tab starts in column B, so its first CSV column is empty.
- The visible attribution cells in the Overview tab (authors, organisation) stay unchanged (DEC-016).
- Cell values are verbatim: leading zeros are kept, line breaks inside cells become LF, nothing is trimmed.
- Hyperlink targets are listed in the links CSV with tracking parameters (`utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `dclid`, `_gl`, `_ga`, `mc_cid`, `mc_eid`) and `#:~:` text fragments removed; other fragments such as `#/vat-validation` are kept.
- The export fails loudly on unsupported cell types (boolean, error, date), on numbers displayed in exponent or `#` form, and on a missing tab.

To regenerate (from the repository root):

```sh
npm run export:landscape -- --xlsx <path to UID-table - v1.2.xlsx> --out sources
```

To verify:

```sh
cd sources && sha256sum -c landscape-v1.2.sha256
```

The original xlsx is never committed: it stays local and gitignored (DEC-014).

## Attribution

Credit line for the UID table v1.2 content, as agreed in DEC-016:

> UID table v1.2 — Davinci Conclusion, as produced for the CoE-DSC. Licensed under CC BY 4.0.

Davinci Conclusion's written CC-BY-4.0 confirmation was given on 2026-10-10 and is recorded in DEC-024 (closing the gate in DEC-015).

## Ontology

`uio-ontology-v0.9.ttl` is an earlier draft ontology by the same authors, with namespace `http://example.org/id-ontology#`.
It is input for the `uio:def#` ontology (DEC-017): its concepts are reused in the new namespace, but it is not a compatibility target.
