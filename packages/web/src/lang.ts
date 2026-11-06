import type { Lang } from './i18n/text.ts';

/**
 * D-11 as amended by DEC-078: the language of the page is English unless the query string has an
 * explicit `?lang=nl`, whatever the browser language, until the Dutch model text is complete.
 * `lang` counts only when it is exactly `en` or `nl` (the first value when it is repeated) in a
 * query string that starts with `?`, as `location.search` does. The raw parameter is never
 * returned, rendered or echoed, so a shared link cannot put its own text on the page.
 */
export function resolveLang(search: string): Lang {
  if (!search.startsWith('?')) return 'en';
  const asked = new URLSearchParams(search).get('lang');
  return asked === 'nl' ? 'nl' : 'en';
}

/** The query string that carries the language: the only parameter the site ever writes (D-11). */
export function langSearch(lang: Lang): string {
  return lang === 'nl' ? '?lang=nl' : '?lang=en';
}
