// D-10 and D-11: how the page language is chosen and how model text follows it. resolveLang and
// langSearch are pure, so the whitelist, the browser fallback and the odd or repeated values of a
// shared link (T-07-10) are pinned here; the browser behaviour is in e2e/i18n.e2e.ts.
import { describe, expect, test } from 'vitest';
import { modelText } from './i18n/text.ts';
import { langSearch, resolveLang } from './lang.ts';

describe('resolveLang', () => {
  test('?lang=nl gives nl and ?lang=en gives en, whatever the browser says', () => {
    for (const navigatorLanguage of ['en-US', 'nl-NL', 'de-DE', undefined]) {
      expect(resolveLang('?lang=nl', navigatorLanguage)).toBe('nl');
      expect(resolveLang('?lang=en', navigatorLanguage)).toBe('en');
    }
  });

  test('a Dutch browser language gives nl, anything else gives en', () => {
    for (const navigatorLanguage of ['nl', 'nl-NL', 'nl-BE', 'NL-nl']) {
      expect(resolveLang('', navigatorLanguage)).toBe('nl');
    }
    for (const navigatorLanguage of ['en-US', 'de-DE', 'fr', '', undefined]) {
      expect(resolveLang('', navigatorLanguage)).toBe('en');
    }
  });

  test('only an exact en or nl counts; any other value falls back to the browser', () => {
    expect(resolveLang('?lang=NL', 'en-US')).toBe('en');
    expect(resolveLang('?lang=NL', 'nl-NL')).toBe('nl');
    expect(resolveLang('?lang=de', 'en-US')).toBe('en');
    expect(resolveLang('?lang=de', 'nl-NL')).toBe('nl');
    expect(resolveLang('?lang=', 'en-US')).toBe('en');
    expect(resolveLang('?lang=%00nl', 'en-US')).toBe('en');
    expect(resolveLang('?lang=nl%20', 'en-US')).toBe('en');
    expect(resolveLang('?other=nl', 'en-US')).toBe('en');
  });

  test('a repeated parameter uses the first value, and the result is always en or nl', () => {
    expect(resolveLang('?lang=nl&lang=en', 'en-US')).toBe('nl');
    expect(resolveLang('?lang=en&lang=nl', 'nl-NL')).toBe('en');
    expect(resolveLang('?lang=xx&lang=nl', 'en-US')).toBe('en');
    for (const search of [
      '?lang=<script>',
      '?lang=__proto__',
      '?lang[]=nl',
      '??lang=nl',
      'lang=nl',
    ]) {
      expect(['en', 'nl']).toContain(resolveLang(search, undefined));
    }
  });
});

describe('langSearch', () => {
  test('returns exactly ?lang=en or ?lang=nl, the only parameter the site writes', () => {
    expect(langSearch('en')).toBe('?lang=en');
    expect(langSearch('nl')).toBe('?lang=nl');
  });
});

describe('modelText (D-10)', () => {
  test('in English it is the English text with no marker', () => {
    expect(modelText({ en: 'A' }, 'en')).toEqual({ text: 'A', lang: 'en', marker: null });
    expect(modelText({ en: 'A', nl: 'B' }, 'en')).toEqual({ text: 'A', lang: 'en', marker: null });
  });

  test('in Dutch it is the Dutch text when the model has it', () => {
    expect(modelText({ en: 'A', nl: 'B' }, 'nl')).toEqual({ text: 'B', lang: 'nl', marker: null });
  });

  test('in Dutch without a Dutch value it is the English text, tagged en and marked EN', () => {
    expect(modelText({ en: 'A' }, 'nl')).toEqual({ text: 'A', lang: 'en', marker: 'en' });
  });
});
