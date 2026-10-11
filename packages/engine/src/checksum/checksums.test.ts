import { describe, expect, test } from 'vitest';
import { elfproef } from './elfproef.ts';
import { gs1Mod10 } from './gs1-mod10.ts';
import { CHECKSUM_IDS, CHECKSUMS } from './index.ts';
import { iso7064Mod9710 } from './iso7064-mod97-10.ts';
import { none } from './none.ts';

const LEI = '724500G3PJTYPL2L9M11';
const VALID_LEIS = [LEI, '506700GE1G29325QX363', '213800KUD8LAJWSQ9D15'];
const GS1_VALID = ['6291041500213', '4012345000009', '5412345000013', '4006381333931', '73513537'];

/** Test-only reference: whole-string conversion (A=10 ... Z=35) and BigInt modulo. */
function bigIntReference(value: string): boolean {
  if (!/^[0-9A-Z]{2,}$/.test(value)) return false;
  const digits = [...value]
    .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join('');
  return BigInt(digits) % 97n === 1n;
}

/** Seeded PRNG (mulberry32): reproducible without printing any value. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function digitSubstitutions(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!/[0-9]/.test(value[i] ?? '')) continue;
    for (let d = 0; d <= 9; d++) {
      if (String(d) === value[i]) continue;
      out.push(`${value.slice(0, i)}${d}${value.slice(i + 1)}`);
    }
  }
  return out;
}

describe('iso7064Mod9710', () => {
  test.for(VALID_LEIS)('accepts the valid LEI %s', (lei) => {
    expect(iso7064Mod9710(lei)).toBe(true);
  });

  test('rejects the LEI with a wrong check digit', () => {
    expect(iso7064Mod9710('724500G3PJTYPL2L9M12')).toBe(false);
  });

  test('rejects lowercase, empty, one-character and out-of-alphabet input', () => {
    expect(iso7064Mod9710(LEI.toLowerCase())).toBe(false);
    expect(iso7064Mod9710('')).toBe(false);
    expect(iso7064Mod9710('1')).toBe(false);
    expect(iso7064Mod9710(`${LEI.slice(0, 10)}-${LEI.slice(11)}`)).toBe(false);
    expect(iso7064Mod9710(` ${LEI}`)).toBe(false);
  });

  test('float proof: the whole-string Number approach loses precision, the kernel does not', () => {
    const converted = [...LEI]
      .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)))
      .join('');
    expect(converted.length).toBeGreaterThan(16);
    expect(Number(converted) % 97).not.toBe(1);
    expect(iso7064Mod9710(LEI)).toBe(true);
  });

  test('equals the BigInt reference on every vector and on 1000 seeded random strings', () => {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const next = mulberry32(97);
    const samples = [...VALID_LEIS, '724500G3PJTYPL2L9M12'];
    for (let n = 0; n < 1000; n++) {
      let s = '';
      for (let i = 0; i < 20; i++) s += alphabet[Math.floor(next() * alphabet.length)];
      samples.push(s);
    }
    const mismatches = samples.filter((s) => iso7064Mod9710(s) !== bigIntReference(s));
    expect(samples).toHaveLength(1004);
    expect(mismatches).toHaveLength(0);
  });

  test('the reference accepts the vectors (the comparison is not vacuous)', () => {
    expect(VALID_LEIS.filter((lei) => bigIntReference(lei))).toHaveLength(VALID_LEIS.length);
  });

  test('every single-digit substitution of the LEI fails', () => {
    // Letter substitutions are not asserted: replacing a letter changes the value by a
    // multiple of a non-unit step and can land on remainder 1 (research Pitfall 6).
    const all = digitSubstitutions(LEI);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((v) => iso7064Mod9710(v))).toHaveLength(0);
  });
});

describe('gs1Mod10', () => {
  test.for(GS1_VALID)('accepts %s', (value) => {
    expect(gs1Mod10(value)).toBe(true);
  });

  test('rejects a wrong check digit, empty, one digit and non-digits', () => {
    expect(gs1Mod10('6291041500214')).toBe(false);
    expect(gs1Mod10('')).toBe(false);
    expect(gs1Mod10('0')).toBe(false);
    expect(gs1Mod10('401234500000X')).toBe(false);
    expect(gs1Mod10(' 4012345000009')).toBe(false);
  });

  test('every single-digit substitution of a valid GTIN-13 fails', () => {
    const all = digitSubstitutions('4012345000009');
    expect(all).toHaveLength(117);
    expect(all.filter((v) => gs1Mod10(v))).toHaveLength(0);
  });
});

describe('none', () => {
  test('returns true for everything, including the empty string', () => {
    expect(none('')).toBe(true);
    expect(none('abc')).toBe(true);
    expect(none(LEI)).toBe(true);
  });
});

describe('registry', () => {
  test('CHECKSUM_IDS has the four SPEC section 6.4 ids in order', () => {
    expect([...CHECKSUM_IDS]).toEqual(['elfproef', 'iso7064-mod97-10', 'gs1-mod10', 'none']);
  });

  test('CHECKSUMS has exactly those keys, mapped to the named functions, and is frozen', () => {
    expect(Object.keys(CHECKSUMS)).toEqual([...CHECKSUM_IDS]);
    expect(CHECKSUMS.elfproef).toBe(elfproef);
    expect(CHECKSUMS['iso7064-mod97-10']).toBe(iso7064Mod9710);
    expect(CHECKSUMS['gs1-mod10']).toBe(gs1Mod10);
    expect(CHECKSUMS.none).toBe(none);
    expect(Object.isFrozen(CHECKSUMS)).toBe(true);
  });
});
