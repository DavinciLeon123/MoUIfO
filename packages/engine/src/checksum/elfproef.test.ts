import { describe, expect, test } from 'vitest';
import { elfproef } from './elfproef.ts';
import { CHECKSUM_IDS, CHECKSUMS } from './index.ts';

// The only 9-digit literal allowed in the repository: public, allow-listed example value.
const PUBLIC_EXAMPLE = '001469630';

/** Every value that differs from `value` in exactly one digit position (built at runtime). */
function substitutions(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === value[i]) continue;
      out.push(`${value.slice(0, i)}${d}${value.slice(i + 1)}`);
    }
  }
  return out;
}

describe('elfproef', () => {
  test('accepts the public example value', () => {
    expect(elfproef(PUBLIC_EXAMPLE)).toBe(true);
  });

  test('rejects all 81 single-digit substitutions of the public example', () => {
    const all = substitutions(PUBLIC_EXAMPLE);
    expect(all).toHaveLength(81);
    expect(all.filter((v) => elfproef(v))).toHaveLength(0);
  });

  test('the all-zero value passes in the kernel (weighted sum 0), built at runtime', () => {
    expect(elfproef('0'.repeat(9))).toBe(true);
  });

  test('rejects anything that is not exactly 9 ASCII digits', () => {
    expect(elfproef('')).toBe(false);
    expect(elfproef(PUBLIC_EXAMPLE.slice(0, 8))).toBe(false);
    expect(elfproef(`${PUBLIC_EXAMPLE}0`)).toBe(false);
    expect(elfproef(`${PUBLIC_EXAMPLE.slice(0, 8)}A`)).toBe(false);
    expect(elfproef(` ${PUBLIC_EXAMPLE}`)).toBe(false);
    // Full-width digits (U+FF10..) are not ASCII digits.
    expect(elfproef(String.fromCharCode(0xff11).repeat(9))).toBe(false);
  });
});

describe('checksum registry (tracer)', () => {
  test('exposes elfproef', () => {
    expect(CHECKSUM_IDS).toContain('elfproef');
    expect(CHECKSUMS.elfproef).toBe(elfproef);
  });
});
