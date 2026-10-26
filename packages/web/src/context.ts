import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Host } from './engine-host.ts';
import type { Lang } from './i18n/text.ts';
import { UI_EN, type Ui } from './i18n/ui.en.ts';
import { UI_NL } from './i18n/ui.nl.ts';
import type { VerifyIndex } from './model/verify.ts';

/**
 * What every component may read: the engine host, the language (D-11, in memory only) and the
 * sourced register links, built once per host.
 */
export type AppValue = { host: Host; lang: Lang; verify: VerifyIndex };

export const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp needs an AppContext provider');
  return value;
}

/** The UI dictionary of the current language. */
export function useUi(): Ui {
  return useApp().lang === 'nl' ? UI_NL : UI_EN;
}
