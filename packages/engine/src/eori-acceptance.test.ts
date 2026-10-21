import { describe, expect, test } from 'vitest';
import { elfproef } from './checksum/elfproef.ts';
import { createEngine } from './engine.ts';
import { checkValue } from './format.ts';
import { loadDistModel } from './testing/load-model.ts';
import type { Step } from './types.ts';

// The SPEC section 10 acceptance case at engine level (ENG-13, D-14, D-15). Only expectations the
// model holds a source for are asserted as present. The two SPEC section 10 rows without a source
// (the associated VAT number and the EORI level) are asserted ABSENT (DEC-050), and a DE-prefixed
// EORI yields no RSIN (DEC-071). The only nine-digit literal used is the public example RSIN.
const RSIN = '001469630';
const EORI = `NL${RSIN}`;
const VAT = `NL${RSIN}B01`;
const DE_EORI = 'DE123456789012345';

const model = loadDistModel();
const engine = createEngine(model);

const RANK: Record<string, number> = { certain: 3, likely: 2, possible: 1 };

function weakest(steps: readonly Step[]): string {
  return steps.reduce(
    (low, step) => ((RANK[step.certainty] ?? 0) < (RANK[low] ?? 0) ? step.certainty : low),
    'certain',
  );
}

function sourceIds(steps: readonly Step[]): string[] {
  return steps.flatMap((step) => (step.source === null ? [] : [step.source.id]));
}

describe('SPEC §10 EORI acceptance case', () => {
  // SPEC §10 note: "RSIN 001469630 passes the elfproef. Check this in the test."
  test('the RSIN passes the elfproef through the kernel and through the rsin format', () => {
    expect(elfproef(RSIN)).toBe(true);
    const rsin = model.schemes.rsin;
    expect(rsin?.format).toBeDefined();
    const result = checkValue(rsin?.format ?? {}, RSIN);
    expect(result.accepted).toBe(true);
    expect(result.checksums).toEqual(['pass']);
  });

  // SPEC §10 rows "issued by Dutch Customs" and "verify via the EU validation", certain.
  // Sources: commission-eori and douane-eori-nl (the issuer authority), eori-validation.
  test('the EORI is issued by the Dutch Customs instance and verifiable through the EU validation, both certain', () => {
    const result = engine.derive(EORI, 'eori');
    const issued = result.conclusions.find((each) => each.key === 'derive.issued-by');
    expect(issued?.params.authority).toBe('douane-nl');
    expect(issued?.certainty).toBe('certain');
    const ids = sourceIds(issued?.explanation ?? []);
    expect(ids).toContain('commission-eori');
    expect(ids).toContain('douane-eori-nl');

    const verify = result.conclusions.find((each) => each.key === 'derive.verify-through');
    expect(verify?.params.source).toBe('eori-validation');
    expect(verify?.certainty).toBe('certain');
  });

  // SPEC §10 row "associated RSIN 001469630, likely, assumption legal person".
  // Source: rule rsin-from-eori-nl (douane-eori-nl); the assumption is the caller-less default.
  test('the EORI derives the RSIN at likely through rsin-from-eori-nl, resting on the legal-person assumption', () => {
    const result = engine.derive(EORI, 'eori');
    const rsin = result.data.find((each) => each.scheme === 'rsin');
    expect(rsin?.value).toBe(RSIN);
    expect(rsin?.rules).toEqual(['rsin-from-eori-nl']);
    expect(rsin?.certainty).toBe('likely');
    expect(rsin?.certainty).toBe(weakest(rsin?.explanation ?? []));
    const assumptions = (rsin?.explanation ?? []).filter((step) => step.kind === 'assumption');
    expect(assumptions).toHaveLength(1);
    expect(assumptions[0]?.condition).toEqual({ entity_form: 'legal-person' });
    expect(assumptions[0]?.source).toBeNull();
    // The derived value is checked through the kernel: the output step is the RSIN checksum.
    expect((rsin?.explanation ?? []).some((step) => step.ref === 'rsin/checksum/0')).toBe(true);
  });

  // SPEC §10 row "look-up via the RSIN in the Handelsregister, certain, reference".
  // Source: rsin.validation_source (kvk-zoeken); a reference, never a lookup.
  test('the derived RSIN is a look-up reference through kvk-zoeken at certain, not a lookup', () => {
    const result = engine.derive(EORI, 'eori');
    const lookup = result.conclusions.find(
      (each) => each.key === 'derive.look-up-through' && each.params.scheme === 'rsin',
    );
    expect(lookup?.params.source).toBe('kvk-zoeken');
    expect(lookup?.certainty).toBe('certain');
    expect(lookup?.statement).toContain('reference, not a lookup');
  });

  // SPEC §10 rows "associated VAT number" and "top-level legal person level" have no source in
  // the model (DEC-050): they are asserted absent, never as expected output.
  test('no derivation outputs a Dutch VAT number and no conclusion names an EORI level (DEC-050)', () => {
    const result = engine.derive(EORI, 'eori');
    expect(result.data.some((each) => each.scheme === 'vat-nl' || each.scheme === 'vat')).toBe(
      false,
    );
    for (const each of result.conclusions) {
      expect(each.key).not.toMatch(/level/i);
      expect(each.statement).not.toMatch(/level/i);
      for (const param of Object.values(each.params)) expect(param).not.toMatch(/level/i);
    }
    expect(engine.describe('eori').data?.level).toEqual([]);
  });

  // SPEC §10 row "check: the three pairs are consistent with rule and certainty".
  // Sources: rsin-from-vat-nl (ondernemersplein-btw-vermelden), eori-nl-from-rsin and
  // rsin-from-eori-nl (douane-eori-nl).
  test('check gives three consistent findings at likely, each with its rules and rule sources', () => {
    const result = engine.check([EORI, VAT, RSIN]);
    expect(result.data).toHaveLength(3);
    for (const finding of result.data) {
      expect(finding.outcome).toBe('consistent');
      expect(finding.certainty).toBe('likely');
      expect(finding.certainty).toBe(weakest(finding.explanation));
    }
    const expected: [string[], string[]][] = [
      [
        ['rsin-from-vat-nl', 'eori-nl-from-rsin'],
        ['ondernemersplein-btw-vermelden', 'douane-eori-nl'],
      ],
      [['rsin-from-eori-nl'], ['douane-eori-nl']],
      [['rsin-from-vat-nl'], ['ondernemersplein-btw-vermelden']],
    ];
    result.data.forEach((finding, index) => {
      const [rules, sources] = expected[index] ?? [[], []];
      expect(finding.rules).toEqual(rules);
      const ruleSteps = finding.explanation.filter((step) => step.kind === 'rule');
      expect(ruleSteps.map((step) => step.ref)).toEqual(rules);
      for (const id of sources) expect(sourceIds(finding.explanation)).toContain(id);
    });
  });

  // SPEC §10 contrast: a DE EORI has no Dutch VAT number (DEC-050) and no RSIN (DEC-071).
  test('a DE-prefixed EORI derives no Dutch VAT number, no RSIN and no level', () => {
    const result = engine.derive(DE_EORI, 'eori');
    expect(result.data.some((each) => each.scheme === 'vat-nl')).toBe(false);
    expect(result.data.some((each) => each.scheme === 'rsin')).toBe(false);
    for (const each of result.conclusions) {
      expect(each.key).not.toMatch(/level/i);
      expect(each.statement).not.toMatch(/level/i);
    }
  });
});
