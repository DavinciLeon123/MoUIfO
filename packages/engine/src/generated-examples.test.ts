import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { checkValue } from './format.ts';
import type { Rule, Scheme } from './model-types.ts';
import { loadDistModel } from './testing/load-model.ts';

// Tests generated from the model (ENG-14, D-15, DEC-039, DEC-065). Every `examples_valid`,
// `examples_invalid` and rule `examples` entry of dist/model.json becomes one case, and adding an
// example to a scheme file adds a test with no code change. Test names carry scheme ids, field names
// and indices only, and assertions compare booleans and ids, so a failure prints no value.

const model = loadDistModel();
const engine = createEngine(model);

const WRAPPER = 'iso6523-actorid-upis::';

type ExampleCase = { name: string; scheme: string; index: number; value: string };
type RuleCase = {
  name: string;
  rule: string;
  input: string;
  output: string;
  from: string;
  to: string;
};
type PeppolCase = { name: string; prefix: string; component: string; value: string };

const schemes: [string, Scheme][] = Object.entries(model.schemes);

function examplesOf(field: 'examples_valid' | 'examples_invalid'): ExampleCase[] {
  return schemes.flatMap(([id, scheme]) =>
    (scheme.format?.[field] ?? []).map((value, index) => ({
      name: `${id} ${field}[${index}]`,
      scheme: id,
      index,
      value,
    })),
  );
}

const validCases = examplesOf('examples_valid');
const invalidCases = examplesOf('examples_invalid');

const rules: Rule[] = schemes.flatMap(([, scheme]) => [...(scheme.rules ?? [])]);
const ruleCases: RuleCase[] = rules.flatMap((rule) =>
  (rule.examples ?? []).map((each, index) => ({
    name: `rule ${rule.id} example[${index}]`,
    rule: rule.id,
    input: rule.input,
    output: rule.output,
    from: each.in,
    to: each.out,
  })),
);

// Peppol: each declared component whose scheme has a valid example, wrapped at runtime.
const peppolCases: PeppolCase[] = (model.schemes['peppol-id']?.components ?? []).flatMap(
  (component) => {
    const example = model.schemes[component.scheme]?.format?.examples_valid?.[0];
    if (example === undefined) return [];
    return [
      {
        name: `peppol component ${component.prefix}`,
        prefix: component.prefix,
        component: component.scheme,
        value: `${WRAPPER}${component.prefix}:${example}`,
      },
    ];
  },
);

function kernelAccepts(schemeId: string, value: string): boolean {
  const scheme = model.schemes[schemeId];
  if (scheme?.format === undefined) return false;
  return checkValue(scheme.format, value).accepted;
}

describe('generated: examples_valid', () => {
  test('the model has valid examples to generate from', () => {
    expect(validCases.length).toBeGreaterThan(0);
  });

  test.for(validCases)('$name: recognised as its scheme, accepted, equal to the kernel', (each) => {
    const candidate = engine.recognise(each.value).data.find((c) => c.scheme === each.scheme);
    expect(candidate).toBeDefined();
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.accepted).toBe(kernelAccepts(each.scheme, each.value));
  });
});

describe('generated: examples_invalid', () => {
  test('the model has invalid examples to generate from', () => {
    expect(invalidCases.length).toBeGreaterThan(0);
  });

  test.for(invalidCases)('$name: not accepted as its scheme, in line with the kernel', (each) => {
    const kernel = kernelAccepts(each.scheme, each.value);
    expect(kernel).toBe(false);
    const candidate = engine.recognise(each.value).data.find((c) => c.scheme === each.scheme);
    if (candidate !== undefined) {
      expect(candidate.accepted).toBe(false);
      expect(candidate.accepted).toBe(kernel);
    }
  });
});

describe('generated: rule examples', () => {
  test('the model has rule examples to generate from', () => {
    expect(ruleCases.length).toBeGreaterThan(0);
  });

  test.for(ruleCases)('$name: derive gives the output through the rule', (each) => {
    // The rule's own derivation: its output scheme, its example output, the rule first (DEC-067).
    // No certainty is asserted here; the certainty of a derivation is tested where it is sourced.
    const result = engine.derive(each.from, each.input);
    const found = result.data.find(
      (derivation) =>
        derivation.scheme === each.output &&
        derivation.rules[0] === each.rule &&
        derivation.value === each.to,
    );
    expect(found !== undefined).toBe(true);
  });
});

