import { useUi } from '../context.ts';
import { fill } from '../i18n/text.ts';
import { WALKTHROUGH } from '../model/guide.ts';

/** Ids the page uses to put focus back after a step or a close (WCAG 2.4.3). */
export const WALKTHROUGH_IDS = {
  open: 'walkthrough-open',
  heading: 'walkthrough-heading',
  back: 'walkthrough-back',
  next: 'walkthrough-next',
} as const;

/** The visible control of the empty state that starts the walkthrough (D-07). */
export function WalkthroughOpener({ onOpen }: { onOpen: () => void }) {
  const ui = useUi();
  return (
    <p class="guide-open">
      <button type="button" id={WALKTHROUGH_IDS.open} onClick={onOpen}>
        {ui.walkthroughOpen}
      </button>
    </p>
  );
}

type Props = {
  /** 0-based index into WALKTHROUGH. */
  step: number;
  onBack: () => void;
  /** On the last step the same button reads Finish and closes the panel. */
  onNext: () => void;
  onSkip: () => void;
};

/**
 * D-07: the stepped panel. An ordinary page region above the results, not a dialog: no dialog role,
 * no modal attribute, no overlay and no focus trap, so the rest of the page stays reachable. The
 * page owns the step; every Next or Back runs the step through its run action.
 */
export function Walkthrough({ step, onBack, onNext, onSkip }: Props) {
  const ui = useUi();
  const data = WALKTHROUGH[step];
  if (data === undefined) return null;
  const last = step === WALKTHROUGH.length - 1;
  return (
    <section class="walkthrough" aria-labelledby={WALKTHROUGH_IDS.heading}>
      <h2 id={WALKTHROUGH_IDS.heading} tabIndex={-1}>
        {ui.walkthroughHeading}
      </h2>
      <p class="walkthrough-step">
        {fill(ui.walkthroughStepOf, { step: step + 1, total: WALKTHROUGH.length })}
      </p>
      <h3>{ui[data.title]}</h3>
      <p>{ui[data.body]}</p>
      <div class="walkthrough-controls">
        <button type="button" id={WALKTHROUGH_IDS.back} disabled={step === 0} onClick={onBack}>
          {ui.walkthroughBack}
        </button>
        <button type="button" id={WALKTHROUGH_IDS.next} onClick={onNext}>
          {last ? ui.walkthroughFinish : ui.walkthroughNext}
        </button>
        <button type="button" onClick={onSkip}>
          {ui.walkthroughSkip}
        </button>
      </div>
    </section>
  );
}
