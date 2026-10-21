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

type Json = Record<string, unknown>;

/** Every object in the data that carries both a source and a certainty: a sourced claim. */
function sourcedClaims(value: unknown, found: Json[] = []): Json[] {
  if (Array.isArray(value)) {
    for (const each of value) sourcedClaims(each, found);
  } else if (typeof value === 'object' && value !== null) {
    const record = value as Json;
    if ('source' in record && 'certainty' in record) found.push(record);
    for (const each of Object.values(record)) sourcedClaims(each, found);
  }
  return found;
}

const certaintyIds = (model.vocab.certainty?.values ?? []).map((member) => member.id);
const allRules = Object.values(model.schemes).flatMap((scheme) => scheme.rules ?? []);

/** The number of claims a scheme has, counted from the raw model and never from the engine. */
function expectedConclusions(id: string): number {
  const scheme = model.schemes[id];
  if (scheme === undefined) throw new Error('unknown scheme in the test');
  const headers = [
    scheme.kind,
    scheme.issuer,
    scheme.jurisdiction,
    scheme.abbreviation,
    scheme.availability,
    scheme.iso6523_icd,
    scheme.peppol_eas,
  ].filter((each) => each !== undefined).length;
  const lists =
    (scheme.level?.length ?? 0) +
    (scheme.roles?.length ?? 0) +
    (scheme.applicability?.length ?? 0) +
    (scheme.persistence?.length ?? 0) +
    (scheme.legal_basis?.length ?? 0) +
    (scheme.relations?.length ?? 0);
  const singles = [scheme.trust, scheme.validation_source, scheme.mandatory].filter(
    (each) => each !== undefined,
  ).length;
  const contextFrom = scheme.context_from?.issuing_country === undefined ? 0 : 1;
  const format = (scheme.format?.patterns?.length ?? 0) + (scheme.format?.checksum?.length ?? 0);
  const components = scheme.components?.length ?? 0;
  const rulesIn = allRules.filter((rule) => rule.output === id).length;
  const rulesOut = allRules.filter((rule) => rule.input === id).length;
  const authority = model.authorities[scheme.issuer.value];
  const instances = Object.values(model.authorities).filter(
    (each) =>
      each.source !== undefined &&
      each.certainty !== undefined &&
      (authority?.kind === 'instance'
        ? each.id === authority.id
        : each.kind === 'instance' && each.instance_of === scheme.issuer.value),
  ).length;
  return (
    headers + lists + singles + contextFrom + format + components + rulesIn + rulesOut + instances
  );
}

suite('describe is complete and sourced for every scheme', () => {
  test.for(Object.keys(model.schemes))('%s', (id) => {
    const result = engine.describe(id);
    expect(result.warnings).toEqual([]);
    expect(result.data).not.toBeNull();

    const claims = sourcedClaims(result.data);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const source = claim.source as { id: string };
      expect(Object.hasOwn(model.sources, source.id)).toBe(true);
      expect(certaintyIds).toContain(claim.certainty);
    }

    expect(result.conclusions).toHaveLength(expectedConclusions(id));
    for (const each of result.conclusions) {
      expect(each.explanation.length).toBeGreaterThan(0);
      expect(each.key.startsWith('describe.')).toBe(true);
      expect(each.params.scheme).toBe(id);
    }
    expect(engine.describe(id)).toEqual(result);
  });
});

