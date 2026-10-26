import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ExternalLink } from './components/conclusion.tsx';
import { WALKTHROUGH_IDS } from './components/walkthrough.tsx';
import { AppContext, useApp, useUi } from './context.ts';
import type { Host } from './engine-host.ts';
import { fill, type Lang, modelText } from './i18n/text.ts';
import { langSearch, resolveLang } from './lang.ts';
import { WALKTHROUGH } from './model/guide.ts';
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
  const announce = (count: number, lead: string) => {
    clearTimeout(timer.current);
    setStatus('');
    timer.current = setTimeout(
      () =>
        setStatus(`${lead}${fill(count === 1 ? ui.resultsReadyOne : ui.resultsReady, { count })}`),
      50,
    );
  };

  /** The engine runs only here, on Explain or on a Treat as press, never while typing. */
  const execute = (next: Session, lead = '') => {
    setSession(next);
    const result = runPaste(host.engine, next.lines, next.declared);
    setRun(result);
    announce(result.values.length, lead);
  };
  /** The one run action (D-02): Explain, a Treat as press, a chip and a walkthrough step all run here. */
  const runLines = (
    lines: readonly string[],
    declared: ReadonlyMap<number, string> = new Map(),
    lead = '',
  ) => execute({ lines, declared }, lead);
  // Explain starts from nothing declared (D-17): every gated value must be chosen again.
  const explain = () => runLines(normalise(text));
  // A paste chip fills the box with its lines and runs at once. The chips vanish with the empty
  // state, so focus moves to the box now, before the button it was on is removed.
  const runPreset = (lines: readonly string[], declared: ReadonlyMap<number, string>) => {
    setText(lines.join('\n'));
    document.getElementById('values')?.focus();
    runLines(lines, declared);
  };

  // D-07: the walkthrough lives in memory only (no address, no storage). `step` is the 0-based
  // index into WALKTHROUGH, or null while the panel is closed; `walkthroughUsed` keeps the opener
  // on the page once the panel has been open, so Skip has an opener to return focus to.
  const [step, setStep] = useState<number | null>(null);
  const [walkthroughUsed, setWalkthroughUsed] = useState(false);
  const pendingFocus = useRef<string | null>(null);
  /**
   * Show a step: fill the box, declare as the step says and run through the same action as
   * Explain. The single live region says which step it is and then that the results are ready.
   */
  const goToStep = (index: number, focusId: string | null) => {
    const data = WALKTHROUGH[index];
    if (data === undefined) return;
    pendingFocus.current = focusId;
    setWalkthroughUsed(true);
    setStep(index);
    setText(data.lines.join('\n'));
    const declared = new Map(
      data.declare === undefined ? [] : [[data.declare.position, data.declare.scheme]],
    );
    const lead = `${fill(ui.walkthroughStepOf, { step: index + 1, total: WALKTHROUGH.length })}: ${ui[data.title]}. `;
    runLines(data.lines, declared, lead);
  };
  const closeWalkthrough = () => {
    pendingFocus.current = WALKTHROUGH_IDS.open;
    setStep(null);
  };
  const nextStep = () =>
    step === null || step >= WALKTHROUGH.length - 1
      ? closeWalkthrough()
      : goToStep(step + 1, WALKTHROUGH_IDS.next);
  // Back is disabled on step 1, so a press that lands there hands focus to Next.
  const backStep = () => {
    if (step === null || step === 0) return;
    goToStep(step - 1, step - 1 === 0 ? WALKTHROUGH_IDS.next : WALKTHROUGH_IDS.back);
  };
  // After the render that opened, moved or closed the panel, focus goes where the press left it:
  // the panel's heading on opening, the pressed control otherwise, the opener on closing.
  const stepShown = step;
  useEffect(() => {
    const id = pendingFocus.current;
    pendingFocus.current = null;
    if (id !== null) document.getElementById(id)?.focus();
    if (stepShown === null) return;
    const section = WALKTHROUGH[stepShown]?.section;
    // 'nearest' moves the page as little as possible, so the panel stays in view when it can.
    if (section !== undefined) {
      document.getElementById(`${section}-heading`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [stepShown]);

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
          <a
            href={routeHref({ view: 'relate', a: null, b: null })}
            aria-current={route.view === 'relate' ? 'page' : undefined}
          >
            {ui.navRelate}
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
            onPreset={runPreset}
            walkthrough={{
              step,
              used: walkthroughUsed,
              onOpen: () => goToStep(0, WALKTHROUGH_IDS.heading),
              onBack: backStep,
              onNext: nextStep,
              onSkip: closeWalkthrough,
            }}
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
