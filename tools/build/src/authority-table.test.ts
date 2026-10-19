import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, type Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { loadValidatedModel } from 'uio-validate';
import { beforeAll, describe, expect, test } from 'vitest';
import { renderArtefacts } from './build.ts';

// Real-data assertions for the EU country authority table mappings (DEC-057, plan 04-12).
// The slow build runs once in beforeAll, so a test timeout of 30 s keeps a failure readable.

const SKOS_EXACT_MATCH = 'http://www.w3.org/2004/02/skos/core#exactMatch';
const TABLE = 'http://publications.europa.eu/resource/authority/country/';
const SOURCE_ID = 'eu-country-authority-table';

/** DEC-057: the mapped jurisdictions and the entry each one maps to. */
const MAPPED: Record<string, string> = {
  BE: 'BEL',
  EU: 'EUR',
  GB: 'GBR',
  GR: 'GRC',
  NL: 'NLD',
};
/** DEC-057: jurisdictions left out and logged in docs/gaps.md. */
const UNMAPPED = ['GLOBAL', 'XI'];

type AuthorityTable = { iri: string; source: string; certainty: string };
let jurisdictions: Record<string, { id: string; authority_table?: AuthorityTable }>;
let quads: Quad[];
let namespace: string;

beforeAll(async () => {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model does not validate; run npm run validate');
  jurisdictions = loaded.model.jurisdictions as typeof jurisdictions;
  const cfg = loadConfig();
  namespace = cfg.namespace;
  const result = await renderArtefacts(REPO_ROOT, cfg);
  expect(result.problems).toEqual([]);
  const ttl = result.outputs.find((output) => output.name === 'uio.ttl');
  quads = new Parser().parse(ttl?.text ?? '');
}, 30_000);

/** The authority-table Statements of the published graph: subject jurisdiction to its table IRI. */
function exactMatchStatements(): { subject: string; object: string }[] {
  const def = (term: string): string => `${namespace}def#${term}`;
  const statements = quads
    .filter((q) => q.predicate.value === def('predicate') && q.object.value === SKOS_EXACT_MATCH)
    .map((q) => q.subject.value);
  const objectOf = (statement: string, term: string): string =>
    quads.find((q) => q.subject.value === statement && q.predicate.value === def(term))?.object
      .value ?? '';
  return statements
    .map((statement) => ({
      subject: objectOf(statement, 'subject'),
      object: objectOf(statement, 'object'),
    }))
    .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
}

describe('the country authority table source (DEC-057, DEC-030)', () => {
  test('model/sources/eu-country-authority-table.yaml is a standard with publisher and reference', () => {
    const path = join(REPO_ROOT, 'model', 'sources', `${SOURCE_ID}.yaml`);
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/^type: standard$/m);
    expect(text).toContain('Publications Office');
    expect(text).toMatch(/^publisher: /m);
    expect(text).toMatch(/^reference: /m);
  });
});

describe('the DEC-057 jurisdiction mappings', () => {
  test.each(Object.entries(MAPPED))('%s maps to the entry %s, source and certain', (id, code) => {
    expect(jurisdictions[id]?.authority_table).toEqual({
      iri: `${TABLE}${code}`,
      source: SOURCE_ID,
      certainty: 'certain',
    });
  });

  test.each(UNMAPPED)('%s carries no authority_table', (id) => {
    expect(jurisdictions[id]).toBeDefined();
    expect(jurisdictions[id]?.authority_table).toBeUndefined();
  });

  test('no jurisdiction outside the DEC-057 set carries authority_table', () => {
    const carriers = Object.values(jurisdictions)
      .filter((jurisdiction) => jurisdiction.authority_table !== undefined)
      .map((jurisdiction) => jurisdiction.id)
      .sort();
    expect(carriers).toEqual(Object.keys(MAPPED).sort());
  });
});

describe('the published Statements', () => {
  test('uio.ttl holds one skos:exactMatch Statement per mapped jurisdiction and none for the others', () => {
    expect(exactMatchStatements()).toEqual(
      Object.entries(MAPPED)
        .map(([id, code]) => ({
          subject: `${namespace}jurisdiction/${id}`,
          object: `${TABLE}${code}`,
        }))
        .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0)),
    );
  });
});

describe('docs/gaps.md', () => {
  test('lists the jurisdictions left out, in a four-part entry', () => {
    const gaps = readFileSync(join(REPO_ROOT, 'docs', 'gaps.md'), 'utf8');
    const heading = '## Country authority table entries not mapped (DEC-057)';
    const start = gaps.indexOf(`\n${heading}\n`);
    expect(start).toBeGreaterThan(-1);
    const end = gaps.indexOf('\n## ', start + 1);
    const section = gaps.slice(start, end < 0 ? undefined : end);
    for (const part of [
      '**Item:**',
      '**Why it is not in the model:**',
      '**Open question:**',
      '**Owner or next step:**',
    ]) {
      expect(section).toContain(part);
    }
    for (const id of UNMAPPED) expect(section).toContain(id);
  });
});
