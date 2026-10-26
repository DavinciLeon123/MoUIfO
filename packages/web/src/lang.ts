import type { Lang } from './i18n/text.ts';

/**
 * D-11: the language of the page. `?lang=` counts only when it is exactly `en` or `nl` (the first
 * value when it is repeated); otherwise a browser language that starts with `nl` gives Dutch and
 * anything else, including no language at all, gives English. The raw parameter is never returned,
 * rendered or echoed, so a shared link cannot put its own text on the page.
 */
export function resolveLang(search: string, navigatorLanguage: string | undefined): Lang {
  const asked = new URLSearchParams(search).get('lang');
  if (asked === 'en' || asked === 'nl') return asked;
  return navigatorLanguage?.toLowerCase().startsWith('nl') === true ? 'nl' : 'en';
}

/** The query string that carries the language: the only parameter the site ever writes (D-11). */
export function langSearch(lang: Lang): string {
  return lang === 'nl' ? '?lang=nl' : '?lang=en';
}
