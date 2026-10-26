import { useEffect, useMemo, useState } from 'preact/hooks';
import { useSchemeName } from '../components/ambiguity.tsx';
import {
  CertaintyBadge,
  ConclusionView,
  MarkedText,
  SourceTitle,
  StepItem,
} from '../components/conclusion.tsx';
import { WarningList } from '../components/warnings.tsx';
import { useApp, useUi } from '../context.ts';
import { fill, modelText } from '../i18n/text.ts';
import { type HopRow, relateView, schemeOptions } from '../model/relate.ts';
import { routeHref } from '../router.ts';

/** The edge of a hop in words: the relation kind's label, "rule <id>" or "component <prefix>". */
function EdgeLabel({ hop }: { hop: HopRow }) {
  const { lang } = useApp();
  const ui = useUi();
  if (hop.edgeType === 'rule') return <>{fill(ui.edgeRule, { id: hop.edgeRef })}</>;
  if (hop.edgeType === 'component') return <>{fill(ui.edgeComponent, { prefix: hop.edgeRef })}</>;
  return <MarkedText rendered={modelText(hop.edgeLabel, lang)} />;
}

/**
 * D-16: one hop as the model's own statement (stated from, label, stated to), so the sentence stays
 * true when the chain walked the edge against its direction, which is then marked inverse. The
 * hop's strongest step gives the certainty and the source; parallel edges follow as "also via".
 */
function HopItem({ hop }: { hop: HopRow }) {
  const ui = useUi();
  const name = useSchemeName();
  const part = (scheme: string) => (
    <a href={routeHref({ view: 'scheme', id: scheme })}>{name(scheme)}</a>
  );
  return (
    <li
      class="hop"
      data-from={hop.from}
      data-to={hop.to}
      data-edge={`${hop.edgeType}/${hop.edgeRef}`}
      data-inverse={hop.inverse ? 'true' : 'false'}
    >
      {part(hop.statedFrom)} {'— '}
      <EdgeLabel hop={hop} />
      {' — '}
      {part(hop.statedTo)}
      {hop.inverse ? ` (${ui.edgeInverse})` : ''} <CertaintyBadge certainty={hop.step.certainty} />{' '}
      {hop.step.source === null ? null : (
        <span class="first-source">
          <SourceTitle title={hop.step.source.title} />
        </span>
      )}
      {hop.alsoVia.length === 0 ? null : (
        <div class="also-via">
          <span>{ui.relateAlsoVia}</span>
          <ol class="steps">
            {hop.alsoVia.map((step, index) => (
              <StepItem key={`${step.ref}/${index}`} step={step} />
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

/**
 * Every shortest chain `relate(a, b)` found, each an expandable conclusion with its hop rows. A pair
 * without a chain says "No sourced relation found", never that the schemes are unrelated (D-16, the
 * model may simply not hold the relation), and the engine's own warning follows in words.
 */
function Chains({ a, b }: { a: string; b: string }) {
  const { host } = useApp();
  const ui = useUi();
  const view = useMemo(() => relateView(host, a, b), [host, a, b]);
  const noChain = view.warnings.some((warning) => warning.code === 'no-chain');
  return (
    <section aria-labelledby="relate-result-heading" class="relate-result">
      <h2 id="relate-result-heading">{ui.relateResultHeading}</h2>
      {noChain ? <p class="relate-none">{ui.relateNoChain}</p> : null}
      <ul class="chains">
        {view.paths.map((path) => (
          <li key={path.schemes.join('/')} class="chain" data-chain={path.schemes.join('/')}>
            <ConclusionView
              conclusion={path.conclusion}
              data={path.data}
              extra={
                <ol class="hops" aria-label={ui.relateHopsLabel}>
                  {path.hops.map((hop) => (
                    <HopItem key={`${hop.from}/${hop.to}`} hop={hop} />
                  ))}
                </ol>
              }
            />
          </li>
        ))}
      </ul>
      <WarningList warnings={view.warnings} level={3} />
    </section>
  );
}

type Choice = { a: string | null; b: string | null };

/** One of the two labelled selects; the placeholder is shown until a scheme is chosen. */
function SchemeSelect(props: {
  id: string;
  label: string;
  value: string | null;
  onChoose: (scheme: string) => void;
}) {
  const { host, lang } = useApp();
  const ui = useUi();
  const options = useMemo(() => schemeOptions(host, lang), [host, lang]);
  return (
    <div class="relate-field">
      <label for={props.id}>{props.label}</label>
      <select
        id={props.id}
        value={props.value ?? ''}
        onChange={(event) => props.onChoose(event.currentTarget.value)}
      >
        <option value="" disabled>
          {ui.relateChoosePlaceholder}
        </option>
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            lang={option.label.lang === lang ? undefined : option.label.lang}
          >
            {`${option.label.text} (${option.id})`}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * WEB-03, D-16: pick two schemes and see every shortest sourced chain between them. The route holds
 * the pair once both are chosen (scheme ids only, never a pasted value); a first choice alone is
 * kept in the view until the second one completes the pair.
 */
export function RelateView({ a, b }: Choice) {
  const ui = useUi();
  const [choice, setChoice] = useState<Choice>({ a, b });
  // A new address (a chosen pair, the back button, the nav link) is the new choice.
  useEffect(() => {
    setChoice((current) => (current.a === a && current.b === b ? current : { a, b }));
  }, [a, b]);
  const choose = (next: Choice) => {
    setChoice(next);
    if (next.a !== null && next.b !== null) {
      location.hash = routeHref({ view: 'relate', a: next.a, b: next.b });
    }
  };
  return (
    <>
      <h1 tabIndex={-1}>{ui.relateHeading}</h1>
      <p>{ui.relateIntro}</p>
      <div class="relate-form">
        <SchemeSelect
          id="relate-a"
          label={ui.relateA}
          value={choice.a}
          onChoose={(scheme) => choose({ a: scheme, b: choice.b })}
        />
        <button type="button" onClick={() => choose({ a: choice.b, b: choice.a })}>
          {ui.relateSwap}
        </button>
        <SchemeSelect
          id="relate-b"
          label={ui.relateB}
          value={choice.b}
          onChoose={(scheme) => choose({ a: choice.a, b: scheme })}
        />
      </div>
      {a !== null && b !== null ? (
        <Chains a={a} b={b} />
      ) : (
        <p class="relate-choose">{ui.relateChoose}</p>
      )}
    </>
  );
}
