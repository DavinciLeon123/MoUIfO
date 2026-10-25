import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Host } from './engine-host.ts';
import type { Lang } from './i18n/text.ts';
import { UI_EN, type Ui } from './i18n/ui.en.ts';

/** What every component may read: the engine host and the language (always `en` until plan 07-04). */
export type AppValue = { host: Host; lang: Lang };

export const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp needs an AppContext provider');
  return value;
}

/** The UI dictionary of the current language. */
export function useUi(): Ui {
  useApp();
  return UI_EN;
}
