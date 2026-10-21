import { elfproef } from './checksum/elfproef.ts';
import type { Warning } from './types.ts';

/**
 * True for a bare value of nine ASCII digits that passes the kernel elfproef: it may be a citizen's
 * BSN (SPEC §6.3, DEC-063, D-08). This is the privacy rule itself, not identifier knowledge, and it
 * reuses the kernel checksum; there is no second one.
 */
export function isPossiblePersonalIdentifier(value: string): boolean {
  return /^[0-9]{9}$/.test(value) && elfproef(value);
}

/**
 * The warning for a possible personal identifier. It is built from scheme ids only and never holds
 * the value or any digit of it (T-05-08).
 */
export function personalIdentifierWarning(schemes: readonly string[], ref?: string): Warning {
  const warning: Warning = {
    code: 'possible-personal-identifier',
    message: `The value may be a personal identifier (candidate schemes: ${schemes.join(', ')}); it is used further only when its scheme is named or another supplied value derives it.`,
  };
  if (ref !== undefined) warning.ref = ref;
  return warning;
}
