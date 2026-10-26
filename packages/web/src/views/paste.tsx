import type { ComponentChildren } from 'preact';
import { AmbiguityPanel, useSchemeName } from '../components/ambiguity.tsx';
import { ExampleChips } from '../components/chips.tsx';
import { ConclusionView } from '../components/conclusion.tsx';
import { Walkthrough, WalkthroughOpener } from '../components/walkthrough.tsx';
import { WarningList } from '../components/warnings.tsx';
import { useUi } from '../context.ts';
import type { Conclusion } from '../engine-host.ts';
import { fill } from '../i18n/text.ts';
import { WALKTHROUGH, type WalkthroughSection } from '../model/guide.ts';
import type { DerivationRow, PasteRun, PasteValue } from '../model/paste.ts';

type Props = {
  text: string;
  run: PasteRun | null;
  onText: (text: string) => void;
  onExplain: () => void;
  onTreatAs: (position: number, scheme: string) => void;
  /** A paste chip: fill the box with the lines, declare as given, and run (D-02, D-06). */
  onPreset: (lines: readonly string[], declared: ReadonlyMap<number, string>) => void;
  /** D-07: the walkthrough state the page holds in memory. */
  walkthrough: {
    /** 0-based index of the open step, or null while the panel is closed. */
    step: number | null;
    /** True once the panel has been opened, so the opener stays after Skip. */
    used: boolean;
    onOpen: () => void;
    onBack: () => void;
    onNext: () => void;
    onSkip: () => void;
  };
};

/** One conclusion as a list item holding the expandable ConclusionView. */
function ConclusionLine({
  conclusion,
  data,
  extra,
}: {
  conclusion: Conclusion;
  /** The data of the call that made the conclusion, which the Dutch renderers may need. */
  data?: unknown;
  extra?: ComponentChildren;
}) {
  return (
    <li>
      <ConclusionView conclusion={conclusion} data={data} extra={extra} />
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

export function PasteView({
  text,
  run,
  onText,
  onExplain,
  onTreatAs,
  onPreset,
  walkthrough,
}: Props) {
  const ui = useUi();
  const heading = (value: PasteValue) =>
    fill(ui.valueHeading, { position: value.position, value: value.value });
  const empty = run !== null && run.values.length === 0;
  // The empty state: no run yet, or the last run had no values (D-06).
  const showGuide = run === null || empty;
  // The section the open walkthrough step points at (D-07): marked, with a visible label.
  const marked: { section: WalkthroughSection; step: number } | null =
    walkthrough.step === null
      ? null
      : {
          section: WALKTHROUGH[walkthrough.step]?.section ?? 'recognition',
          step: walkthrough.step + 1,
        };
  const sectionClass = (section: WalkthroughSection) =>
    marked?.section === section ? 'walkthrough-target' : undefined;
  const targetLabel = (section: WalkthroughSection) =>
    marked?.section === section ? (
      <p class="walkthrough-label">{fill(ui.walkthroughTarget, { step: marked.step })}</p>
    ) : null;
  return (
    <>
      <h1 tabIndex={-1}>{ui.title}</h1>
      {showGuide ? <ExampleChips onPaste={onPreset} /> : null}
      {walkthrough.step === null && (showGuide || walkthrough.used) ? (
        <WalkthroughOpener onOpen={walkthrough.onOpen} />
      ) : null}
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
      {walkthrough.step === null ? null : (
        <Walkthrough
          step={walkthrough.step}
          onBack={walkthrough.onBack}
          onNext={walkthrough.onNext}
          onSkip={walkthrough.onSkip}
        />
      )}
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

          <section aria-labelledby="recognition-heading" class={sectionClass('recognition')}>
            <h2 id="recognition-heading">{ui.recognitionHeading}</h2>
            {targetLabel('recognition')}
            {empty ? <p>{ui.nothingToShow}</p> : null}
            {run.values.map((value) => (
              <div key={value.position}>
                <h3>{heading(value)}</h3>
                <RecognitionResult value={value} onTreatAs={onTreatAs} />
                <WarningList warnings={value.warnings} level={4} />
              </div>
            ))}
          </section>

          <section aria-labelledby="derivations-heading" class={sectionClass('derivations')}>
            <h2 id="derivations-heading">{ui.derivationsHeading}</h2>
            {targetLabel('derivations')}
            {empty ? <p>{ui.nothingToShow}</p> : null}
            {run.values.map((value) => (
              <div key={value.position}>
                <h3>{heading(value)}</h3>
                <DerivationResult value={value} />
              </div>
            ))}
          </section>

          <section aria-labelledby="consistency-heading" class={sectionClass('consistency')}>
            <h2 id="consistency-heading">{ui.consistencyHeading}</h2>
            {targetLabel('consistency')}
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
                        <ConclusionLine conclusion={pair.conclusion} data={pair.finding} />
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
