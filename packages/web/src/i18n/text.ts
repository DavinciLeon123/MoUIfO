import type { Certainty, Conclusion, Host, Text, Warning } from '../engine-host.ts';

export type Lang = 'en' | 'nl';

/** A rendered line of engine or model text, the language it is in and whether it needs a marker. */
export type Rendered = { text: string; lang: Lang; marker: 'en' | 'untranslated' | null };

/** What a renderer needs besides the conclusion: the host, the language and the result data. */
export type TextContext = { host: Host; lang: Lang; data?: unknown };

/**
 * The English renderers (plan 07-04 adds the Dutch branches behind the same signatures). Engine
 * sentences are shown exactly as the engine wrote them.
 */
export function conclusionText(conclusion: Conclusion, _ctx: TextContext): Rendered {
  return { text: conclusion.statement, lang: 'en', marker: null };
}

export function warningText(warning: Warning, _ctx: TextContext): Rendered {
  return { text: warning.message, lang: 'en', marker: null };
}

export function modelText(text: Text, _lang: Lang): Rendered {
  return { text: text.en, lang: 'en', marker: null };
}

/** The certainty word of the model's certainty vocabulary; the id itself when it is missing. */
export function certaintyLabel(id: Certainty | string, ctx: TextContext): string {
  const member = ctx.host.model.vocab.certainty?.values.find((entry) => entry.id === id);
  return member?.label?.en ?? id;
}

/** Put values into a `{name}` template; an unknown name stays as written. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}
