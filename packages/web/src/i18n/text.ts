import type { Certainty, Conclusion, Host, Text, Warning } from '../engine-host.ts';
import { ENGINE_NL } from './engine.nl.ts';
import type { ConclusionKey, EngineContext, EngineDictionary, WarningCode } from './engine-keys.ts';

export type Lang = 'en' | 'nl';

/** A rendered line of engine or model text, the language it is in and whether it needs a marker. */
export type Rendered = { text: string; lang: Lang; marker: 'en' | 'untranslated' | null };

/** What a renderer needs besides the conclusion: the host, the language and the result data. */
export type TextContext = { host: Host; lang: Lang; data?: unknown };

const DUTCH: EngineDictionary = ENGINE_NL;

/** The context a Dutch renderer reads, and whether its `label` had to use English (D-10). */
function dutchContext(ctx: TextContext): { engine: EngineContext; usedEnglish: () => boolean } {
  let used = false;
  const label = (text: Text): string => {
    if (text.nl !== undefined) return text.nl;
    used = true;
    return text.en;
  };
  return { engine: { host: ctx.host, data: ctx.data, label }, usedEnglish: () => used };
}

/** The English text of an engine line, marked as not translated (D-09). */
function untranslated(english: string): Rendered {
  return { text: english, lang: 'en', marker: 'untranslated' };
}

/**
 * English shows the engine's own sentence, unchanged. Dutch (D-09) renders the dictionary entry of
 * the conclusion's key from its params, the call's data and the model; a key without an entry, or
 * an entry that cannot render this conclusion, shows the English sentence marked as not translated.
 * A sentence that had to use an English model label is Dutch with the `en` marker (D-10).
 */
export function conclusionText(conclusion: Conclusion, ctx: TextContext): Rendered {
  if (ctx.lang === 'en') return { text: conclusion.statement, lang: 'en', marker: null };
  if (!Object.hasOwn(DUTCH.conclusions, conclusion.key)) return untranslated(conclusion.statement);
  const entry = DUTCH.conclusions[conclusion.key as ConclusionKey];
  try {
    const { engine, usedEnglish } = dutchContext(ctx);
    const text = entry.render(conclusion, engine);
    return { text, lang: 'nl', marker: usedEnglish() ? 'en' : null };
  } catch {
    return untranslated(conclusion.statement);
  }
}

export function warningText(warning: Warning, ctx: TextContext): Rendered {
  if (ctx.lang === 'en') return { text: warning.message, lang: 'en', marker: null };
  if (!Object.hasOwn(DUTCH.warnings, warning.code)) return untranslated(warning.message);
  const entry = DUTCH.warnings[warning.code as WarningCode];
  try {
    const { engine, usedEnglish } = dutchContext(ctx);
    const text = entry.render(warning, engine);
    return { text, lang: 'nl', marker: usedEnglish() ? 'en' : null };
  } catch {
    return untranslated(warning.message);
  }
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