describe('generated: Peppol components (DEC-065)', () => {
  test('the model has Peppol components with a valid example', () => {
    expect(peppolCases.length).toBeGreaterThan(0);
  });

  test.for(peppolCases)('$name: delegated to its component scheme, accepted', (each) => {
    const candidate = engine.recognise(each.value).data.find((c) => c.scheme === 'peppol-id');
    expect(candidate).toBeDefined();
    expect(candidate?.accepted).toBe(true);
    expect(candidate?.components).toHaveLength(1);
    const match = candidate?.components?.[0];
    expect(match?.prefix).toBe(each.prefix);
    expect(match?.scheme).toBe(each.component);
    const nested = match?.candidates.find((c) => c.scheme === each.component);
    expect(nested?.accepted).toBe(true);
  });

  const own = (model.schemes['peppol-id']?.format?.examples_valid ?? []).map((value, index) => ({
    name: `peppol-id examples_valid[${index}]`,
    value,
  }));

  test.for(own)(
    '$name: a prefix the model does not delegate gives unknown-component-prefix',
    (each) => {
      const declared = new Set(
        (model.schemes['peppol-id']?.components ?? []).map((component) => component.prefix),
      );
      const prefix = each.value.slice(each.value.lastIndexOf('::') + 2).split(':')[0] ?? '';
      const result = engine.recognise(each.value);
      const candidate = result.data.find((c) => c.scheme === 'peppol-id');
      expect(candidate?.accepted).toBe(true);
      const codes = result.warnings.map((warning) => warning.code);
      expect(codes.includes('unknown-component-prefix')).toBe(!declared.has(prefix));
    },
  );
});

// The collision matrix (Pitfall 12): several schemes share a pattern, so the sets of candidates and
// of accepted candidates are asserted, never the first element. Each representative is an example of
// the model, read by scheme and index.
type Collision = {
  scheme: string;
  index: number;
  candidates: string[];
  accepted: string[];
};

const COLLISIONS: Collision[] = [
  { scheme: 'kvk-number', index: 0, candidates: ['kvk-number'], accepted: ['kvk-number'] },
  {
    scheme: 'rsin',
    index: 0,
    candidates: ['bsn', 'duns', 'fi-number', 'rsin'],
    accepted: ['bsn', 'duns', 'fi-number', 'rsin'],
  },
  {
    scheme: 'duns',
    index: 0,
    candidates: ['bsn', 'duns', 'fi-number', 'rsin'],
    accepted: ['duns'],
  },
  {
    scheme: 'kvk-establishment-number',
    index: 0,
    candidates: ['kvk-establishment-number'],
    accepted: ['kvk-establishment-number'],
  },
  { scheme: 'gln', index: 0, candidates: ['gln'], accepted: ['gln'] },
  { scheme: 'oin', index: 0, candidates: ['lei', 'oin'], accepted: ['oin'] },
  { scheme: 'oin', index: 1, candidates: ['lei', 'oin'], accepted: ['oin'] },
  { scheme: 'lei', index: 0, candidates: ['lei'], accepted: ['lei'] },
  { scheme: 'eori', index: 0, candidates: ['eori', 'vat'], accepted: ['eori', 'vat'] },
  {
    scheme: 'vat-nl',
    index: 0,
    candidates: ['eori', 'vat', 'vat-nl'],
    accepted: ['eori', 'vat', 'vat-nl'],
  },
  { scheme: 'euid', index: 0, candidates: ['euid'], accepted: ['euid'] },
  { scheme: 'peppol-id', index: 0, candidates: ['peppol-id'], accepted: ['peppol-id'] },
];

describe('generated: collision matrix', () => {
  test.for(
    COLLISIONS.map((each) => ({ ...each, name: `${each.scheme} examples_valid[${each.index}]` })),
  )('$name: the candidate and accepted scheme sets', (each) => {
    const value = model.schemes[each.scheme]?.format?.examples_valid?.[each.index];
    expect(value).toBeDefined();
    const result = engine.recognise(value ?? '');
    const candidates = result.data.map((c) => c.scheme).sort();
    const accepted = result.data
      .filter((c) => c.accepted)
      .map((c) => c.scheme)
      .sort();
    expect(candidates).toEqual([...each.candidates].sort());
    expect(accepted).toEqual([...each.accepted].sort());
  });
});

describe('generated: coverage', () => {
  const countOf = (field: 'examples_valid' | 'examples_invalid'): number =>
    Object.values(model.schemes).reduce(
      (total, scheme) => total + (scheme.format?.[field]?.length ?? 0),
      0,
    );
  const ruleExamples = Object.values(model.schemes).reduce(
    (total, scheme) =>
      total + (scheme.rules ?? []).reduce((sum, rule) => sum + (rule.examples?.length ?? 0), 0),
    0,
  );

  test('every examples_valid entry is one generated case', () => {
    expect(validCases).toHaveLength(countOf('examples_valid'));
  });

  test('every examples_invalid entry is one generated case', () => {
    expect(invalidCases).toHaveLength(countOf('examples_invalid'));
  });

  test('every rule example is one generated case', () => {
    expect(ruleCases).toHaveLength(ruleExamples);
  });

  test('every generated case has its own name, and no name holds a nine-digit run', () => {
    const names = [...validCases, ...invalidCases, ...ruleCases, ...peppolCases].map(
      (each) => each.name,
    );
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(/\d{5}/.test(name)).toBe(false);
  });
});
