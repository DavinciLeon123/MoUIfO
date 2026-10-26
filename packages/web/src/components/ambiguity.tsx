import { useApp, useUi } from '../context.ts';
import type { Candidate, Conclusion } from '../engine-host.ts';
import { fill, modelText, warningText } from '../i18n/text.ts';
import type { PasteValue } from '../model/paste.ts';
import { ConclusionView, MarkedText } from './conclusion.tsx';

type Props = {
  value: PasteValue;
  /** Called with the 1-based position and the scheme id of the pressed button. */
  onTreatAs: (position: number, scheme: string) => void;
};

/** "Name (id)", the way a scheme is named next to its id throughout the page. */
export function useSchemeName(): (id: string) => string {
  const { host, lang } = useApp();
  return (id) => {
    const scheme = Object.hasOwn(host.model.schemes, id) ? host.model.schemes[id] : undefined;
    return `${scheme === undefined ? id : modelText(scheme.label, lang).text} (${id})`;
  };
}

/**
 * D-03 and D-17: the banner of a value that may be a personal identifier, its candidates side by
 * side in the engine's order (none preferred, none preselected) and one Treat as button per
 * candidate. Pressing a button is the user's own declaration of the scheme (DEC-005, DEC-067).
 */
export function AmbiguityPanel({ value, onTreatAs }: Props) {
  const { host, lang } = useApp();
  const ui = useUi();
  const name = useSchemeName();
  const ambiguity = value.ambiguity;
  if (ambiguity === null) return null;
  const conclusionOf = (candidate: Candidate): Conclusion | null =>
    value.recognise.conclusions.find((each) => each.params.scheme === candidate.scheme) ?? null;
  return (
    <>
      <div class="banner">
        <h4>{ui.ambiguityHeading}</h4>
        <p>
          <MarkedText
            rendered={warningText(ambiguity.warning, { host, lang, data: ambiguity.candidates })}
          />
        </p>
      </div>
      <ul class="candidates">
        {ambiguity.candidates.map((candidate) => {
          const conclusion = conclusionOf(candidate);
          return (
            <li key={candidate.scheme} class="candidate">
              {conclusion === null ? null : <ConclusionView conclusion={conclusion} />}
              <button
                type="button"
                aria-pressed={value.declared === candidate.scheme}
                onClick={() => onTreatAs(value.position, candidate.scheme)}
              >
                {fill(ui.treatAs, { scheme: name(candidate.scheme) })}
              </button>
            </li>
          );
        })}
      </ul>
      <p>{ui.cannotTellApart}</p>
    </>
  );
}
