import type { Certainty, Conclusion, Host, Text, Warning } from '../engine-host.ts';

export type Lang = 'en' | 'nl';

/** A rendered line of engine or model text, the language it is in and whether it needs a marker. */
export type Rendered = { text: string; lang: Lang; marker: 'en' | 'untranslated' | null };

/** What a renderer needs besides the conclusion: the host, the language and the result data. */
export type TextContext = { host: Host; lang: Lang; data?: unknown };

/**
 * English shows the engine's own sentence, unchanged. Dutch (D-09) shows that same English
 * sentence, marked as not translated, until a dictionary entry exists for its key.
 */
export function conclusionText(conclusion: Conclusion, ctx: TextContext): Rendered {
  if (ctx.lang === 'en') return { text: conclusion.statement, lang: 'en', marker: null };
  return { text: conclusion.statement, lang: 'en', marker: 'untranslated' };
}

export function warningText(warning: Warning, ctx: TextContext): Rendered {
  if (ctx.lang === 'en') return { text: warning.message, lang: 'en', marker: null };
  return { text: warning.message, lang: 'en', marker: 'untranslated' };
}

/**
 * D-10: a model text in the page language. Dutch mode uses `nl` when the model has it; otherwise the
 * English text is returned as it is, marked `en` (never hidden, never machine-translated).
 */
export function modelText(text: Text, lang: Lang): Rendered {
  if (lang === 'nl') {
    if (text.nl !== undefined) return { text: text.nl, lang: 'nl', marker: null };
    return { text: text.en, lang: 'en', marker: 'en' };
  }
  return { text: text.en, lang: 'en', marker: null };
}

/** The certainty word of the model's certainty vocabulary; the id itself when it is missing. */
export function certaintyLabel(id: Certainty | string, ctx: TextContext): string {
  const member = ctx.host.model.vocab.certainty?.values.find((entry) => entry.id === id);
  const label = member?.label;
  return (ctx.lang === 'nl' ? label?.nl : undefined) ?? label?.en ?? id;
}

/** Put values into a `{name}` template; an unknown name stays as written. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}
