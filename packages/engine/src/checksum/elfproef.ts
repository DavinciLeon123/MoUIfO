/**
 * Elfproef (SPEC §6.4): nine ASCII digits d1..d9 where 9*d1 + 8*d2 + ... + 2*d8 - d9 is a multiple
 * of 11. BSN, RSIN and the fi-number share this checksum, so it cannot tell them apart. The
 * all-zero value passes (weighted sum 0); only the personal-number guard special-cases it.
 */
export function elfproef(value: string): boolean {
  if (!/^[0-9]{9}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * (value.charCodeAt(i) - 48);
  sum -= value.charCodeAt(8) - 48;
  return sum % 11 === 0;
}
