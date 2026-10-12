/**
 * ISO 7064 MOD 97-10 over `[0-9A-Z]` (SPEC §6.4): letters count as 10..35 (A=10 ... Z=35) and the
 * value is valid when the whole number leaves remainder 1 modulo 97. Used by the LEI (ISO 17442)
 * and the sole-proprietor VAT id (DEC-004).
 *
 * The remainder is carried character by character, so no whole-string number is ever built: no
 * arbitrary-precision integer and no float, which silently loses precision beyond 2^53. The input
 * must already be uppercase; a scheme normalises with the `uppercase` transform before checking.
 */
export function iso7064Mod9710(value: string): boolean {
  if (!/^[0-9A-Z]{2,}$/.test(value)) return false;
  let remainder = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    remainder =
      code <= 57 ? (remainder * 10 + (code - 48)) % 97 : (remainder * 100 + (code - 55)) % 97;
  }
  return remainder === 1;
}
