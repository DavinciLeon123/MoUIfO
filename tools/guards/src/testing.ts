// Test helpers: valid-looking 9-digit samples are generated at runtime so that no elfproef-valid
// literal (other than the allow-listed public example) is ever committed to this repository.

/** Complete an 8-digit prefix with its elfproef check digit; null when the check digit would be 10. */
export function makeSyntheticValid(prefix8: string): string | null {
  if (!/^[0-9]{8}$/.test(prefix8)) throw new Error('prefix must be exactly 8 digits');
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * Number(prefix8[i]);
  const check = sum % 11;
  return check === 10 ? null : `${prefix8}${check}`;
}

/**
 * First valid synthetic value at or after the given 8-digit prefix. The default `9999` prefix keeps
 * every generated sample inside a range assumed to be reserved for test persons.
 */
export function firstSyntheticValid(start = '99990000'): string {
  for (let n = Number(start); n <= 99999999; n++) {
    const value = makeSyntheticValid(String(n).padStart(8, '0'));
    if (value !== null) return value;
  }
  throw new Error('no synthetic value found');
}
