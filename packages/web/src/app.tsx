import { useState } from 'preact/hooks';
import { AppContext } from './context.ts';
import type { Host } from './engine-host.ts';
import type { PasteRun } from './model/paste.ts';
import { PasteView } from './views/paste.tsx';

export function App({ host }: { host: Host }) {
  // In memory only: no web storage, no cookie, nothing written to the URL or the history.
  const [text, setText] = useState('');
  const [run, setRun] = useState<PasteRun | null>(null);

  return (
    <AppContext.Provider value={{ host, lang: 'en' }}>
      <PasteView text={text} run={run} onText={setText} onRun={setRun} />
    </AppContext.Provider>
  );
}
