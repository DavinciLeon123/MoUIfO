import model from 'virtual:uio-model';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { type Conclusion, createHost, type Host } from './engine-host.ts';

const PRIVACY_SENTENCE = 'Values are processed in your browser only and never stored or sent.';

type Recognised = { value: string; conclusions: Conclusion[] };

/** The certainty word of a conclusion, taken from the model's certainty vocabulary. */
function certaintyLabel(host: Host, id: string): string {
  const member = host.model.vocab.certainty?.values.find((entry) => entry.id === id);
  return member?.label?.en ?? id;
}

/** One value per line; each line is trimmed and passed to the engine unchanged otherwise. */
function parseValues(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function App({ host }: { host: Host }) {
  // In memory only: no web storage, no cookie, nothing written to the URL or the history.
  const [text, setText] = useState('');
  const [results, setResults] = useState<Recognised[]>([]);

  // D-02: the engine runs only on this explicit action, never on input events.
  const explain = () => {
    setResults(
      parseValues(text).map((value) => ({
        value,
        conclusions: host.engine.recognise(value).conclusions,
      })),
    );
  };

  return (
    <main>
      <h1>UIO knowledge model</h1>
      <label for="values">Identifiers, one per line</label>
      <textarea
        id="values"
        rows={4}
        value={text}
        aria-describedby="privacy"
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <p id="privacy">{PRIVACY_SENTENCE}</p>
      <button type="button" onClick={explain}>
        Explain
      </button>
      <section aria-labelledby="recognition-heading">
        <h2 id="recognition-heading">Recognition</h2>
        {results.map((result) => (
          <div key={result.value}>
            <h3>{result.value}</h3>
            <ul>
              {result.conclusions.map((conclusion) => (
                <li key={conclusion.statement}>
                  {conclusion.statement} {certaintyLabel(host, conclusion.certainty)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}

const root = document.getElementById('app');
if (root === null) throw new Error('the page has no #app element');
render(<App host={createHost(model)} />, root);
