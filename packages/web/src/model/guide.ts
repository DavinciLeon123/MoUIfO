import type { UiKey } from '../i18n/ui.en.ts';
import type { Route } from '../router.ts';

/**
 * The guide data of the empty paste view (WEB-04, WEB-05; D-06, D-07, D-08): plain data, no logic.
 * Every value is one of the four public values of SPEC section 10 (CLAUDE.md, DEC-025); the only
 * nine-digit one is the allow-listed RSIN. What a chip or step shows is whatever the engine answers
 * for these values, so no identifier fact is written here or in the guide copy (D-08, DEC-050).
 */
export const EORI_VALUE = 'NL001469630';
export const VAT_VALUE = 'NL001469630B01';
export const RSIN_VALUE = '001469630';
/** The contrast of SPEC section 10: a 15-digit EORI of another country. */
export const CONTRAST_VALUE = 'DE123456789012345';

/** The scheme the user declares for the value at a 1-based position, as Treat as does (D-17). */
export type Declare = { position: number; scheme: string };

/** A paste chip fills the box and runs; a view chip is a link to another view (D-06, D-02). */
export type Chip =
  | {
      id: string;
      question: UiKey;
      kind: 'paste';
      lines: readonly string[];
      declare?: Declare;
    }
  | { id: string; question: UiKey; kind: 'view'; route: Route };

export const CHIPS: readonly Chip[] = [
  { id: 'recognise', question: 'chipRecognise', kind: 'paste', lines: [VAT_VALUE] },
  // D-17: the RSIN is declared as rsin, so the run derives from it at once. No VAT number is
  // promised (DEC-050): the rules derive an EORI and an OIN from an RSIN and no VAT number.
  {
    id: 'derive',
    question: 'chipDerive',
    kind: 'paste',
    lines: [RSIN_VALUE],
    declare: { position: 1, scheme: 'rsin' },
  },
  {
    id: 'consistency',
    question: 'chipConsistency',
    kind: 'paste',
    lines: [EORI_VALUE, VAT_VALUE, RSIN_VALUE],
  },
  {
    id: 'describe',
    question: 'chipDescribe',
    kind: 'view',
    route: { view: 'scheme', id: 'eori' },
  },
  {
    id: 'relate',
    question: 'chipRelate',
    kind: 'view',
    route: { view: 'relate', a: 'rsin', b: 'eori' },
  },
];

/** The result section a walkthrough step marks and scrolls to (D-07). */
export type WalkthroughSection = 'recognition' | 'derivations' | 'consistency';

/** One step of the EORI walkthrough: copy keys, the lines it runs and the section it points at. */
export type Step = {
  id: string;
  title: UiKey;
  body: UiKey;
  lines: readonly string[];
  declare?: Declare;
  section: WalkthroughSection;
};

export const WALKTHROUGH: readonly Step[] = [];
