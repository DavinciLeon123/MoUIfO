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
