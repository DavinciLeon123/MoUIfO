import { expect, describe as suite, test } from 'vitest';
import { createEngine } from './engine.ts';
import { loadDistModel } from './testing/load-model.ts';

const model = loadDistModel();
const engine = createEngine(model);

suite('describe on the real model: eori (tracer)', () => {
  const result = engine.describe('eori');
  const data = result.data;

  test('returns data and no warning for a known scheme', () => {
    expect(data).not.toBeNull();
    expect(result.warnings).toEqual([]);
  });

  test('the issuer is the class with its Dutch instance and their sources', () => {
    expect(data?.issuer.value).toBe('national-customs-authority');
    expect(data?.issuer.authority_kind).toBe('class');
    expect(data?.issuer.instances).toHaveLength(1);
    const instance = data?.issuer.instances[0];
    expect(instance?.id).toBe('douane-nl');
    expect(instance?.jurisdiction).toBe('NL');
    expect(instance?.source.id).toBe('douane-eori-nl');
    expect(instance?.certainty).toBe('certain');
  });

  test('the validation source is the EU EORI validation, certain, with its source', () => {
    expect(data?.validation_source?.value.label).toBe('EU EORI number validation');
    expect(data?.validation_source?.source.id).toBe('eori-validation');
    expect(data?.validation_source?.certainty).toBe('certain');
  });

  test('has no level (DEC-050)', () => {
    expect(data?.level).toEqual([]);
  });

  test('the issuer instance conclusion names douane-nl and is certain', () => {
    const found = result.conclusions.find((each) => each.key === 'describe.issuer-instance');
    expect(found?.params.authority).toBe('douane-nl');
    expect(found?.certainty).toBe('certain');
    expect(found?.explanation.map((step) => step.ref)).toEqual([
      'eori/issuer',
      'authorities/douane-nl',
    ]);
  });
});