suite('describe: conditions, absent parts and components', () => {
  test('a conditional claim is likely and carries an assumption step per condition key (eori)', () => {
    const found = engine
      .describe('eori')
      .conclusions.find((each) => each.key === 'describe.relation');
    expect(found?.params.kind).toBe('derived-from');
    expect(found?.certainty).toBe('likely');
    const assumptions = found?.explanation.filter((step) => step.kind === 'assumption') ?? [];
    expect(assumptions.map((step) => step.condition)).toEqual([{ entity_form: 'legal-person' }]);
    expect(assumptions.every((step) => step.source === null)).toBe(true);
  });

  test('a claim with a condition has one assumption step per condition key (euid)', () => {
    const found = engine
      .describe('euid')
      .conclusions.find(
        (each) => each.key === 'describe.relation' && each.params.kind === 'prerequisite',
      );
    expect(found?.certainty).toBe('likely');
    expect(
      found?.explanation.filter((step) => step.kind === 'assumption').map((step) => step.condition),
    ).toEqual([{ issuing_country: 'NL' }]);
  });

  test('the eori pattern with two condition keys has two assumption steps', () => {
    const found = engine
      .describe('eori')
      .conclusions.find((each) => each.key === 'describe.pattern' && each.params.index === '1');
    expect(found?.explanation.filter((step) => step.kind === 'assumption')).toHaveLength(2);
    expect(found?.certainty).toBe('likely');
  });

  test('a claim without a condition keeps its own certainty and has no assumption (eori kind)', () => {
    const found = engine.describe('eori').conclusions.find((each) => each.key === 'describe.kind');
    expect(found?.certainty).toBe('certain');
    expect(found?.explanation.map((step) => step.kind)).toEqual(['fact']);
  });

  test('bsn has no validation source', () => {
    expect(engine.describe('bsn').data?.validation_source).toBeUndefined();
  });

  test('roo has no patterns', () => {
    expect(engine.describe('roo').data?.format.patterns).toEqual([]);
  });

  test('peppol-id lists its five components at likely with the code list source', () => {
    const components = engine.describe('peppol-id').data?.components ?? [];
    expect(components).toHaveLength(5);
    for (const component of components) {
      expect(component.source.id).toBe('peppol-code-lists-9-7');
      expect(component.certainty).toBe('likely');
    }
  });

  test('the rules join the right schemes: eori in and out, rsin in', () => {
    const eori = engine.describe('eori').data;
    expect(eori?.rules_in.map((rule) => rule.value.id)).toEqual(['eori-nl-from-rsin']);
    expect(eori?.rules_out.map((rule) => rule.value.id)).toEqual(['rsin-from-eori-nl']);
    expect(engine.describe('rsin').data?.rules_in.map((rule) => rule.value.id)).toEqual([
      'rsin-from-eori-nl',
      'rsin-from-oin',
      'rsin-from-vat-nl',
    ]);
  });

  test('an issuer that is an instance lists itself (kvk-number)', () => {
    const issuer = engine.describe('kvk-number').data?.issuer;
    expect(issuer?.authority_kind).toBe('instance');
    expect(issuer?.instances.map((each) => each.id)).toEqual(['kvk']);
  });
});

suite('describe: bad input and isolation', () => {
  test.for(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'EORI', ''])(
    'unknown id %j gives null data and unknown-scheme without echoing the id',
    (id) => {
      const result = engine.describe(id);
      expect(result.data).toBeNull();
      expect(result.conclusions).toEqual([]);
      expect(result.warnings.map((warning) => warning.code)).toEqual(['unknown-scheme']);
      expect(result.warnings[0]?.message).toBe('No scheme with this id exists in the model.');
      if (id !== '') expect(JSON.stringify(result.warnings)).not.toContain(id);
    },
  );

  test.for([7, null, undefined, {}, ['eori']])('a non-string id gives invalid-input (%j)', (id) => {
    const result = engine.describe(id as never);
    expect(result.data).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(['invalid-input']);
  });

  test('mutating a returned description does not change a later one', () => {
    const first = engine.describe('eori');
    const data = first.data;
    if (data === null) throw new Error('eori must be described');
    data.level.push(data.kind);
    data.applicability[0]?.value.status.push('changed');
    data.format.examples_valid.push('changed');
    data.issuer.instances.pop();
    if (data.label) data.label.en = 'changed';
    if (data.notes) data.notes.en = 'changed';
    const first_source = data.kind.source;
    first_source.title = 'changed';
    const later = engine.describe('eori');
    expect(later.data?.level).toEqual([]);
    expect(later.data?.applicability[0]?.value.status).toEqual(['issued', 'recognised']);
    expect(later.data?.format.examples_valid).toEqual(['NL001469630', 'DE123456789012345']);
    expect(later.data?.issuer.instances).toHaveLength(1);
    expect(later.data?.label.en).not.toBe('changed');
    expect(later.data?.kind.source.title).not.toBe('changed');
    expect(model.schemes.eori?.label.en).not.toBe('changed');
  });
});
