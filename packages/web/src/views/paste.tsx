import type { ComponentChildren } from 'preact';
import { ConclusionView } from '../components/conclusion.tsx';
import { useApp, useUi } from '../context.ts';
import type { Conclusion } from '../engine-host.ts';
import { fill, warningText } from '../i18n/text.ts';
import { normalise } from '../model/normalise.ts';
import { type DerivationRow, type PasteRun, type PasteValue, runPaste } from '../model/paste.ts';

type Props = {
  text: string;
  run: PasteRun | null;
  onText: (text: string) => void;
  onRun: (run: PasteRun) => void;
};

/** One conclusion as a list item holding the expandable ConclusionView. */
function ConclusionLine({
  conclusion,
  extra,
}: {
  conclusion: Conclusion;
  extra?: ComponentChildren;
}) {
  return (
    <li>
      <ConclusionView conclusion={conclusion} extra={extra} />
    </li>
  );
}

function Warnings({ value }: { value: PasteValue }) {
  const { host, lang } = useApp();
  if (value.warnings.length === 0) return null;
  return (
    <ul>
      {value.warnings.map((warning) => (
        <li key={`${warning.code}/${warning.ref ?? ''}`}>
          {warningText(warning, { host, lang }).text}
        </li>
      ))}
    </ul>
  );
}

function DerivationLine({ row }: { row: DerivationRow }) {
  const ui = useUi();
  return (
    <ConclusionLine
      conclusion={row.conclusion}
      extra={
        row.derivation === null ? null : (
          <p>
            {ui.derivedValue}: <code>{row.derivation.value}</code>
          </p>
        )
      }
    />
  );
}

export function PasteView({ text, run, onText, onRun }: Props) {
  const ui = useUi();
  const { host } = useApp();
  // D-02: the engine runs only here, on the explicit Explain action.
  const explain = () => onRun(runPaste(host.engine, normalise(text)));
  const heading = (value: PasteValue) =>
    fill(ui.valueHeading, { position: value.position, value: value.value });
  const empty = run !== null && run.values.length === 0;
  return (
    <main>
      <h1>{ui.title}</h1>
      <label for="values">{ui.inputLabel}</label>
      <textarea
        id="values"
        rows={4}
        value={text}
        aria-describedby="privacy"
        onInput={(event) => onText(event.currentTarget.value)}
      />
      <p id="privacy">{ui.privacy}</p>
      <button type="button" onClick={explain}>
        {ui.explain}
      </button>
      {run === null ? null : (
        <>
          <section aria-labelledby="normalised-heading">
            <h2 id="normalised-heading">{ui.normalisedHeading}</h2>
            {empty ? (
              <p>{ui.nothingToShow}</p>
            ) : (
              <ol>
                {run.values.map((value) => (
                  <li key={value.position}>
                    <code>{value.value}</code>
                  </li>
                ))}
              </ol>
            )}
            {run.omitted > 0 ? (
              <p>{fill(ui.omitted, { count: run.omitted, max: run.values.length })}</p>
            ) : null}
          </section>

          <section aria-labelledby="recognition-heading">
            <h2 id="recognition-heading">{ui.recognitionHeading}</h2>
            {empty ? <p>{ui.nothingToShow}</p> : null}
            {run.values.map((value) => (
              <div key={value.position}>
                <h3>{heading(value)}</h3>
                {value.recognise.conclusions.length === 0 ? (
                  <p>{ui.noSchemeFormat}</p>
                ) : (
                  <ul>
                    {value.recognise.conclusions.map((conclusion, index) => (
                      <ConclusionLine key={`${conclusion.key}/${index}`} conclusion={conclusion} />
                    ))}
                  </ul>
                )}
                <Warnings value={value} />
              </div>
            ))}
          </section>

          <section aria-labelledby="derivations-heading">
            <h2 id="derivations-heading">{ui.derivationsHeading}</h2>
            {empty ? <p>{ui.nothingToShow}</p> : null}
            {run.values.map((value) => (
              <div key={value.position}>
                <h3>{heading(value)}</h3>
                {value.derivations.length === 0 ? (
                  <p>{ui.deriveNothing}</p>
                ) : (
                  <ul>
                    {value.derivations.map((row, index) => (
                      <DerivationLine key={`${row.conclusion.key}/${index}`} row={row} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          <section aria-labelledby="consistency-heading">
            <h2 id="consistency-heading">{ui.consistencyHeading}</h2>
            {run.check === null ? (
              <p>{ui.needTwoValues}</p>
            ) : run.pairs.length === 0 ? (
              <p>{ui.noPairs}</p>
            ) : (
              <ul>
                {run.pairs.map((pair) => (
                  <li key={`${pair.a}-${pair.b}`} data-pair={`${pair.a}-${pair.b}`}>
                    <p>
                      {fill(ui.pairLine, { a: pair.a, b: pair.b })}:{' '}
                      {pair.outcome === 'consistent'
                        ? ui.outcomeConsistent
                        : pair.outcome === 'inconsistent'
                          ? ui.outcomeInconsistent
                          : ui.outcomeNoRule}
                    </p>
                    {pair.conclusion === null ? null : (
                      <ul>
                        <ConclusionLine conclusion={pair.conclusion} />
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <RunWarnings run={run} />
          </section>
        </>
      )}
    </main>
  );
}

function RunWarnings({ run }: { run: PasteRun }) {
  const { host, lang } = useApp();
  if (run.runWarnings.length === 0) return null;
  return (
    <ul>
      {run.runWarnings.map((warning) => (
        <li key={`${warning.code}/${warning.ref ?? ''}`}>
          {warningText(warning, { host, lang }).text}
        </li>
      ))}
    </ul>
  );
}
