import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkValue, compileTransform, type FormatSpec } from '@uio/engine';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

// The RSIN and EORI start data (DAT-01, plan 03-06): the model files are read as data and the
// formats and transforms run through the engine's own code (DEC-037), so the test states what the
// engine concludes, not what the YAML looks like.

type Json = Record<string, unknown>;
type Named = Json & { id: string };

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const load = (path: string): Json => parse(read(path), { schema: 'core' }) as Json;
const scheme = (id: string): Json => load(`model/schemes/${id}.yaml`);
const listOf = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

function loadAll(dir: string): Named[] {
  return readdirSync(join(REPO_ROOT, 'model', dir))
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => load(`model/${dir}/${name}`) as Named);
}

/** The id of a scheme issuer, bare or in the long form `{ value, source, certainty }`. */
function issuerOf(s: Json): string {
  const issuer = s.issuer;
  return typeof issuer === 'string' ? issuer : String((issuer as Json).value);
}

function formatOf(s: Json): FormatSpec {
  return (s.format ?? {}) as FormatSpec;
}

function ruleOf(s: Json, id: string): Json {
  const found = listOf(s.rules).find((rule) => rule.id === id);
  if (found === undefined) throw new Error(`rule ${id} is missing`);
  return found;
}

/** Runs compiled transform steps on a value; a step list that does not compile fails the test. */
function run(steps: unknown, value: string): string | null {
  const compiled = compileTransform(steps as unknown[]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
  return compiled.run(value);
}

/** The country-prefix vocabulary's jurisdictions (DEC-035). */
function prefixJurisdictions(): Set<string> {
  const values = listOf(load('model/vocab/country-prefix.yaml').values);
  return new Set(values.map((entry) => String(entry.jurisdiction)));
}

describe('rsin (DAT-01, SPEC §10)', () => {
  test('accepts the SPEC §10 example with a passing elfproef and rejects a wrong check digit', () => {
    const accepted = checkValue(formatOf(scheme('rsin')), '001469630');
    expect(accepted.accepted).toBe(true);
    expect(accepted.checksums).toEqual(['pass']);
    expect(checkValue(formatOf(scheme('rsin')), '001469631').accepted).toBe(false);
  });

  test('the reverse rule strips NL from a Dutch legal-person EORI, certain, sourced to Douane', () => {
    const rule = ruleOf(scheme('rsin'), 'rsin-from-eori-nl');
    expect(rule.input).toBe('eori');
    expect(rule.output).toBe('rsin');
    expect(rule.condition).toEqual({ entity_form: 'legal-person' });
    expect(rule.certainty).toBe('certain');
    expect(rule.source).toBe('douane-eori-nl');
    expect(run(rule.transform, 'NL001469630')).toBe('001469630');
  });

  test('the level legal-entity is likely and sourced to the KvK RSIN page', () => {
    const level = listOf(scheme('rsin').level);
    expect(level).toEqual([
      expect.objectContaining({ value: 'legal-entity', certainty: 'likely', source: 'kvk-rsin' }),
    ]);
  });
});

describe('eori (DAT-01, SPEC §10)', () => {
  test('the rule eori-nl-from-rsin adds NL to a legal-person RSIN and yields the Dutch EORI', () => {
    const rule = ruleOf(scheme('eori'), 'eori-nl-from-rsin');
    expect(rule.input).toBe('rsin');
    expect(rule.output).toBe('eori');
    expect(rule.condition).toEqual({ entity_form: 'legal-person' });
    expect(rule.certainty).toBe('certain');
    expect(rule.source).toBe('douane-eori-nl');
    expect(run(rule.transform, '001469630')).toBe('NL001469630');
  });

  test('three patterns: EU certain, Dutch legal person certain, Dutch sole proprietor likely; no checksum', () => {
    const patterns = listOf((scheme('eori').format as Json).patterns);
    expect(patterns.map((pattern) => pattern.certainty)).toEqual(['certain', 'certain', 'likely']);
    expect(patterns[2]?.condition).toEqual({
      issuing_country: 'NL',
      entity_form: 'sole-proprietorship',
    });
    expect(patterns[2]?.source).toBe('landscape-v1-2');
    expect((scheme('eori').format as Json).checksum).toBeUndefined();
  });

  test('the EU pattern accepts the SPEC §10 example and the Dutch legal-person form accepts the RSIN form', () => {
    expect(checkValue(formatOf(scheme('eori')), 'NL001469630').accepted).toBe(true);
    expect(checkValue(formatOf(scheme('eori')), 'DE123456789012345').accepted).toBe(true);
    expect(checkValue(formatOf(scheme('eori')), '001469630').accepted).toBe(false);
  });

  test('the issuing country is read from the value prefix through the country-prefix vocabulary', () => {
    const context = (scheme('eori').context_from as Json).issuing_country as Json;
    expect(context.map).toBe('country-prefix');
    expect(context.source).toBe('commission-eori');
    expect(prefixJurisdictions().has('NL')).toBe(true);
  });

  test('legal basis cites UCC 952/2013 Article 9 and Regulation 2026/2108 Article 26', () => {
    const basis = listOf(scheme('eori').legal_basis);
    expect(basis).toEqual([
      expect.objectContaining({
        source: 'ucc-952-2013',
        title: expect.stringContaining('Article 9'),
      }),
      expect.objectContaining({
        source: 'ucc-2026-2108',
        title: expect.stringContaining('Article 26'),
      }),
    ]);
  });

  test('applicability states EU, XI and GB separately (DEC-041); XI and GB are not inherited', () => {
    const applicability = listOf(scheme('eori').applicability);
    const jurisdictions = applicability.map((entry) => entry.jurisdiction);
    expect(jurisdictions).toEqual(expect.arrayContaining(['EU', 'XI', 'GB']));
    const xi = applicability.find((entry) => entry.jurisdiction === 'XI');
    const gb = applicability.find((entry) => entry.jurisdiction === 'GB');
    expect(xi?.source).toBe('hmrc-eori-introduction');
    expect(gb?.source).toBe('hmrc-eori-introduction');
    expect(xi?.status).toEqual(expect.arrayContaining(['issued']));
    expect(gb?.status).toEqual(expect.arrayContaining(['issued']));
  });

  test('no scheme declares an EORI level and only eori-nl-from-rsin outputs an EORI (DEC-050, D-08, DEC-003)', () => {
    const schemes = loadAll('schemes');
    const levels = schemes.flatMap((s) => listOf(s.level).map((level) => level.value));
    expect(levels).not.toContain('legal-entity-top-level');
    expect(levels).not.toContain('declaring-entity');
    const outputsEori = schemes.flatMap((s) =>
      listOf(s.rules)
        .filter((rule) => rule.output === 'eori')
        .map((rule) => String(rule.id)),
    );
    expect(outputsEori).toEqual(['eori-nl-from-rsin']);
  });
});

describe('authorities (DEC-045, D-10)', () => {
  test('douane-nl is the Dutch instance of national-customs-authority, sourced at certain', () => {
    const douane = load('model/authorities/douane-nl.yaml');
    expect(douane.kind).toBe('instance');
    expect(douane.instance_of).toBe('national-customs-authority');
    expect(douane.jurisdiction).toBe('NL');
    expect(douane.source).toBe('douane-eori-nl');
    expect(douane.certainty).toBe('certain');
  });

  test('every authority file is referenced as DEC-045 defines; a failure names the id', () => {
    const authorities = loadAll('authorities');
    const schemes = loadAll('schemes');
    const issuers = new Set(schemes.map(issuerOf));
    const contextIssuers = new Set(
      schemes.filter((s) => s.context_from !== undefined).map(issuerOf),
    );
    const prefixes = prefixJurisdictions();

    for (const authority of authorities) {
      // (a) the issuer of a scheme, bare or long form
      const asIssuer = issuers.has(authority.id);
      // (b) the class named by instance_of of an authority that is an issuer
      const asClassOfIssuer = authorities.some(
        (other) => issuers.has(other.id) && other.instance_of === authority.id,
      );
      // (c) an instance of a context-reading issuer class in a country-prefix jurisdiction
      const asContextInstance =
        authority.kind === 'instance' &&
        contextIssuers.has(String(authority.instance_of)) &&
        prefixes.has(String(authority.jurisdiction));
      expect(
        asIssuer || asClassOfIssuer || asContextInstance,
        `unreferenced authority: ${authority.id}`,
      ).toBe(true);
    }
  });
});

describe('sources and gap entries (DAT-01, DEC-019, DEC-042)', () => {
  test('ucc-2026-2108 is the adopted regulation with its ELI and adoption date', () => {
    const source = load('model/sources/ucc-2026-2108.yaml');
    expect(source.type).toBe('law');
    expect(source.eli).toBe('http://data.europa.eu/eli/reg/2026/2108/oj');
    expect(source.date).toBe('2026-09-16');
  });

  test.each([
    '## EORI level claims of SPEC §10 (DEC-050)',
    '## Dutch sole-proprietor EORI and the non-Dutch NL plus fi-number form',
    '## Elfproef of RSIN, BSN and fi-number rests on the workbook',
    '## RSIN long name differs between the workbook and the KVK',
    '## Union Customs Code succession (Regulation (EU) 2026/2108)',
    '## Mod 97 check of the Dutch sole-proprietor VAT number',
    '## Suffix after the B of the Dutch VAT number, and no RSIN-to-VAT rule (DEC-050)',
    '## Workbook VAT format cells and the official structure',
    '## Dutch EUID register identifier (Implementing Regulation (EU) 2021/1042 annex)',
    '## ICD codes stated only by the Peppol code list',
    '## Levels and roles without a source',
    '## One validation source per scheme',
    '## EUID participating countries (BRIS)',
  ])('the entry "%s" exists in the four-part form', (heading) => {
    const gaps = read('docs/gaps.md');
    const start = gaps.indexOf(heading);
    expect(start, heading).toBeGreaterThanOrEqual(0);
    const section = gaps.slice(start).split('\n## ')[0] ?? '';
    let at = 0;
    for (const part of [
      '- **Item:**',
      '- **Why it is not in the model:**',
      '- **Open question:**',
      '- **Owner or next step:**',
    ]) {
      const found = section.indexOf(part, at);
      expect(found, `${heading}: ${part}`).toBeGreaterThanOrEqual(0);
      at = found + part.length;
    }
  });

  test('the GB entry names the EORI scheme as the statement of GB and XI applicability', () => {
    const gaps = read('docs/gaps.md');
    const start = gaps.indexOf('## GB means the United Kingdom');
    const section = gaps.slice(start).split('\n## ')[0] ?? '';
    expect(section).toContain('eori');
    expect(section).toContain('XI');
  });
});

describe('vat-nl and the VAT to EORI chain (DAT-01, DEC-003, DEC-004, DEC-050)', () => {
  test('VAT to EORI is the two-step chain: rsin-from-vat-nl, then eori-nl-from-rsin, gives the Dutch EORI', () => {
    const toRsin = ruleOf(scheme('rsin'), 'rsin-from-vat-nl');
    expect(toRsin.input).toBe('vat-nl');
    expect(toRsin.output).toBe('rsin');
    expect(toRsin.condition).toEqual({ entity_form: 'legal-person' });
    expect(toRsin.certainty).toBe('certain');
    expect(toRsin.source).toBe('ondernemersplein-btw-vermelden');
    const rsin = run(toRsin.transform, 'NL001469630B01');
    expect(rsin).toBe('001469630');
    const toEori = ruleOf(scheme('eori'), 'eori-nl-from-rsin');
    expect(run(toEori.transform, String(rsin))).toBe('NL001469630');
  });

  test('vat-nl accepts NL001469630B01 and rejects a missing digit (no pattern) and a wrong check digit (elfproef)', () => {
    const format = formatOf(scheme('vat-nl'));
    expect(checkValue(format, 'NL001469630B01').accepted).toBe(true);
    expect(checkValue(format, 'NL001469630B1').accepted).toBe(false);
    expect(checkValue(format, 'NL000099998B58').accepted).toBe(false);
  });

  test('the elfproef entry and the contains rsin relation carry entity_form legal-person', () => {
    const vat = scheme('vat-nl');
    const elfproef = listOf((vat.format as Json).checksum).find(
      (entry) => entry.algorithm === 'elfproef',
    );
    expect(elfproef?.condition).toEqual({ entity_form: 'legal-person' });
    expect(listOf(vat.relations)).toEqual([
      expect.objectContaining({
        kind: 'contains',
        target: 'rsin',
        condition: { entity_form: 'legal-person' },
        certainty: 'certain',
      }),
    ]);
  });

  test('no rule has output vat-nl, and none has input vat-nl with output eori (DEC-050, DEC-003)', () => {
    const rules = loadAll('schemes').flatMap((s) => listOf(s.rules));
    expect(rules.filter((rule) => rule.output === 'vat-nl')).toEqual([]);
    expect(rules.filter((rule) => rule.input === 'vat-nl' && rule.output === 'eori')).toEqual([]);
  });

  test('belastingdienst is the NL instance of national-tax-authority, sourced at certain', () => {
    const tax = load('model/authorities/belastingdienst.yaml');
    expect(tax.kind).toBe('instance');
    expect(tax.instance_of).toBe('national-tax-authority');
    expect(tax.jurisdiction).toBe('NL');
    expect(tax.source).toBe('ondernemersplein-nummers-voor-de-btw');
    expect(tax.certainty).toBe('certain');
  });
});

describe('vat-nl sole-proprietor mod 97 entry, Peppol code and statements (DAT-01, DEC-004, DEC-036, DEC-049)', () => {
  test('accepts the legal-person value by elfproef and the official example by mod 97; rejects a wrong check digit', () => {
    const format = formatOf(scheme('vat-nl'));
    expect(checkValue(format, 'NL001469630B01')).toEqual({
      patterns: [true],
      checksums: ['pass', 'fail'],
      accepted: true,
    });
    expect(checkValue(format, 'NL000099998B57')).toEqual({
      patterns: [true],
      checksums: ['fail', 'pass'],
      accepted: true,
    });
    expect(checkValue(format, 'NL000099998B58').accepted).toBe(false);
    expect(checkValue(format, 'NL001469630B1').accepted).toBe(false);
  });

  test('checksums are elfproef for legal persons, then mod 97-10 for sole proprietorships, both likely', () => {
    const checksum = listOf((scheme('vat-nl').format as Json).checksum);
    expect(checksum.map((entry) => entry.algorithm)).toEqual(['elfproef', 'iso7064-mod97-10']);
    expect(checksum[0]).toEqual(
      expect.objectContaining({
        condition: { entity_form: 'legal-person' },
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
    );
    expect(checksum[1]).toEqual(
      expect.objectContaining({
        over: ['uppercase'],
        condition: { entity_form: 'sole-proprietorship' },
        certainty: 'likely',
        source: 'vat-nl-mod97-analysis',
      }),
    );
  });

  test('the mod 97 source is a computed analysis of the official example, dated 2026-10-12', () => {
    const source = load('model/sources/vat-nl-mod97-analysis.yaml');
    expect(source.type).toBe('analysis');
    expect(source.date).toBe('2026-10-12');
  });

  test('peppol_eas is 9944 (certain, peppol-code-lists-9-7) and vat-nl has no iso6523_icd (DEC-036)', () => {
    const vat = scheme('vat-nl');
    expect(vat.peppol_eas).toEqual({
      value: '9944',
      source: 'peppol-code-lists-9-7',
      certainty: 'certain',
    });
    expect(vat.iso6523_icd).toBeUndefined();
  });

  test('legal basis, validation source and applicability are sourced as the plan states', () => {
    const vat = scheme('vat-nl');
    expect(listOf(vat.legal_basis)).toEqual([
      expect.objectContaining({ source: 'wet-op-de-omzetbelasting-1968', certainty: 'certain' }),
    ]);
    expect(vat.validation_source).toEqual(
      expect.objectContaining({ source: 'vies', certainty: 'certain' }),
    );
    expect(listOf(vat.applicability)).toEqual([
      expect.objectContaining({
        jurisdiction: 'NL',
        status: ['issued'],
        certainty: 'certain',
        source: 'ondernemersplein-nummers-voor-de-btw',
      }),
      expect.objectContaining({
        jurisdiction: 'EU',
        status: ['verifiable'],
        certainty: 'certain',
        source: 'vies',
      }),
    ]);
  });

  test('the issuer is belastingdienst, an NL instance of national-tax-authority reached through its class', () => {
    expect(issuerOf(scheme('vat-nl'))).toBe('belastingdienst');
    expect(load('model/authorities/national-tax-authority.yaml').kind).toBe('class');
  });
});

describe('kvk-number and the RSIN prerequisite (DAT-01, DEC-036, research Pitfalls 5 and 6)', () => {
  test('accepts 05058078 and 08024285, rejects 0505807 and A5058078; no checksum (no source says either way)', () => {
    const format = formatOf(scheme('kvk-number'));
    expect(checkValue(format, '05058078').accepted).toBe(true);
    expect(checkValue(format, '08024285').accepted).toBe(true);
    expect(checkValue(format, '0505807').accepted).toBe(false);
    expect(checkValue(format, 'A5058078').accepted).toBe(false);
    expect((scheme('kvk-number').format as Json).checksum).toBeUndefined();
  });

  test('the pattern is certain and sourced to the KVK numbers page, which is dated 2026-09-18', () => {
    const patterns = listOf((scheme('kvk-number').format as Json).patterns);
    expect(patterns).toEqual([
      expect.objectContaining({ certainty: 'certain', source: 'kvk-numbers' }),
    ]);
    expect(load('model/sources/kvk-numbers.yaml')).toEqual(
      expect.objectContaining({ type: 'register-doc', date: '2026-09-18' }),
    );
  });

  test('iso6523_icd 0106 is likely (stated only by the Peppol list); peppol_eas 0106 is certain', () => {
    const kvk = scheme('kvk-number');
    expect(kvk.iso6523_icd).toEqual({
      value: '0106',
      source: 'peppol-code-lists-9-7',
      certainty: 'likely',
    });
    expect(kvk.peppol_eas).toEqual({
      value: '0106',
      source: 'peppol-code-lists-9-7',
      certainty: 'certain',
    });
  });

  test('legal basis cites Handelsregisterwet 2007 Article 12(a) and Handelsregisterbesluit 2008, both certain', () => {
    expect(listOf(scheme('kvk-number').legal_basis)).toEqual([
      expect.objectContaining({
        source: 'handelsregisterwet-2007',
        title: expect.stringContaining('Article 12(a)'),
        certainty: 'certain',
      }),
      expect.objectContaining({ source: 'handelsregisterbesluit-2008', certainty: 'certain' }),
    ]);
  });

  test('rsin has the relation prerequisite kvk-number, likely, sourced to kvk-rsin, and may-identify-same-party fi-number, likely, from the workbook', () => {
    expect(listOf(scheme('rsin').relations)).toEqual([
      expect.objectContaining({
        kind: 'prerequisite',
        target: 'kvk-number',
        certainty: 'likely',
        source: 'kvk-rsin',
      }),
      expect.objectContaining({
        kind: 'may-identify-same-party',
        target: 'fi-number',
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
    ]);
  });
});

describe('euid with the Dutch form at possible, its EU legal basis and the five EORI-case schemes (DAT-01, DEC-047, D-07)', () => {
  test('accepts NL.KVK.05058078 and rejects NL.KVK.0505807 and nl.kvk.05058078', () => {
    const format = formatOf(scheme('euid'));
    expect(checkValue(format, 'NL.KVK.05058078').accepted).toBe(true);
    expect(checkValue(format, 'NL.KVK.0505807').accepted).toBe(false);
    expect(checkValue(format, 'nl.kvk.05058078').accepted).toBe(false);
  });

  test('its only pattern is certainty possible and sourced to the workbook alone; no checksum (DEC-047)', () => {
    const format = scheme('euid').format as Json;
    expect(listOf(format.patterns)).toEqual([
      expect.objectContaining({ certainty: 'possible', source: 'landscape-v1-2' }),
    ]);
    expect(format.checksum).toBeUndefined();
  });

  test('no rule has output euid, and no rule derives an EUID from a kvk-number (DEC-047)', () => {
    const rules = loadAll('schemes').flatMap((s) => listOf(s.rules));
    expect(rules.filter((rule) => rule.output === 'euid')).toEqual([]);
    expect(rules.filter((rule) => rule.input === 'kvk-number' && rule.output === 'euid')).toEqual(
      [],
    );
  });

  test('the kvk-number relation is prerequisite, likely, and applies to the Dutch form only', () => {
    expect(listOf(scheme('euid').relations)).toEqual([
      expect.objectContaining({
        kind: 'prerequisite',
        target: 'kvk-number',
        condition: { issuing_country: 'NL' },
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
    ]);
  });

  test('legal basis cites Directive 2017/1132 Article 16(1) and Regulation 2021/1042 Annex point 9, both certain', () => {
    expect(listOf(scheme('euid').legal_basis)).toEqual([
      expect.objectContaining({
        source: 'dir-2017-1132',
        title: expect.stringContaining('Article 16(1)'),
        certainty: 'certain',
      }),
      expect.objectContaining({
        source: 'reg-2021-1042',
        title: expect.stringContaining('point 9'),
        certainty: 'certain',
      }),
    ]);
  });

  test('the validation source is the e-Justice business registers search, certain', () => {
    expect(scheme('euid').validation_source).toEqual(
      expect.objectContaining({ source: 'e-justice-business-registers', certainty: 'certain' }),
    );
  });

  test('the level legal-entity is likely and sourced to the workbook', () => {
    expect(listOf(scheme('euid').level)).toEqual([
      expect.objectContaining({
        value: 'legal-entity',
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
    ]);
  });

  test('the two EU acts are the adopted texts with their ELIs and adoption dates (read through Cellar, 2026-10-12)', () => {
    expect(load('model/sources/reg-2021-1042.yaml')).toEqual(
      expect.objectContaining({
        type: 'law',
        date: '2021-06-18',
        eli: 'http://data.europa.eu/eli/reg_impl/2021/1042/oj',
      }),
    );
    expect(load('model/sources/dir-2017-1132.yaml')).toEqual(
      expect.objectContaining({
        type: 'law',
        date: '2017-06-14',
        eli: 'http://data.europa.eu/eli/dir/2017/1132/oj',
      }),
    );
  });

  test('model/schemes holds exactly the scheme files written by plans 03-06 to 03-09', () => {
    const files = readdirSync(join(REPO_ROOT, 'model', 'schemes'))
      .filter((name) => name.endsWith('.yaml'))
      .sort();
    expect(files).toEqual([
      'bsn.yaml',
      'eori.yaml',
      'euid.yaml',
      'fi-number.yaml',
      'gln.yaml',
      'kvk-establishment-number.yaml',
      'kvk-number.yaml',
      'oin.yaml',
      'peppol-id.yaml',
      'roo.yaml',
      'rsin.yaml',
      'vat-nl.yaml',
    ]);
  });
});

describe('peppol-id, gln and GLOBAL (DAT-02, plan 03-10, DEC-033, DEC-036, DEC-045)', () => {
  test('GLOBAL is a jurisdiction file with the id GLOBAL and no parent', () => {
    const global = load('model/jurisdictions/GLOBAL.yaml');
    expect(global.id).toBe('GLOBAL');
    expect(global.part_of).toBeUndefined();
  });

  test('peppol-id is composite and names its four components in order, each sourced by the Peppol list at certain (DEC-036)', () => {
    const peppol = scheme('peppol-id');
    expect(peppol.kind).toBe('composite');
    const components = listOf(peppol.components);
    expect(components.map((c) => `${String(c.prefix)}:${String(c.scheme)}`)).toEqual([
      '0106:kvk-number',
      '0190:oin',
      '9944:vat-nl',
      '0088:gln',
    ]);
    for (const component of components) {
      expect(component).toEqual(
        expect.objectContaining({ source: 'peppol-code-lists-9-7', certainty: 'certain' }),
      );
    }
  });

  test('peppol-id has one contains relation per component target, certain and sourced to the Peppol list', () => {
    const relations = listOf(scheme('peppol-id').relations);
    expect(relations).toEqual(
      ['kvk-number', 'oin', 'vat-nl', 'gln'].map((target) =>
        expect.objectContaining({
          kind: 'contains',
          target,
          certainty: 'certain',
          source: 'peppol-code-lists-9-7',
        }),
      ),
    );
  });

  test('peppol-id has no ICD or EAS code, and its pattern accepts the workbook example but not the example without the wrapper', () => {
    const peppol = scheme('peppol-id');
    expect(peppol.iso6523_icd).toBeUndefined();
    expect(peppol.peppol_eas).toBeUndefined();
    expect(checkValue(formatOf(peppol), 'iso6523-actorid-upis::9918:nl23rabo0137300425').accepted).toBe(
      true,
    );
    expect(checkValue(formatOf(peppol), '9918:nl23rabo0137300425').accepted).toBe(false);
  });

  test('gln: 13 digits and the GS1 mod 10 check, both likely from the Peppol list; accepts a passing value and rejects a wrong check digit', () => {
    const gln = scheme('gln');
    const accepted = checkValue(formatOf(gln), '6291041500213');
    expect(accepted.accepted).toBe(true);
    expect(accepted.checksums).toEqual(['pass']);
    expect(checkValue(formatOf(gln), '6291041500214').accepted).toBe(false);
    expect(listOf((gln.format as Json).patterns)).toEqual([
      expect.objectContaining({ regex: '^[0-9]{13}$', certainty: 'likely', source: 'peppol-code-lists-9-7' }),
    ]);
    expect(listOf((gln.format as Json).checksum)).toEqual([
      expect.objectContaining({ algorithm: 'gs1-mod10', certainty: 'likely', source: 'peppol-code-lists-9-7' }),
    ]);
  });

  test('gln has ICD 0088 at likely and EAS 0088 at certain, and its level location is certain from the GS1 Nederland page', () => {
    const gln = scheme('gln');
    expect(gln.iso6523_icd).toEqual({
      value: '0088',
      source: 'peppol-code-lists-9-7',
      certainty: 'likely',
    });
    expect(gln.peppol_eas).toEqual({
      value: '0088',
      source: 'peppol-code-lists-9-7',
      certainty: 'certain',
    });
    expect(listOf(gln.level)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'location', certainty: 'certain', source: 'gs1-nl-gln' }),
      ]),
    );
  });

  test('gln is GLOBAL, issued by gs1, and its default source is the GS1 GLN Allocation Rules standard dated 2022-08-01', () => {
    const gln = scheme('gln');
    expect(gln.jurisdiction).toBe('GLOBAL');
    expect(issuerOf(gln)).toBe('gs1');
    expect(gln.sources).toEqual({ default: 'gs1-gln-allocation-rules' });
    expect(load('model/sources/gs1-gln-allocation-rules.yaml')).toEqual(
      expect.objectContaining({ type: 'standard', date: '2022-08-01' }),
    );
  });

  test('gs1 and openpeppol are authority classes with no instance, and each is the issuer of a scheme (DEC-045)', () => {
    expect(load('model/authorities/gs1.yaml')).toEqual(
      expect.objectContaining({ id: 'gs1', kind: 'class' }),
    );
    expect(load('model/authorities/openpeppol.yaml')).toEqual(
      expect.objectContaining({ id: 'openpeppol', kind: 'class' }),
    );
    expect(issuerOf(scheme('peppol-id'))).toBe('openpeppol');
  });
});

describe('oin and the reverse rules to the KVK number and the RSIN (DAT-02, DEC-045, OIN Stelsel 2.1.0 §6)', () => {
  test('accepts the workbook OIN and the RSIN-based OIN, rejects a 19-digit value; no check digit (Peppol 0190)', () => {
    const format = formatOf(scheme('oin'));
    expect(checkValue(format, '00000003080242850000').accepted).toBe(true);
    expect(checkValue(format, '00000001001469630000').accepted).toBe(true);
    expect(checkValue(format, '0000000308024285000').accepted).toBe(false);
    expect(listOf((scheme('oin').format as Json).checksum)).toEqual([
      expect.objectContaining({ algorithm: 'none', source: 'peppol-code-lists-9-7' }),
    ]);
  });

  test('the KVK-based OIN of the workbook example is derived by rule from 08024285, and the reverse capture gives the number back', () => {
    const forward = ruleOf(scheme('oin'), 'oin-from-kvk-number');
    expect(forward.input).toBe('kvk-number');
    expect(forward.output).toBe('oin');
    expect(run(forward.transform, '08024285')).toBe('00000003080242850000');
    const back = ruleOf(scheme('kvk-number'), 'kvk-number-from-oin');
    expect(back.input).toBe('oin');
    expect(back.certainty).toBe('certain');
    expect(run(back.transform, '00000003080242850000')).toBe('08024285');
  });

  test('the RSIN-based OIN is derived by rule from 001469630, and the reverse capture gives the RSIN back', () => {
    const forward = ruleOf(scheme('oin'), 'oin-from-rsin');
    expect(forward.input).toBe('rsin');
    expect(run(forward.transform, '001469630')).toBe('00000001001469630000');
    const back = ruleOf(scheme('rsin'), 'rsin-from-oin');
    expect(back.input).toBe('oin');
    expect(run(back.transform, '00000001001469630000')).toBe('001469630');
  });

  test('each reverse capture keeps its own prefix: an RSIN-based OIN gives no KVK number and a KVK-based OIN gives no RSIN', () => {
    const kvkBack = ruleOf(scheme('kvk-number'), 'kvk-number-from-oin');
    const rsinBack = ruleOf(scheme('rsin'), 'rsin-from-oin');
    expect(run(kvkBack.transform, '00000001001469630000')).toBeNull();
    expect(run(rsinBack.transform, '00000003080242850000')).toBeNull();
  });

  test('a KVK number and its OIN round-trip by rule (KVK, OIN, KVK) and give the same number', () => {
    const toOin = ruleOf(scheme('oin'), 'oin-from-kvk-number');
    const toKvk = ruleOf(scheme('kvk-number'), 'kvk-number-from-oin');
    const oin = run(toOin.transform, '08024285');
    expect(oin).not.toBeNull();
    expect(run(toKvk.transform, String(oin))).toBe('08024285');
  });

  test('oin carries derived-from kvk-number and derived-from rsin, both certain and sourced to the OIN Stelsel', () => {
    expect(listOf(scheme('oin').relations)).toEqual([
      expect.objectContaining({
        kind: 'derived-from',
        target: 'kvk-number',
        certainty: 'certain',
        source: 'oin-stelsel-2-1-0',
      }),
      expect.objectContaining({
        kind: 'derived-from',
        target: 'rsin',
        certainty: 'certain',
        source: 'oin-stelsel-2-1-0',
      }),
      expect.objectContaining({
        kind: 'may-identify-same-party',
        target: 'fi-number',
        certainty: 'certain',
        source: 'oin-stelsel-2-1-0',
      }),
    ]);
  });

  test('the OIN Stelsel 2.1.0 is a standard dated 2024-01-19; the Logius class is the issuer of oin and has no instance', () => {
    expect(load('model/sources/oin-stelsel-2-1-0.yaml')).toEqual(
      expect.objectContaining({
        type: 'standard',
        date: '2024-01-19',
        url: 'https://gitdocumentatie.logius.nl/publicatie/dk/oin/2.1.0/',
      }),
    );
    expect(issuerOf(scheme('oin'))).toBe('logius');
    expect(load('model/authorities/logius.yaml')).toEqual(
      expect.objectContaining({ kind: 'class' }),
    );
  });
});

describe('kvk-establishment-number and roo as a register (DAT-02, SPEC §9, DEC-046)', () => {
  test('the establishment number accepts 000019478445 and rejects 00001947844; no check digit', () => {
    const format = formatOf(scheme('kvk-establishment-number'));
    expect(checkValue(format, '000019478445').accepted).toBe(true);
    expect(checkValue(format, '00001947844').accepted).toBe(false);
    expect((scheme('kvk-establishment-number').format as Json).checksum).toBeUndefined();
  });

  test('its level is establishment, certain, and the KVK branch-number page states it', () => {
    expect(listOf(scheme('kvk-establishment-number').level)).toEqual([
      expect.objectContaining({
        value: 'establishment',
        certainty: 'certain',
        source: 'kvk-establishment',
      }),
    ]);
  });

  test('it is a prerequisite of the KVK number (likely, workbook) and a different level from it (likely, KVK page)', () => {
    expect(listOf(scheme('kvk-establishment-number').relations)).toEqual([
      expect.objectContaining({
        kind: 'prerequisite',
        target: 'kvk-number',
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
      expect.objectContaining({
        kind: 'different-level',
        target: 'kvk-number',
        certainty: 'likely',
        source: 'kvk-establishment',
      }),
    ]);
  });

  test('its legal basis is Handelsregisterwet 2007 (certain) and it has no validation source', () => {
    expect(listOf(scheme('kvk-establishment-number').legal_basis)).toEqual([
      expect.objectContaining({ source: 'handelsregisterwet-2007', certainty: 'certain' }),
    ]);
    expect(scheme('kvk-establishment-number').validation_source).toBeUndefined();
  });

  test('the KVK branch-number page is a register-doc with its url and the date it states', () => {
    expect(load('model/sources/kvk-establishment.yaml')).toEqual(
      expect.objectContaining({
        type: 'register-doc',
        date: '2026-07-07',
        url: 'https://www.kvk.nl/en/about-the-business-register/branch-number/',
      }),
    );
  });

  test('roo is a register with no format: a register is identified by a URL, not by an identifier (SPEC §9)', () => {
    const roo = scheme('roo');
    expect(roo.kind).toBe('register');
    expect(roo.format).toBeUndefined();
  });

  test('roo is the government-organisation level, certain, stated by the KOOP ROO page; its issuer is the KOOP class', () => {
    const roo = scheme('roo');
    expect(listOf(roo.level)).toEqual([
      expect.objectContaining({
        value: 'government-organisation',
        certainty: 'certain',
        source: 'koop-roo',
      }),
    ]);
    expect(issuerOf(roo)).toBe('koop');
    expect(load('model/authorities/koop.yaml')).toEqual(expect.objectContaining({ kind: 'class' }));
  });

  test('roo references the KVK number and the OIN (likely, workbook) and is validated at organisaties.overheid.nl (certain)', () => {
    const roo = scheme('roo');
    expect(listOf(roo.relations)).toEqual([
      expect.objectContaining({
        kind: 'references',
        target: 'kvk-number',
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
      expect.objectContaining({
        kind: 'references',
        target: 'oin',
        certainty: 'likely',
        source: 'landscape-v1-2',
      }),
    ]);
    expect(roo.validation_source).toEqual(
      expect.objectContaining({
        url: 'https://organisaties.overheid.nl/',
        certainty: 'certain',
        source: 'organisaties-overheid',
      }),
    );
  });
});

describe('bsn and fi-number without valid examples (DAT-02, SPEC §10, DEC-022, DEC-025, DEC-039)', () => {
  test.each(['bsn', 'fi-number'])(
    '%s has the 9-digit pattern and the elfproef, both likely, and no examples_valid',
    (id) => {
      const format = formatOf(scheme(id));
      expect(listOf(format.patterns)).toEqual([
        expect.objectContaining({
          regex: '^[0-9]{9}$',
          certainty: 'likely',
          source: 'landscape-v1-2',
        }),
      ]);
      expect(listOf(format.checksum)).toEqual([
        expect.objectContaining({
          algorithm: 'elfproef',
          certainty: 'likely',
          source: 'landscape-v1-2',
        }),
      ]);
      expect((format as Json).examples_valid).toBeUndefined();
    },
  );

  test.each(['bsn', 'fi-number'])(
    '%s rejects its invalid examples: a well-formed value fails the elfproef, a short value fails the pattern',
    (id) => {
      const format = formatOf(scheme(id));
      expect(checkValue(format, '123456789').accepted).toBe(false);
      expect(checkValue(format, '12345678').accepted).toBe(false);
    },
  );

  test('bsn is the natural-person level (certain, Wabb Article 1) with its Wabb legal basis and a restricted availability', () => {
    const bsn = scheme('bsn');
    expect(listOf(bsn.level)).toEqual([
      expect.objectContaining({ value: 'natural-person', certainty: 'certain', source: 'wabb' }),
    ]);
    expect(listOf(bsn.legal_basis)).toEqual([
      expect.objectContaining({
        source: 'wabb',
        certainty: 'certain',
        title: expect.stringContaining('Article 1'),
      }),
    ]);
    expect(bsn.availability).toEqual({
      value: 'restricted',
      source: 'landscape-v1-2',
      certainty: 'likely',
    });
  });

  test('bsn has its header in the long form where the default source does not carry it: issuer rvig, abbreviation BSN (likely, workbook)', () => {
    const bsn = scheme('bsn');
    expect(bsn.issuer).toEqual({ value: 'rvig', source: 'landscape-v1-2', certainty: 'likely' });
    expect(bsn.abbreviation).toEqual({
      value: 'BSN',
      source: 'landscape-v1-2',
      certainty: 'likely',
    });
    expect(bsn.validation_source).toBeUndefined();
  });

  test('fi-number has every bare header field in the long form at likely from the workbook, and no legal basis', () => {
    const fi = scheme('fi-number');
    expect(fi.kind).toEqual({ value: 'identifier', source: 'landscape-v1-2', certainty: 'likely' });
    expect(fi.issuer).toEqual({
      value: 'belastingdienst',
      source: 'landscape-v1-2',
      certainty: 'likely',
    });
    expect(fi.jurisdiction).toEqual({ value: 'NL', source: 'landscape-v1-2', certainty: 'likely' });
    expect(fi.availability).toEqual({
      value: 'internal',
      source: 'landscape-v1-2',
      certainty: 'likely',
    });
    expect(fi.legal_basis).toBeUndefined();
  });

  test('the rvig class is the issuer of bsn and has no instance (DEC-045)', () => {
    expect(issuerOf(scheme('bsn'))).toBe('rvig');
    expect(load('model/authorities/rvig.yaml')).toEqual(expect.objectContaining({ kind: 'class' }));
  });

  test('no rule takes a fi-number as its input, so no RSIN or OIN is derived from it; derived-from is rule-backed (SPEC §5.1)', () => {
    const rules = loadAll('schemes').flatMap((s) => listOf(s.rules));
    expect(rules.filter((rule) => rule.input === 'fi-number')).toEqual([]);
    const toFi = [scheme('rsin'), scheme('oin')].flatMap((s) =>
      listOf(s.relations).filter((relation) => relation.target === 'fi-number'),
    );
    expect(toFi.map((relation) => relation.kind)).toEqual([
      'may-identify-same-party',
      'may-identify-same-party',
    ]);
  });

  test.each([
    '## BSN and fi-number have no valid example',
    '## BSN validation register without a URL',
    '## No rule from the fi-number to the RSIN or the OIN',
  ])('the entry "%s" exists in the four-part form', (heading) => {
    const gaps = read('docs/gaps.md');
    const start = gaps.indexOf(heading);
    expect(start, heading).toBeGreaterThanOrEqual(0);
    const section = gaps.slice(start).split('\n## ')[0] ?? '';
    let at = 0;
    for (const part of [
      '- **Item:**',
      '- **Why it is not in the model:**',
      '- **Open question:**',
      '- **Owner or next step:**',
    ]) {
      const found = section.indexOf(part, at);
      expect(found, `${heading}: ${part}`).toBeGreaterThanOrEqual(0);
      at = found + part.length;
    }
  });
});
