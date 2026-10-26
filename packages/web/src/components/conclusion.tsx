import type { ComponentChildren } from 'preact';
import { useApp, useUi } from '../context.ts';
import type { Certainty, Conclusion, Source, Step } from '../engine-host.ts';
import { certaintyLabel, conclusionText, fill, modelText, type Rendered } from '../i18n/text.ts';
import type { Ui } from '../i18n/ui.en.ts';
import { safeHref, verifyTargets } from '../model/verify.ts';

/** One shape per certainty, so certainty is never carried by colour alone (WEB-08). */
const GLYPH: Readonly<Record<Certainty, string>> = {
  certain: '●',
  likely: '◐',
  possible: '○',
};

/** The certainty as a word, a glyph and a colour class. */
export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  const { host, lang } = useApp();
  return (
    <span class={`badge certainty-${certainty}`}>
      <span aria-hidden="true">{GLYPH[certainty]}</span> {certaintyLabel(certainty, { host, lang })}
    </span>
  );
}

/**
 * A rendered engine or model text with its marker (D-09, D-10). Text in another language than the
 * page is wrapped in an element that names its language (WCAG 3.1.2) and is followed by a small
 * visible marker: "EN" for English model text, "niet vertaald" for an engine line without a
 * Dutch entry. Nothing is hidden and nothing is translated by machine.
 */
export function MarkedText({ rendered }: { rendered: Rendered }) {
  const { lang } = useApp();
  const ui = useUi();
  const body =
    rendered.lang === lang ? rendered.text : <span lang={rendered.lang}>{rendered.text}</span>;
  if (rendered.marker === null) return <>{body}</>;
  return (
    <>
      {body}{' '}
      <small class="marker">{rendered.marker === 'en' ? ui.markerEn : ui.markerUntranslated}</small>
    </>
  );
}

/** D-14: new tab, noopener noreferrer, the host shown and visible text that the site is external. */
function ExternalLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * A source title: model text with no Dutch (D-10), so in Dutch mode it sits in an element that
 * names its language (WCAG 3.1.2). The "EN" marker is shown once per step list, not per title.
 */
function SourceTitle({ title }: { title: string }) {
  const { lang } = useApp();
  return lang === 'nl' ? <span lang="en">{title}</span> : <span>{title}</span>;
}

/** The link text of a source: the template with the title, the host and the external notice. */
function SourceLinkText({ title, host }: { title: string; host: string }) {
  const ui = useUi();
  const [before = '', after = ''] = ui.sourceLink.split('{title}');
  return (
    <>
      {fill(before, { host })}
      <SourceTitle title={title} />
      {fill(after, { host })}
    </>
  );
}

const STEP_KIND: Readonly<Record<Step['kind'], keyof Ui>> = {
  fact: 'stepKindFact',
  rule: 'stepKindRule',
  pattern: 'stepKindPattern',
  checksum: 'stepKindChecksum',
  assumption: 'stepKindAssumption',
  component: 'stepKindComponent',
};

const SOURCE_TYPE: Readonly<Record<Source['type'], keyof Ui>> = {
  law: 'sourceTypeLaw',
  standard: 'sourceTypeStandard',
  'register-doc': 'sourceTypeRegisterDoc',
  expert: 'sourceTypeExpert',
  analysis: 'sourceTypeAnalysis',
};

function ConditionText({ condition }: { condition: NonNullable<Step['condition']> }) {
  const ui = useUi();
  const pairs = Object.entries(condition).map(([key, value]) => `${key} = ${value}`);
  return (
    <span>
      {ui.stepCondition}: {pairs.join(', ')}
    </span>
  );
}

function StepSource({ source }: { source: Step['source'] }) {
  const ui = useUi();
  if (source === null) return <span>{ui.stepNoSource}</span>;
  const link = safeHref(source.url ?? source.eli);
  return (
    <span>
      {ui.stepSource}:{' '}
      {link === null ? (
        <SourceTitle title={source.title} />
      ) : (
        <ExternalLink href={link.href}>
          <SourceLinkText title={source.title} host={link.host} />
        </ExternalLink>
      )}
      , {ui[SOURCE_TYPE[source.type]]}, {source.date}
    </span>
  );
}

function StepItem({ step }: { step: Step }) {
  const ui = useUi();
  return (
    <li>
      <span>
        {ui.stepKind}: {ui[STEP_KIND[step.kind]]}
      </span>{' '}
      <code>{step.ref}</code> <CertaintyBadge certainty={step.certainty} />{' '}
      {step.condition === undefined ? null : <ConditionText condition={step.condition} />}{' '}
      <StepSource source={step.source} />
    </li>
  );
}

/** D-13: a sourced register link per scheme the conclusion points to, else an honest statement. */
function VerifyLine({ conclusion }: { conclusion: Conclusion }) {
  const { host, lang, verify } = useApp();
  const ui = useUi();
  const targets = verifyTargets(conclusion, host.model);
  return (
    <p class="verify">
      <strong>{ui.howToVerify}</strong>
      {': '}
      {targets.length === 0
        ? ui.noVerifyTarget
        : targets.map((id) => {
            const entry = verify.get(id) ?? null;
            const link = entry === null ? null : safeHref(entry.url);
            if (entry !== null && link !== null) {
              return (
                <span key={id} class="verify-target">
                  <ExternalLink href={link.href}>
                    {fill(ui.registerLink, { label: entry.label, host: link.host })}
                  </ExternalLink>{' '}
                </span>
              );
            }
            const scheme = host.model.schemes[id];
            const name = scheme === undefined ? id : modelText(scheme.label, lang).text;
            const label = `${name} (${id})`;
            return (
              <span key={id} class="verify-target">
                {fill(ui.noRegisterLink, { scheme: label })}{' '}
                <a href={`#/schemes/${id}`}>{fill(ui.schemePage, { scheme: label })}</a>{' '}
              </span>
            );
          })}
    </p>
  );
}

type ConclusionViewProps = {
  conclusion: Conclusion;
  data?: unknown;
  /** Content shown next to the conclusion even while it is collapsed, such as a derived value. */
  extra?: ComponentChildren;
};

/**
 * D-04: one line (statement, certainty badge, first source title) that expands, through a native
 * details element, to the full step list and the How to verify line.
 */
export function ConclusionView({ conclusion, data, extra }: ConclusionViewProps) {
  const { host, lang } = useApp();
  const ui = useUi();
  const text = conclusionText(conclusion, { host, lang, data });
  const first = conclusion.explanation.find((step) => step.source !== null)?.source ?? null;
  // D-10: in Dutch mode the titles of the sources are English; the marker is shown once per list.
  const englishTitles = lang === 'nl' && first !== null;
  return (
    <div class="conclusion" data-key={conclusion.key} data-scheme={conclusion.params.scheme}>
      <details>
        <summary>
          <span class="statement">
            <MarkedText rendered={text} />
          </span>{' '}
          <CertaintyBadge certainty={conclusion.certainty} />
          {first === null ? null : (
            <span class="first-source">
              {' '}
              <SourceTitle title={first.title} />
            </span>
          )}
        </summary>
        <h4>{ui.stepsHeading}</h4>
        {englishTitles ? (
          <p class="note">
            <small class="marker">{ui.markerEn}</small> {ui.sourceTitlesNote}
          </p>
        ) : null}
        <ol class="steps">
          {conclusion.explanation.map((step, index) => (
            <StepItem key={`${step.ref}/${index}`} step={step} />
          ))}
        </ol>
        <VerifyLine conclusion={conclusion} />
      </details>
      {extra}
    </div>
  );
}
