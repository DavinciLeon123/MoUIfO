import type { Step } from '../engine-host.ts';
import { fieldLabel, fill, modelText, type Rendered, type TextContext } from './text.ts';
import type { Ui } from './ui.en.ts';

/*
 * The plain phrase of an explanation step (handover test findings, item 3). It is built only from
 * the step's kind and ref (a model path, DEC-070) and the model's labels, never from an input value,
 * so a step row cannot show what was pasted. The raw ref stays visible in a secondary detail.
 */

/** The ref segment after the scheme id, mapped to the describe key whose label names the field. */
const FIELD: Readonly<Record<string, string>> = {
  kind: 'describe.kind',
  issuer: 'describe.issuer',
  jurisdiction: 'describe.jurisdiction',
  abbreviation: 'describe.abbreviation',
  availability: 'describe.availability',
  iso6523_icd: 'describe.iso6523-icd',
  peppol_eas: 'describe.peppol-eas',
  legal_basis: 'describe.legal-basis',
  validation_source: 'describe.validation-source',
  mandatory: 'describe.mandatory',
  level: 'describe.level',
  applicability: 'describe.applicability',
  persistence: 'describe.persistence',
  trust: 'describe.trust',
  relations: 'describe.relation',
  patterns: 'describe.pattern',
  checksum: 'describe.checksum',
  components: 'describe.component',
  context_from: 'describe.context-from',
};

function own<T>(record: Readonly<Record<string, T>>, id: string): T | undefined {
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/** The label of a model entry in the page language, noting when Dutch had to use English. */
function labelled(
  text: Parameters<typeof modelText>[0],
  ctx: TextContext,
  used: { english: boolean },
): string {
  const rendered = modelText(text, ctx.lang);
  if (rendered.marker === 'en') used.english = true;
  return rendered.text;
}

export function stepPhrase(step: Step, ui: Ui, ctx: TextContext): Rendered {
  const { model } = ctx.host;
  const used = { english: false };
  const done = (text: string): Rendered => ({
    text,
    lang: ctx.lang,
    marker: used.english ? 'en' : null,
  });
  const segments = step.ref.split('/');
  const first = segments[0] ?? '';
  const second = segments[1] ?? '';

  if (step.kind === 'rule') {
    for (const scheme of Object.values(model.schemes)) {
      const rule = scheme.rules?.find((each) => each.id === step.ref);
      if (rule === undefined) continue;
      const input = own(model.schemes, rule.input);
      const output = own(model.schemes, rule.output);
      return done(
        fill(ui.stepRuleFromTo, {
          input: input === undefined ? rule.input : labelled(input.label, ctx, used),
          output: output === undefined ? rule.output : labelled(output.label, ctx, used),
        }),
      );
    }
  }
  if (first === 'ctx' && second !== '') return done(fill(ui.stepGivenContext, { key: second }));
  const condition = segments.indexOf('condition');
  if (condition > 0 && segments[condition + 1] !== undefined) {
    return done(fill(ui.stepAssumedCondition, { key: segments[condition + 1] ?? '' }));
  }
  if (first === 'authorities') {
    const authority = own(model.authorities, second);
    if (authority !== undefined) {
      return done(fill(ui.stepAuthority, { authority: labelled(authority.label, ctx, used) }));
    }
  }
  if (first === 'jurisdictions') {
    const jurisdiction = own(model.jurisdictions, second);
    if (jurisdiction !== undefined) {
      return done(
        fill(ui.stepJurisdiction, { jurisdiction: labelled(jurisdiction.label, ctx, used) }),
      );
    }
  }
  if (first === 'vocab' && second === 'country-prefix' && segments[2] !== undefined) {
    return done(fill(ui.stepCountryPrefix, { prefix: segments[2] }));
  }
  const scheme = own(model.schemes, first);
  if (scheme !== undefined) {
    const name = labelled(scheme.label, ctx, used);
    if (second === 'roles') return done(fill(ui.stepAboutRoles, { scheme: name }));
    const key = own(FIELD, second);
    if (key !== undefined) {
      return done(fill(ui.stepAboutField, { field: fieldLabel(key, ctx.lang), scheme: name }));
    }
  }
  return done(ui.stepModelFact);
}
