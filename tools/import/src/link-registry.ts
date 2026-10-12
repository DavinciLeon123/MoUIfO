// Registry decision for every distinct cleaned URL of the workbook hyperlinks (DAT-05, D-02, DEC-043).
// A URL with a `source` becomes that model source (one source per URL); a URL with a `reason` is
// recorded in the snapshot as unregistered, with the reason. The snapshot builder refuses a link
// without a disposition and a disposition without a link (see buildSnapshot).

/** Either the id of the model source a URL becomes, or the reason it is not registered. */
export type LinkDisposition = { readonly source: string } | { readonly reason: string };

/** The 26 distinct cleaned URLs of the 40 workbook hyperlinks, keyed by URL. */
export const LINK_DISPOSITIONS: Readonly<Record<string, LinkDisposition>> = {
  // Row 13, legal basis: Handelsregisterwet 2007 (Staatsblad 2007, 153).
  'https://zoek.officielebekendmakingen.nl/stb-2007-153.pdf': { source: 'handelsregisterwet-2007' },
  // Row 13, legal basis (RSIN and fi-number cells are labelled "Tax legislation"); cited for the KvK number only.
  'https://wetten.overheid.nl/BWBR0024067/2021-04-30/': { source: 'handelsregisterbesluit-2008' },
  'https://wetten.overheid.nl/BWBR0002629/2026-01-01': { source: 'wet-op-de-omzetbelasting-1968' },
  'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0394': {
    source: 'csdr-its-2017-394',
  },
  'https://ec.europa.eu/commission/presscorner/api/files/attachment/8210/DSM_communication.pdf': {
    reason:
      'Commission policy communication, not a legal act, so it cannot back the EUID legal basis (DEC-043). The EUID legal basis is Directive (EU) 2017/1132 and Implementing Regulation (EU) 2021/1042, which are not workbook links.',
  },
  'https://eur-lex.europa.eu/eli/reg/2013/952/oj/eng': { source: 'ucc-952-2013' },
  'https://wetten.overheid.nl/BWBR0022428/2025-11-11': { source: 'wabb' },
  // Row 15, issuing authority.
  'https://www.kvk.nl/': { source: 'kvk-home' },
  'https://www.logius.nl/': {
    reason:
      'Landing page of Logius, an issuer modelled as an authority class that carries no source (DEC-045). The OIN issuer claim is backed by the OIN Stelsel 2.1.0 standard, not by this page.',
  },
  'https://www.koopoverheid.nl/diensten/register-van-overheidsorganisaties': {
    source: 'koop-roo',
  },
  'https://www.gs1.nl/producten-services/digital-identity/gln/': { source: 'gs1-nl-gln' },
  'https://www.dnb.com/en-us/smb/duns.html': { source: 'dnb-duns' },
  // Row 16, validation source.
  'https://oinregister.logius.nl/oin-register': { source: 'oin-register' },
  'https://ec.europa.eu/taxation_customs/vies/#/vat-validation': { source: 'vies' },
  'https://organisaties.overheid.nl/': { source: 'organisaties-overheid' },
  'https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en':
    { source: 'e-justice-business-registers' },
  'https://ec.europa.eu/taxation_customs/dds2/eos/eori_validation.jsp?Lang=en': {
    source: 'eori-validation',
  },
  // Row 25, references.
  'https://www.kvk.nl/zoeken/': { source: 'kvk-zoeken' },
  'https://test.peppolautoriteit.nl/discover': { source: 'peppol-test-tool' },
  'https://www.gleif.org/en/lei-data/code-lists/gleif-registration-authorities-list': {
    source: 'gleif-ra-list',
  },
  'https://www.gs1.nl/producten-services/codes-verifieren/verified-by-gs1/': {
    source: 'gs1-verified',
  },
  'https://www.dnb.com/duns-number/lookup.html': { source: 'dnb-duns-lookup' },
  // Glossary cells (rows 48, 49, 52, 54): not primary hyperlinks, recorded the same way (DEC-043).
  'https://www.dnb.nl/voor-de-sector/open-boek-toezicht/wet-regelgeving/emir/': {
    reason:
      'Glossary link, not a primary hyperlink (DEC-043). The page refused automated clients (HTTP 403 on 2026-10-12).',
  },
  'https://www.afm.nl/nl-nl/sector/banken-en-verzekeraars/toezicht/mifid-ii': {
    reason:
      'Glossary link, not a primary hyperlink (DEC-043). The link is dead: it redirects to the AFM "Pagina niet gevonden" page (checked 2026-10-12).',
  },
  'https://www.gleif.org/en/about/gleif-management-of-the-global-lei-system': {
    reason: 'Glossary link, not a primary hyperlink (DEC-043).',
  },
  'https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/blog/2017/09/19/533365899/Business+Register+Interconnection+System+BRIS':
    {
      reason: 'Glossary link, not a primary hyperlink (DEC-043).',
    },
};
