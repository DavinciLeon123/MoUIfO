import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ExternalLink } from './components/conclusion.tsx';
import { AppContext, useApp, useUi } from './context.ts';
import type { Host } from './engine-host.ts';
import { fill, type Lang, modelText } from './i18n/text.ts';
import { langSearch, resolveLang } from './lang.ts';
import { normalise } from './model/normalise.ts';
import { type PasteRun, runPaste } from './model/paste.ts';
import { createVerifyIndex } from './model/verify.ts';
import { parseRoute, type Route, routeHref } from './router.ts';
import { PasteView } from './views/paste.tsx';
import { RelateView } from './views/relate.tsx';
import { NotInModelView, SchemeDetailView } from './views/scheme-detail.tsx';
import { SchemesView } from './views/schemes.tsx';

/** DEC-024: the licence of the model content the bundle carries. */
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const LICENCE_HOST = new URL(LICENCE_URL).host;

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

  // The title of the view plus the site name in the page language; never a pasted value, and an
  // unknown address is not echoed (T-07-13).
  const scheme =
    route.view === 'scheme' && Object.hasOwn(host.model.schemes, route.id)
      ? host.model.schemes[route.id]
      : undefined;
  const viewTitle =
    route.view === 'schemes'
      ? ui.schemesHeading
      : route.view === 'relate'
        ? ui.relateHeading
        : route.view === 'unknown'
          ? ui.notInModelTitle
          : scheme === undefined
            ? null
            : modelText(scheme.label, lang).text;
  const documentTitle = viewTitle === null ? ui.title : `${viewTitle} | ${ui.title}`;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = documentTitle;
  }, [lang, documentTitle]);

  // WCAG 2.4.3: after a navigation focus moves to the new view's h1 (not on the first load, so the
  // browser's own focus handling of a fresh page is left alone).
  const mainRef = useRef<HTMLElement>(null);
  const routeKey = route.view === 'scheme' ? `scheme/${route.id}` : route.view;
  const shown = useRef(routeKey);
  useEffect(() => {
    if (shown.current === routeKey) return;
    shown.current = routeKey;
    mainRef.current?.querySelector('h1')?.focus();
  }, [routeKey]);

  const other: Lang = lang === 'nl' ? 'en' : 'nl';
  return (
    <>
      <header>
        <nav aria-label={ui.navLabel}>
          <a
            href={routeHref({ view: 'paste' })}
            aria-current={route.view === 'paste' ? 'page' : undefined}
          >
            {ui.navPaste}
          </a>
          <a
            href={routeHref({ view: 'schemes' })}
            aria-current={
              route.view === 'schemes' ? 'page' : route.view === 'scheme' ? 'true' : undefined
            }
          >
            {ui.navSchemes}
          </a>
        </nav>
        <button type="button" lang={other} onClick={() => onLang(other)}>
          {other === 'nl' ? 'Nederlands' : 'English'}
        </button>
      </header>
      <main ref={mainRef}>
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
        ) : route.view === 'relate' ? (
          <RelateView a={route.a} b={route.b} />
        ) : (
          <NotInModelView />
        )}
      </main>
      <footer>
        <p>
          <span lang="en">{ui.credit}</span> {ui.licenceLead}{' '}
          <ExternalLink href={LICENCE_URL}>
            {fill(ui.sourceLink, { title: 'CC BY 4.0', host: LICENCE_HOST })}
          </ExternalLink>
        </p>
      </footer>
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
  return (
    <AppContext.Provider value={{ host, lang, verify }}>
      <Page route={route} onLang={switchTo} />
    </AppContext.Provider>
  );
}
