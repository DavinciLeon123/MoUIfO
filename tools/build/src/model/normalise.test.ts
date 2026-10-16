import { REPO_ROOT } from 'uio-config';
import { loadValidatedModel, type RawModel } from 'uio-validate';
import { describe, expect, test } from 'vitest';
import { normalise } from './normalise.ts';

const loaded = loadValidatedModel(REPO_ROOT);
if (!loaded.ok) throw new Error('the real model must validate before it can be normalised');
const raw: RawModel = loaded.model;
const model = normalise(raw, '1.2.3');

// eslint-free structural view of a scheme record
type Loose = Record<string, unknown>;
const scheme = (id: string): Loose => model.schemes[id] as Loose;

function everyObjectIsSorted(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => everyObjectIsSorted(v, `${path}/${i}`));
  if (typeof value !== 'object' || value === null) return [];
  const keys = Object.keys(value);
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const own = keys.every((key, i) => key === sorted[i]) ? [] : [path || '/'];
  return [
    ...own,
    ...Object.entries(value).flatMap(([k, v]) => everyObjectIsSorted(v, `${path}/${k}`)),
  ];
}

describe('normalise', () => {
  test('carries the contract and the model version', () => {
    expect(model.contract).toBe(1);
    expect(model.model_version).toBe('1.2.3');
  });

  test('eori header fields become long forms with the default source and certain', () => {
    const eori = scheme('eori');
    expect(eori.issuer).toEqual({
      certainty: 'certain',
      source: 'commission-eori',
      value: 'national-customs-authority',
    });
    expect(eori.availability).toEqual({
      certainty: 'likely',
      source: 'landscape-v1-2',
      value: 'public-restricted-details',
    });
    expect(eori.jurisdiction).toEqual({
      certainty: 'certain',
      source: 'commission-eori',
      value: 'EU',
    });
    expect(eori.kind).toEqual({
      certainty: 'certain',
      source: 'commission-eori',
      value: 'identifier',
    });
  });

  test('no scheme record has a sources key', () => {
    for (const record of Object.values(model.schemes)) expect('sources' in record).toBe(false);
  });

  test('an absent or null iso6523_icd or peppol_eas is left out, a long form is kept', () => {
    for (const [id, record] of Object.entries(raw.schemes)) {
      for (const field of ['iso6523_icd', 'peppol_eas']) {
        const authored = (record as Loose)[field];
        const written = scheme(id)[field];
        if (authored === undefined || authored === null) {
          expect(field in scheme(id)).toBe(false);
        } else {
          expect(written).toBeDefined();
          expect((written as Loose).value).toBe(
            typeof authored === 'object' ? (authored as Loose).value : authored,
          );
        }
      }
    }
    expect(scheme('vat-nl').peppol_eas).toEqual({
      certainty: 'likely',
      source: 'peppol-code-lists-9-7',
      value: '9944',
    });
  });

  test('every header field present is a closed long form', () => {
    for (const record of Object.values(model.schemes)) {
      for (const field of ['issuer', 'jurisdiction', 'kind', 'abbreviation', 'availability']) {
        const value = (record as Loose)[field];
        if (value === undefined) continue;
        expect(Object.keys(value as Loose)).toEqual(['certainty', 'source', 'value']);
      }
    }
  });

  test('bsn and fi-number keep all five trust sub-scores as null', () => {
    for (const id of ['bsn', 'fi-number']) {
      const trust = scheme(id).trust as Loose;
      for (const key of [
        'legal_basis',
        'registration_quality',
        'verifiability',
        'crosswalks',
        'lifecycle',
      ]) {
        expect(trust[key]).toBeNull();
      }
    }
  });

  test('eori patterns and examples keep the authored order', () => {
    const authored = (raw.schemes.eori as { format: Loose }).format;
    const written = scheme('eori').format as Loose;
    expect((written.patterns as Loose[]).map((p) => p.regex)).toEqual(
      (authored.patterns as Loose[]).map((p) => p.regex),
    );
    expect(written.examples_valid).toEqual(authored.examples_valid);
    expect(written.examples_invalid).toEqual(authored.examples_invalid);
  });

  test('authorities, jurisdictions, sources and vocab deep-equal their YAML data', () => {
    expect(model.authorities).toEqual(raw.authorities);
    expect(model.jurisdictions).toEqual(raw.jurisdictions);
    expect(model.sources).toEqual(raw.sources);
    expect(model.vocab).toEqual(raw.vocab);
  });

  test('every other scheme field keeps its authored content', () => {
    const header = new Set([
      'issuer',
      'jurisdiction',
      'kind',
      'abbreviation',
      'availability',
      'iso6523_icd',
      'peppol_eas',
      'sources',
    ]);
    for (const [id, record] of Object.entries(raw.schemes)) {
      for (const [key, value] of Object.entries(record as Loose)) {
        if (header.has(key)) continue;
        expect(scheme(id)[key]).toEqual(value);
      }
    }
  });

  test('every object at every depth has its keys in codepoint order', () => {
    expect(everyObjectIsSorted(model)).toEqual([]);
  });

  test('two calls give identical JSON text and the input is not mutated', () => {
    const before = JSON.stringify(raw);
    const first = JSON.stringify(normalise(raw, '1.2.3'));
    const second = JSON.stringify(normalise(raw, '1.2.3'));
    expect(second).toBe(first);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
