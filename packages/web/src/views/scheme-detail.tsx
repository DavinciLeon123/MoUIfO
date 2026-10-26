import { ConclusionView, ExternalLink, MarkedText } from '../components/conclusion.tsx';
import { useApp, useUi } from '../context.ts';
import type { SchemeDescription } from '../engine-host.ts';
import { fieldLabel, fill, modelText } from '../i18n/text.ts';
import type { Ui } from '../i18n/ui.en.ts';
import {
  type ApplicabilityRow,
  type ApplicabilityStatusRow,
  applicabilityRows,
  schemeSections,
} from '../model/scheme.ts';
import { safeHref } from '../model/verify.ts';
import { routeHref } from '../router.ts';

/** The five trust sub-scores, each on its own line; they are never combined (REQUIREMENTS). */
const TRUST_LINES: readonly {
  field: keyof NonNullable<SchemeDescription['trust']>['value'];
  label: keyof Ui;
}[] = [
  { field: 'legal_basis', label: 'trustLegalBasis' },
  { field: 'registration_quality', label: 'trustRegistrationQuality' },
  { field: 'verifiability', label: 'trustVerifiability' },
  { field: 'crosswalks', label: 'trustCrosswalks' },
  { field: 'lifecycle', label: 'trustLifecycle' },
];

function TrustScores({ trust }: { trust: NonNullable<SchemeDescription['trust']> }) {
  const ui = useUi();
  return (
    <ul class="trust-scores" aria-label={ui.trustHeading}>
      {TRUST_LINES.map(({ field, label }) => (
        <li key={field} data-score={field}>
          {ui[label]}: {trust.value[field] ?? ui.notAssessed}
        </li>
      ))}
    </ul>
  );
}

/** D-13, WEB-06: the sourced register link of the scheme, or an honest statement that there is none. */
function HowToVerify({ id }: { id: string }) {
  const { host, lang, verify } = useApp();
  const ui = useUi();
  const entry = verify.get(id) ?? null;
  const link = entry === null ? null : safeHref(entry.url);
  const scheme = Object.hasOwn(host.model.schemes, id) ? host.model.schemes[id] : undefined;
  const name = `${scheme === undefined ? id : modelText(scheme.label, lang).text} (${id})`;
  return (
    <section aria-labelledby="verify-heading" class="verify-section">
      <h2 id="verify-heading">{ui.howToVerify}</h2>
      <p>
        {entry !== null && link !== null ? (
          <ExternalLink href={link.href}>
            {fill(ui.registerLink, { label: entry.label, host: link.host })}
          </ExternalLink>
        ) : (
          fill(ui.noRegisterLink, { scheme: name })
        )}
      </p>
    </section>
  );
}

/** "inherited from <ancestor>": the template's text around the ancestor's marked label. */
function InheritedFrom({ from }: { from: ApplicabilityStatusRow['from'] }) {
  const { lang } = useApp();
  const ui = useUi();
  const [before = '', after = ''] = ui.applicabilityInherited.split('{from}');
  return (
    <span>
      {before}
      {from === null ? null : <MarkedText rendered={modelText(from.label, lang)} />}
      {after}
    </span>
  );
}

/** DEC-032, DEC-041: per jurisdiction a list of statuses; a gap is "no data in the model". */
function JurisdictionBlock({ row }: { row: ApplicabilityRow }) {
  const { lang } = useApp();
  const ui = useUi();
  return (
    <div class="jurisdiction" data-jurisdiction={row.jurisdiction}>
      <h3>
        <MarkedText rendered={modelText(row.label, lang)} /> (<code>{row.jurisdiction}</code>)
      </h3>
      <ul>
        {row.statuses.map((entry) => (
          <li key={entry.status} data-status={entry.status} data-basis={entry.basis}>
            <strong>
              <MarkedText rendered={modelText(entry.label, lang)} />
            </strong>
            {': '}
            {entry.basis === 'no-data' ? (
              ui.applicabilityNoData
            ) : entry.basis === 'stated' ? (
              ui.applicabilityStated
            ) : (
              <InheritedFrom from={entry.from} />
            )}
            {entry.conclusion === null ? null : (
              <ConclusionView conclusion={entry.conclusion} data={row.data} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** WEB-02: the page of one scheme. The id has already passed `Object.hasOwn` in the router. */
export function SchemeDetailView({ id }: { id: string }) {
  const { host, lang } = useApp();
  const ui = useUi();
  const parts = schemeSections(host, id);
  if (parts === null) return <NotInModelView />;
  const { description, sections } = parts;
  const rows = applicabilityRows(host, id);
  const scope = description.scope === undefined ? null : modelText(description.scope, lang);
  const notes = description.notes === undefined ? null : modelText(description.notes, lang);
  return (
    <>
      <h1 tabIndex={-1}>
        <MarkedText rendered={modelText(description.label, lang)} />
      </h1>
      <p class="scheme-id">
        <code>{id}</code>
      </p>
      {scope === null ? null : (
        <p>
          <strong>{ui.scopeLabel}</strong>
          {': '}
          <MarkedText rendered={scope} />
        </p>
      )}
      {notes === null ? null : (
        <p>
          <strong>{ui.notesLabel}</strong>
          {': '}
          <MarkedText rendered={notes} />
        </p>
      )}

      <section aria-labelledby="description-heading">
        <h2 id="description-heading">{ui.schemeDescriptionHeading}</h2>
        {sections.map((section) => (
          <div key={section.key} class="field" data-field={section.key}>
            <h3>{fieldLabel(section.key, lang)}</h3>
            <ul>
              {section.conclusions.map((conclusion, index) => (
                <li key={`${conclusion.key}/${index}`}>
                  <ConclusionView
                    conclusion={conclusion}
                    data={description}
                    extra={
                      conclusion.key === 'describe.trust' && description.trust !== undefined ? (
                        <TrustScores trust={description.trust} />
                      ) : null
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <HowToVerify id={id} />

      <section aria-labelledby="applicability-heading">
        <h2 id="applicability-heading">{ui.applicabilityHeading}</h2>
        {rows.map((row) => (
          <JurisdictionBlock key={row.jurisdiction} row={row} />
        ))}
      </section>
    </>
  );
}

/** An address the model has no page for; the unknown id is never repeated back (T-07-13). */
export function NotInModelView() {
  const ui = useUi();
  return (
    <>
      <h1 tabIndex={-1}>{ui.notInModelTitle}</h1>
      <p>{ui.notInModelText}</p>
      <p>
        <a href={routeHref({ view: 'schemes' })}>{ui.backToSchemes}</a>
      </p>
    </>
  );
}
