// Test-only helpers (excluded from the package build): elfproef-valid and elfproef-invalid
// nine-digit values are computed at runtime from the reserved `9999` prefix range, so no valid
// literal is ever committed. This file mirrors packages/engine/src/testing/synthetic-values.ts
// (same prefix range, same functions); the mcp package must not import from the engine's testing
// folder, which is not part of the engine package.

const START = 99990000;

/** Complete an 8-digit prefix with its elfproef check digit; null when the check digit would be 10. */
function complete(prefix: string): string | null {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * (prefix.charCodeAt(i) - 48);
  const check = sum % 11;
  return check === 10 ? null : `${prefix}${check}`;
}

/** The index-th elfproef-valid nine-digit value at or after the prefix 99990000. */
export function syntheticValid(index = 0): string {
  let remaining = index;
  for (let n = START; n <= 99999999; n++) {
    const value = complete(String(n));
    if (value === null) continue;
    if (remaining === 0) return value;
    remaining -= 1;
  }
  throw new Error('no synthetic value found');
}

/** The same value as `syntheticValid(index)` with its last digit changed, so the elfproef fails. */
export function syntheticInvalid(index = 0): string {
  const value = syntheticValid(index);
  const last = value.charCodeAt(8) - 48;
  return `${value.slice(0, 8)}${(last + 1) % 10}`;
}
