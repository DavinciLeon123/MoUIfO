// D-10 and D-11 (as amended by DEC-078): how the page language is chosen and how model text follows
// it. resolveLang and langSearch are pure, so the whitelist (English unless an explicit ?lang=nl,
// DEC-078) and the odd or repeated values of a shared link (T-07-10) are pinned here; the browser
// behaviour is in e2e/i18n.e2e.ts.
import { describe, expect, test } from 'vitest';
import { modelText } from './i18n/text.ts';
import { langSearch, resolveLang } from './lang.ts';

describe('resolveLang', () => {
  test('?lang=nl gives nl and ?lang=en gives en', () => {
    expect(resolveLang('?lang=nl')).toBe('nl');
    expect(resolveLang('?lang=en')).toBe('en');
  });

  test('no parameter gives en: the browser language is no input any more (DEC-078)', () => {
    expect(resolveLang('')).toBe('en');
    expect(resolveLang('?')).toBe('en');
  });

  test('only an exact en or nl counts; any other value gives en', () => {
    for (const search of [
      '?lang=NL',
      '?lang=de',
      '?lang=',
      '?lang=%00nl',
      '?lang=nl%20',
      '?other=nl',
      '?lang=__proto__',
      '?lang[]=nl',
      '??lang=nl',
      'lang=nl',
    ]) {
      expect(resolveLang(search), search).toBe('en');
    }
  });

  test('a repeated parameter uses the first value', () => {
    expect(resolveLang('?lang=nl&lang=en')).toBe('nl');
    expect(resolveLang('?lang=en&lang=nl')).toBe('en');
    expect(resolveLang('?lang=xx&lang=nl')).toBe('en');
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
