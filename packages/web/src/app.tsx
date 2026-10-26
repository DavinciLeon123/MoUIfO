import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppContext, useApp, useUi } from './context.ts';
import type { Host } from './engine-host.ts';
import { fill } from './i18n/text.ts';
import { normalise } from './model/normalise.ts';
import { type PasteRun, runPaste } from './model/paste.ts';
import { createVerifyIndex } from './model/verify.ts';
import { PasteView } from './views/paste.tsx';

type Session = { lines: readonly string[]; declared: ReadonlyMap<number, string> };

/** The page itself: in-memory state only, so no web storage, cookie, URL or history entry. */
function Page() {
  const { host } = useApp();
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

  return (
    <>
      <PasteView text={text} run={run} onText={setText} onExplain={explain} onTreatAs={treatAs} />
      <p role="status" aria-live="polite" class="visually-hidden">
        {status}
      </p>
    </>
  );
}

export function App({ host }: { host: Host }) {
  const verify = useMemo(() => createVerifyIndex(host), [host]);
  return (
    <AppContext.Provider value={{ host, lang: 'en', verify }}>
      <Page />
    </AppContext.Provider>
  );
}
