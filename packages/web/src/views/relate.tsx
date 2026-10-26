import { useMemo } from 'preact/hooks';
import { useSchemeName } from '../components/ambiguity.tsx';
import {
  CertaintyBadge,
  ConclusionView,
  MarkedText,
  SourceTitle,
  StepItem,
} from '../components/conclusion.tsx';
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

/** Every shortest chain `relate(a, b)` found, each an expandable conclusion with its hop rows. */
function Chains({ a, b }: { a: string; b: string }) {
  const { host } = useApp();
  const ui = useUi();
  const view = useMemo(() => relateView(host, a, b), [host, a, b]);
  return (
    <section aria-labelledby="relate-result-heading" class="relate-result">
      <h2 id="relate-result-heading">{ui.relateResultHeading}</h2>
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
    </section>
  );
}

/** One of the two labelled selects of the view. */
function SchemeSelect({ id, label, value }: { id: string; label: string; value: string }) {
  const { host, lang } = useApp();
  const options = useMemo(() => schemeOptions(host, lang), [host, lang]);
  return (
    <div class="relate-field">
      <label for={id}>{label}</label>
      <select id={id} value={value}>
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

/** WEB-03, D-16: pick two schemes and see every shortest sourced chain between them. */
export function RelateView({ a, b }: { a: string; b: string }) {
  const ui = useUi();
  return (
    <>
      <h1 tabIndex={-1}>{ui.relateHeading}</h1>
      <p>{ui.relateIntro}</p>
      <div class="relate-form">
        <SchemeSelect id="relate-a" label={ui.relateA} value={a} />
        <SchemeSelect id="relate-b" label={ui.relateB} value={b} />
      </div>
      <Chains a={a} b={b} />
    </>
  );
}
