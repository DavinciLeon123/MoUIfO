import { useApp, useUi } from '../context.ts';
import type { Warning } from '../engine-host.ts';
import { warningText } from '../i18n/text.ts';
import { MarkedText } from './conclusion.tsx';

type Props = {
  warnings: readonly Warning[];
  /** The heading level: 3 above the sections, 4 under a value's heading. */
  level: 3 | 4;
};

/** Engine warnings in words, never a silent drop (D-03); renders nothing when there are none. */
export function WarningList({ warnings, level }: Props) {
  const { host, lang } = useApp();
  const ui = useUi();
  if (warnings.length === 0) return null;
  const Heading = level === 3 ? 'h3' : 'h4';
  return (
    <div class="warnings">
      <Heading>{ui.warningsHeading}</Heading>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.code}/${warning.ref ?? ''}`}>
            <MarkedText rendered={warningText(warning, { host, lang })} />
          </li>
        ))}
      </ul>
    </div>
  );
}
