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
];
