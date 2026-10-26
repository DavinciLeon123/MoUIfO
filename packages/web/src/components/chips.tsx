import { useUi } from '../context.ts';
import { CHIPS } from '../model/guide.ts';
import { routeHref } from '../router.ts';

type Props = {
  /** A paste chip: the lines to put in the box and run, and the declared map (1-based position). */
  onPaste: (lines: readonly string[], declared: ReadonlyMap<number, string>) => void;
};

/**
 * D-06 and D-02: example questions on the empty state. A paste chip is a button that fills the box
 * and runs at once; a view chip is a link that navigates. Neither puts a value in the address.
 */
export function ExampleChips({ onPaste }: Props) {
  const ui = useUi();
  return (
    <div class="guide-chips">
      <p id="chips-label">{ui.chipsLabel}</p>
      <ul aria-labelledby="chips-label" class="chips">
        {CHIPS.map((chip) => (
          <li key={chip.id}>
            {chip.kind === 'paste' ? (
              <button
                type="button"
                onClick={() =>
                  onPaste(
                    chip.lines,
                    new Map(
                      chip.declare === undefined
                        ? []
                        : [[chip.declare.position, chip.declare.scheme]],
                    ),
                  )
                }
              >
                {ui[chip.question]}
              </button>
            ) : (
              <a href={routeHref(chip.route)}>{ui[chip.question]}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
