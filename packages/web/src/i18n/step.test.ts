// Handover findings, item 3: an explanation step leads with a plain phrase built from its kind, its
// ref and the model, never from an input value. The sweep over describe() of every scheme proves
// that the field map covers every ref the engine emits. Scheme ids and model labels only.
import { describe, expect, test } from 'vitest';
import { createHost, type Step } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { stepPhrase } from './step.ts';
import { fieldLabel, fill, type Lang, modelText } from './text.ts';
import { UI_EN } from './ui.en.ts';
import { UI_NL } from './ui.nl.ts';

const host = createHost(loadDistJson());
const UI = { en: UI_EN, nl: UI_NL } as const;

const step = (kind: Step['kind'], ref: string): Step => ({
  kind,
  ref,
  certainty: 'certain',
  source: null,
});

const phrase = (s: Step, lang: Lang) => stepPhrase(s, UI[lang], { host, lang });

function schemeLabel(id: string, lang: Lang): string {
  const scheme = host.model.schemes[id];
  if (scheme === undefined) throw new Error(`no scheme ${id}`);
  return modelText(scheme.label, lang).text;
}

describe('stepPhrase (handover findings, item 3)', () => {
  test('a fact about a field is the field label of the scheme', () => {
    expect(phrase(step('fact', 'vat/kind'), 'en')).toEqual({
      text: 'Type of VAT identification number',
      lang: 'en',
      marker: null,
    });
    expect(phrase(step('fact', 'vat/kind'), 'nl')).toEqual({
      text: 'Type van Btw-identificatienummer',
      lang: 'nl',
      marker: null,
    });
  });

  test('a role fact says what the scheme identifies', () => {
    expect(phrase(step('fact', 'vat/roles/0'), 'en').text).toBe(
      'What VAT identification number identifies',
    );
    expect(phrase(step('fact', 'vat/roles/0'), 'nl').text).toBe(
      'Wat Btw-identificatienummer identificeert',
    );
  });

  test.for(['en', 'nl'] as const)('a pattern step fills the template in %s', (lang) => {
    const expected = fill(UI[lang].stepAboutField, {
      field: fieldLabel('describe.pattern', lang),
      scheme: schemeLabel('eori', lang),
    });
    expect(phrase(step('pattern', 'eori/patterns/0'), lang).text).toBe(expected);
  });

  test('a rule step names the input and the output scheme of the rule', () => {
    const rule = Object.values(host.model.schemes)
      .flatMap((scheme) => scheme.rules ?? [])
      .find((each) => each.id === 'eori-nl-from-rsin');
    if (rule === undefined) throw new Error('rule missing');
    expect(phrase(step('rule', 'eori-nl-from-rsin'), 'en').text).toBe(
      `Rule from ${schemeLabel(rule.input, 'en')} to ${schemeLabel(rule.output, 'en')}`,
    );
  });

  test('context and assumption refs name the key', () => {
    expect(phrase(step('fact', 'ctx/issuing_country'), 'en').text).toBe(
      'Context you gave: issuing_country',
    );
    expect(phrase(step('assumption', 'eori-nl-from-rsin/condition/entity_form'), 'en').text).toBe(
      'Assumed condition: entity_form',
    );
    expect(phrase(step('assumption', 'eori-nl-from-rsin/condition/entity_form'), 'nl').text).toBe(
      'Aangenomen voorwaarde: entity_form',
    );
  });

  test('an authority, a jurisdiction and a country prefix are named', () => {
    const [authorityId] = Object.keys(host.model.authorities);
    const authority = host.model.authorities[authorityId ?? ''];
    if (authorityId === undefined || authority === undefined) throw new Error('no authority');
    expect(phrase(step('fact', `authorities/${authorityId}`), 'en').text).toBe(
      `Issuing authority ${modelText(authority.label, 'en').text}`,
    );
    const nl = host.model.jurisdictions.NL;
    if (nl === undefined) throw new Error('no NL');
    expect(phrase(step('fact', 'jurisdictions/NL/part_of/0'), 'en').text).toBe(
      `Jurisdiction ${modelText(nl.label, 'en').text}`,
    );
    expect(phrase(step('fact', 'vocab/country-prefix/NL'), 'en').text).toBe('Country prefix NL');
  });

  test('an unknown ref shape gives the fallback phrase, never the ref', () => {
    for (const ref of [
      'vocab/applicability-status/stated/inherits_down',
      'no-such-scheme/kind',
      'constructor/kind',
      '__proto__/kind',
      'vat/no-such-field',
    ]) {
      const rendered = phrase(step('fact', ref), 'en');
      expect(rendered.text, ref).toBe(UI_EN.stepModelFact);
      expect(rendered.text).not.toContain(ref);
    }
  });

  test('in Dutch a scheme with a Dutch label uses it, unmarked (DEC-081)', () => {
    const lei = host.model.schemes.lei;
    expect(lei).toBeDefined();
    const nl = lei?.label.nl;
    expect(nl).toBeDefined();
    const rendered = phrase(step('fact', 'lei/kind'), 'nl');
    expect(rendered.marker).toBeNull();
    expect(rendered.text).toContain(nl);
  });

  test('in Dutch a scheme without a Dutch label falls back to its English label, marked en', () => {
    const copy = structuredClone(loadDistJson()) as {
      schemes: Record<string, { label: { en: string; nl?: string } } | undefined>;
    };
    const lei = copy.schemes.lei;
    if (lei === undefined) throw new Error('no scheme lei');
    delete lei.label.nl;
    const without = createHost(copy);
    const rendered = stepPhrase(step('fact', 'lei/kind'), UI_NL, { host: without, lang: 'nl' });
    expect(rendered.marker).toBe('en');
    expect(rendered.text).toContain(lei.label.en);
  });

  test.for(['en', 'nl'] as const)(
    'sweep over describe() of every scheme in %s: no phrase is its ref or the fallback',
    (lang) => {
      const problems: string[] = [];
      let steps = 0;
      for (const id of Object.keys(host.model.schemes)) {
        for (const conclusion of host.engine.describe(id).conclusions) {
          for (const each of conclusion.explanation) {
            steps += 1;
            const { text } = phrase(each, lang);
            if (text === each.ref || text.includes(each.ref)) problems.push(`${each.ref}: ${text}`);
            const first = each.ref.split('/')[0] ?? '';
            if (
              each.kind !== 'assumption' &&
              Object.hasOwn(host.model.schemes, first) &&
              text === UI[lang].stepModelFact
            ) {
              problems.push(`fallback for ${each.ref}`);
            }
          }
        }
      }
      expect(steps).toBeGreaterThan(50);
      expect(problems.slice(0, 5)).toEqual([]);
    },
  );
});
