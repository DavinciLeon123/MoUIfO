/**
 * GS1 mod 10 (SPEC §6.4), used by the GLN and GTIN: from the digit left of the check digit,
 * weights 3 and 1 alternate; the check digit is `(10 - sum % 10) % 10`. Length is a pattern
 * concern of the scheme, not of the checksum.
 */
export function gs1Mod10(value: string): boolean {
  if (!/^[0-9]{2,}$/.test(value)) return false;
  const last = value.length - 1;
  let sum = 0;
  for (let i = 0; i < last; i++) {
    const weight = (last - 1 - i) % 2 === 0 ? 3 : 1;
    sum += weight * (value.charCodeAt(i) - 48);
  }
  return (10 - (sum % 10)) % 10 === value.charCodeAt(last) - 48;
}
