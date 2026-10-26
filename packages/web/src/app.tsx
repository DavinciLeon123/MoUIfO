import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppContext, useApp, useUi } from './context.ts';
import type { Host } from './engine-host.ts';
import { fill, type Lang } from './i18n/text.ts';
import { UI_EN } from './i18n/ui.en.ts';
import { UI_NL } from './i18n/ui.nl.ts';
import { langSearch, resolveLang } from './lang.ts';
import { normalise } from './model/normalise.ts';
import { type PasteRun, runPaste } from './model/paste.ts';
import { createVerifyIndex } from './model/verify.ts';
import { parseRoute, type Route } from './router.ts';
import { PasteView } from './views/paste.tsx';
import { NotInModelView, SchemeDetailView } from './views/scheme-detail.tsx';
import { SchemesView } from './views/schemes.tsx';

type Session = { lines: readonly string[]; declared: ReadonlyMap<number, string> };

/**
 * The page itself: in-memory state only, so no web storage, cookie or history entry, and the URL
 * carries nothing but the language (D-11).
 */
function Page({ route, onLang }: { route: Route; onLang: (lang: Lang) => void }) {
  const { host, lang } = useApp();
  const ui = useUi();
  const [text, setText] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [run, setRun] = useState<PasteRun | null>(null);
  // D-02: the one live region. Its text changes only when a run completes, never while typing.
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Clear first so that two runs with the same sentence are both announced. */
  const announce = (count: number) => {
    clearTimeout(timer.current);
    setStatus('');
    timer.current = setTimeout(
      () => setStatus(fill(count === 1 ? ui.resultsReadyOne : ui.resultsReady, { count })),
      50,
    );
  };

  /** The engine runs only here, on Explain or on a Treat as press, never while typing. */
  const execute = (next: Session) => {
    setSession(next);
    const result = runPaste(host.engine, next.lines, next.declared);
    setRun(result);
    announce(result.values.length);
  };
  // Explain starts from nothing declared (D-17): every gated value must be chosen again.
  const explain = () => execute({ lines: normalise(text), declared: new Map() });
  // Treat as reruns the same lines (the textarea may have changed since) with the choice added;
  // pressing the chosen scheme again takes the choice back.
  const treatAs = (position: number, scheme: string) => {
    if (session === null) return;
    const declared = new Map(session.declared);
    if (declared.get(position) === scheme) declared.delete(position);
    else declared.set(position, scheme);
    execute({ lines: session.lines, declared });
  };

  const other: Lang = lang === 'nl' ? 'en' : 'nl';
  return (
    <>
      <header>
        <button type="button" lang={other} onClick={() => onLang(other)}>
          {other === 'nl' ? 'Nederlands' : 'English'}
        </button>
      </header>
      <main>
        {route.view === 'paste' ? (
          <PasteView
            text={text}
            run={run}
            onText={setText}
            onExplain={explain}
            onTreatAs={treatAs}
          />
        ) : route.view === 'schemes' ? (
          <SchemesView />
        ) : route.view === 'scheme' ? (
          <SchemeDetailView id={route.id} />
        ) : (
          <NotInModelView />
        )}
      </main>
      <p role="status" aria-live="polite" class="visually-hidden">
        {status}
      </p>
    </>
  );
}

/** D-11: the language from `?lang=` or the browser, once; the toggle then switches it in memory. */
export function App({ host }: { host: Host }) {
  const verify = useMemo(() => createVerifyIndex(host), [host]);
  const [lang, setLang] = useState<Lang>(() => resolveLang(location.search, navigator.language));
  // Switching writes only `?lang=` and keeps the path and the hash; the page is not reloaded, so
  // the typed text and the results stay.
  const switchTo = (next: Lang) => {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${langSearch(next)}${location.hash}`,
    );
    setLang(next);
  };
  // The route lives in the hash (D-11): a hashchange re-parses it, the paste state stays in Page.
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash, host.model));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash, host.model));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [host]);
  const title = lang === 'nl' ? UI_NL.title : UI_EN.title;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title;
  }, [lang, title]);
  return (
    <AppContext.Provider value={{ host, lang, verify }}>
      <Page route={route} onLang={switchTo} />
    </AppContext.Provider>
  );
}
