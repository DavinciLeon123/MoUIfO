import type { ComponentChildren } from 'preact';
import { AmbiguityPanel, useSchemeName } from '../components/ambiguity.tsx';
import { ConclusionView } from '../components/conclusion.tsx';
import { WarningList } from '../components/warnings.tsx';
import { useUi } from '../context.ts';
import type { Conclusion } from '../engine-host.ts';
import { fill } from '../i18n/text.ts';
import type { DerivationRow, PasteRun, PasteValue } from '../model/paste.ts';

type Props = {
  text: string;
  run: PasteRun | null;
  onText: (text: string) => void;
  onExplain: () => void;
  onTreatAs: (position: number, scheme: string) => void;
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

/** The Recognition result of one value: its candidates, side by side when it is ambiguous (D-03). */
function RecognitionResult({
  value,
  onTreatAs,
}: {
  value: PasteValue;
  onTreatAs: Props['onTreatAs'];
}) {
  const ui = useUi();
  if (value.ambiguity !== null) {
    const shown = new Set(value.ambiguity.candidates.map((candidate) => candidate.scheme));
    const rest = value.recognise.conclusions.filter((each) => !shown.has(each.params.scheme ?? ''));
    return (
      <>
        <AmbiguityPanel value={value} onTreatAs={onTreatAs} />
        {rest.length === 0 ? null : (
          <ul>
            {rest.map((conclusion, index) => (
              <ConclusionLine key={`${conclusion.key}/${index}`} conclusion={conclusion} />
            ))}
          </ul>
        )}
      </>
    );
  }
  if (value.recognise.conclusions.length === 0) return <p>{ui.noSchemeFormat}</p>;
  return (
    <ul>
      {value.recognise.conclusions.map((conclusion, index) => (
        <ConclusionLine key={`${conclusion.key}/${index}`} conclusion={conclusion} />
      ))}
    </ul>
  );
}

/** The Derivations result of one value; a gated value derives only after the user's choice (D-17). */
function DerivationResult({ value }: { value: PasteValue }) {
  const ui = useUi();
  const name = useSchemeName();
  const gated = value.ambiguity !== null && value.declared === null;
  return (
    <>
      {value.declared === null ? null : (
        <p>{fill(ui.treatedAs, { scheme: name(value.declared) })}</p>
      )}
      {gated ? (
        <p>{ui.deriveGated}</p>
      ) : value.derivations.length === 0 ? (
        <p>{ui.deriveNothing}</p>
      ) : (
        <ul>
          {value.derivations.map((row, index) => (
            <DerivationLine key={`${row.conclusion.key}/${index}`} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}

export function PasteView({ text, run, onText, onExplain, onTreatAs }: Props) {
  const ui = useUi();
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
      <button type="button" onClick={onExplain}>
        {ui.explain}
      </button>
      {run === null ? null : (
        <>
          <WarningList warnings={run.runWarnings} level={3} />

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
                <RecognitionResult value={value} onTreatAs={onTreatAs} />
                <WarningList warnings={value.warnings} level={4} />
              </div>
            ))}
          </section>

          <section aria-labelledby="derivations-heading">
            <h2 id="derivations-heading">{ui.derivationsHeading}</h2>
            {empty ? <p>{ui.nothingToShow}</p> : null}
            {run.values.map((value) => (
              <div key={value.position}>
                <h3>{heading(value)}</h3>
                <DerivationResult value={value} />
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
          </section>
        </>
      )}
    </main>
  );
}
