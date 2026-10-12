// Column, row and field maps of the three committed landscape CSVs (DEC-014, D-11, DEC-033).
// Plain data only: this module imports nothing, so no snapshot code can reach the xlsx package.

/**
 * Name of the committed snapshot. It must not start with `landscape-v1.2`: verifyManifest (manifest.ts)
 * treats every such file as part of the export and rejects it when it is not listed in the manifest.
 */
export const SNAPSHOT_FILE = 'landscape-snapshot-v1.2.json';

export const OVERVIEW_TAB = 'Overview UIDs';
export const PERSISTENCE_TAB = 'Persistence';

export const CSV_FILES = {
  overview: 'landscape-v1.2-overview-uids.csv',
  persistence: 'landscape-v1.2-persistence.csv',
  links: 'landscape-v1.2-links.csv',
} as const;

/** Overview scheme columns F to S. Column J is the one workbook column behind both vat and vat-nl (DEC-033). */
export const OVERVIEW_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  F: ['kvk-number'],
  G: ['kvk-establishment-number'],
  H: ['oin'],
  I: ['rsin'],
  J: ['vat', 'vat-nl'],
  K: ['roo'],
  L: ['peppol-id'],
  M: ['lei'],
  N: ['gln'],
  O: ['euid'],
  P: ['eori'],
  Q: ['duns'],
  R: ['bsn'],
  S: ['fi-number'],
};

export const OVERVIEW_NAME_ROW = 7;

/** The workbook name each Overview scheme column must carry in row 7; a shifted export fails on the first mismatch. */
export const OVERVIEW_NAMES: Readonly<Record<string, string>> = {
  F: 'KvK number',
  G: 'vestigingsnummer',
  H: 'OIN',
  I: 'RSIN',
  J: 'VAT-nr',
  K: 'ROO',
  L: 'Peppol-ID',
  M: 'LEI',
  N: 'GLN',
  O: 'EUID',
  P: 'EORI',
  Q: 'D-U-N-S',
  R: 'BSN',
  S: 'fi-nummer',
};

/** Persistence scheme columns C to P (row 2 names them). Column G feeds both vat and vat-nl (DEC-033). */
export const PERSISTENCE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  C: ['kvk-number'],
  D: ['kvk-establishment-number'],
  E: ['oin'],
  F: ['rsin'],
  G: ['vat', 'vat-nl'],
  H: ['roo'],
  I: ['peppol-id'],
  J: ['lei'],
  K: ['gln'],
  L: ['euid'],
  M: ['eori'],
  N: ['duns'],
  O: ['bsn'],
  P: ['fi-number'],
};

export const PERSISTENCE_NAME_ROW = 2;

export const PERSISTENCE_NAMES: Readonly<Record<string, string>> = {
  C: 'CoC number',
  D: 'vestigingsnummer',
  E: 'OIN',
  F: 'RSIN',
  G: 'VAT-nr',
  H: 'ROO',
  I: 'Peppol-ID',
  J: 'LEI',
  K: 'GLN',
  L: 'EUID',
  M: 'EORI',
  N: 'D-U-N-S',
  O: 'BSN',
  P: 'fi-nummer',
};

/** Overview rows 7 to 27, row number to snapshot key. */
export const FIELD_ROWS: Readonly<Record<number, string>> = {
  7: 'name',
  8: 'name_in_full',
  9: 'structure',
  10: 'format',
  11: 'specification',
  12: 'jurisdiction',
  13: 'legal_basis',
  14: 'legal_basis_continued',
  15: 'issuing_authority',
  16: 'validation_source',
  17: 'trust_anchor',
  18: 'validity',
  19: 'persistence',
  20: 'assurance',
  21: 'mandatoriness',
  22: 'prerequisites',
  23: 'availability',
  24: 'related_to',
  25: 'references',
  26: 'scope',
  27: 'remarks',
};

/** Trust sub-scores in Overview rows 30 to 34, with their maximum. Row 36 (the total) is not stored. */
export const TRUST_ROWS: Readonly<Record<number, { key: string; max: number }>> = {
  30: { key: 'legal_basis', max: 2 },
  31: { key: 'registration_quality', max: 1 },
  32: { key: 'verifiability', max: 1 },
  33: { key: 'crosswalks', max: 1 },
  34: { key: 'lifecycle', max: 1 },
};

/** Persistence tab rows, row number to key (the keys are the persistence-event ids of model/vocab plus summary). */
export const PERSISTENCE_ROWS: Readonly<Record<number, string>> = {
  4: 'merger',
  5: 'acquisition-without-merger',
  6: 'split',
  7: 'dissolution',
  8: 'move-within-country',
  9: 'move-to-other-country',
  11: 'summary',
};

/** Persistence tab note rows; a note sits under the scheme column it belongs to (GLN, column K). */
export const PERSISTENCE_NOTE_ROWS: readonly number[] = [13, 14, 15, 16];

/** Overview example rows; the example label is in column D. */
export const EXAMPLE_ROWS: readonly number[] = [39, 40, 41];

/** Overview rows whose hyperlinks belong to a scheme column, and the rows of the glossary links (columns D and H). */
export const PRIMARY_LINK_ROWS: readonly number[] = [13, 15, 16, 25];
export const GLOSSARY_LINK_ROWS: readonly number[] = [48, 49, 52, 54];

/** Link row to the field the link documents. */
export const LINK_FIELDS: Readonly<Record<number, string>> = {
  13: 'legal_basis',
  15: 'issuing_authority',
  16: 'validation_source',
  25: 'references',
  48: 'glossary',
  49: 'glossary',
  52: 'glossary',
  54: 'glossary',
};
