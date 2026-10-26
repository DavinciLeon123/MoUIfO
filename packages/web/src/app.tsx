import { useMemo, useState } from 'preact/hooks';
import { AppContext } from './context.ts';
import type { Host } from './engine-host.ts';
import { normalise } from './model/normalise.ts';
import { type PasteRun, runPaste } from './model/paste.ts';
import { createVerifyIndex } from './model/verify.ts';
import { PasteView } from './views/paste.tsx';

type Session = { lines: readonly string[]; declared: ReadonlyMap<number, string> };

export function App({ host }: { host: Host }) {
  // In memory only: no web storage, no cookie, nothing written to the URL or the history.
  const [text, setText] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [run, setRun] = useState<PasteRun | null>(null);
  const verify = useMemo(() => createVerifyIndex(host), [host]);

  /** D-02: the engine runs only here, on Explain or on a Treat as press, never while typing. */
  const execute = (next: Session) => {
    setSession(next);
    setRun(runPaste(host.engine, next.lines, next.declared));
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
    <AppContext.Provider value={{ host, lang: 'en', verify }}>
      <PasteView text={text} run={run} onText={setText} onExplain={explain} onTreatAs={treatAs} />
    </AppContext.Provider>
  );
}
