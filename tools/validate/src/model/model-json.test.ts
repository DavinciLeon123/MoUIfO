import { readFileSync } from 'node:fs';
import { MODEL_CONTRACT } from '@uio/engine';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { normalise } from '../../../build/src/model/normalise.ts';
import { VOCAB_SCHEMAS } from './load.ts';
import { loadValidatedModel } from './load-model.ts';
import { checkModelJson } from './model-json.ts';

const loaded = loadValidatedModel(REPO_ROOT);
if (!loaded.ok) throw new Error('the real model must validate');
const real = normalise(loaded.model, '0.0.0');

// biome-ignore lint/suspicious/noExplicitAny: test-only mutation of a JSON tree
type Loose = Record<string, any>;
const clone = (): Loose => structuredClone(real) as unknown as Loose;

function problemsOf(mutate: (model: Loose) => void): string[] {
  const model = clone();
  mutate(model);
  return checkModelJson(model).map((problem) => problem.message);
}

describe('checkModelJson', () => {
  test('the real normalised model gives no problem', () => {
    expect(checkModelJson(real)).toEqual([]);
  });

  test('every problem is on dist/model.json', () => {
    const model = clone();
    model.bogus = 1;
    const problems = checkModelJson(model);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem.file).toBe('dist/model.json');
  });

  test('an unknown top-level key is a problem', () => {
    expect(problemsOf((m) => (m.bogus = 1))).toEqual(['/bogus unknown property']);
  });

  test('an unknown key in a scheme record is a problem', () => {
    expect(problemsOf((m) => (m.schemes.eori.bogus = 1))).toEqual([
      '/schemes/eori/bogus unknown property',
    ]);
  });

  test('an unknown key inside a pattern entry is a problem', () => {
    expect(problemsOf((m) => (m.schemes.eori.format.patterns[0].bogus = 1))).toEqual([
      '/schemes/eori/format/patterns/0/bogus unknown property',
    ]);
  });

  test('contract 2 is a problem', () => {
    const messages = problemsOf((m) => (m.contract = 2));
    expect(messages).toEqual(['/contract must be "1"']);
  });

  test('a bare-string issuer is a problem', () => {
    const messages = problemsOf((m) => (m.schemes.eori.issuer = 'national-customs-authority'));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join('\n')).toContain('/schemes/eori/issuer');
  });

  test('an issuer naming an authority that is not in the table is a problem without the id', () => {
    const missing = 'authority-that-is-not-there';
    const messages = problemsOf((m) => (m.schemes.eori.issuer.value = missing));
    expect(messages).toEqual(['/schemes/eori/issuer/value the value is not a known authority']);
    expect(messages.join('\n')).not.toContain(missing);
  });

  test('a certainty that is not in the vocabulary is a problem without the value', () => {
    const messages = problemsOf((m) => (m.schemes.eori.issuer.certainty = 'sure'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('/schemes/eori/issuer/certainty');
    expect(messages.join('\n')).not.toContain('sure');
  });

  test('a sources key on a scheme is a problem', () => {
    expect(problemsOf((m) => (m.schemes.eori.sources = { default: 'commission-eori' }))).toEqual([
      '/schemes/eori/sources unknown property',
    ]);
  });

  test('a dangling scheme reference is a problem without the id', () => {
    const dangling = 'scheme-that-is-not-there';
    const messages = problemsOf((m) => (m.schemes['vat-nl'].relations[0].target = dangling));
    expect(messages).toHaveLength(1);
    expect(messages.join('\n')).not.toContain(dangling);
  });

  test('a dangling source reference on a source-bearing statement is a problem', () => {
    const messages = problemsOf((m) => (m.schemes.eori.format.patterns[0].source = 'no-such-src'));
    expect(messages).toHaveLength(1);
    expect(messages.join('\n')).not.toContain('no-such-src');
  });

  test('an unknown key in a source, authority and jurisdiction record is a problem', () => {
    const messages = problemsOf((m) => {
      m.sources['commission-eori'].bogus = 1;
      m.authorities.kvk.bogus = 1;
      m.jurisdictions.NL.bogus = 1;
    });
    expect(messages).toEqual([
      '/authorities/kvk/bogus unknown property',
      '/jurisdictions/NL/bogus unknown property',
      '/sources/commission-eori/bogus unknown property',
    ]);
  });

  test('a missing vocabulary is a problem', () => {
    // The registry is built from the model's own tables, so the references into the missing
    // vocabulary dangle as well; the missing table is reported among them.
    const messages = problemsOf((m) => delete m.vocab.role);
    expect(messages).toContain('/vocab missing required property "role"');
    expect(messages.length).toBeGreaterThan(1);
  });
});

describe('model.schema.json', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/model.schema.json', import.meta.url), 'utf8'),
  );

  test('the const of contract equals MODEL_CONTRACT', () => {
    expect(schema.properties.contract.const).toBe(MODEL_CONTRACT);
  });

  test('the vocab table has one property per known vocabulary and requires them all', () => {
    const ids = Object.keys(VOCAB_SCHEMAS).sort();
    expect(Object.keys(schema.properties.vocab.properties).sort()).toEqual(ids);
    expect([...schema.properties.vocab.required].sort()).toEqual(ids);
    for (const id of ids) {
      expect(schema.properties.vocab.properties[id]).toEqual({ $ref: VOCAB_SCHEMAS[id] });
    }
  });
});
