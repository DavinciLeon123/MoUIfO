// DEC-022: the guard keeps its own elfproef (scan.ts never imports the engine); this test, and only
// this test, proves the two implementations agree. Assertions compare counts and never print values.
import { elfproef } from '@uio/engine';
import { expect, test } from 'vitest';
import { isElfproef } from './scan.ts';

// The only 9-digit literal allowed here: public, allow-listed example value.
const PUBLIC_EXAMPLE = '001469630';

/** Seeded PRNG (mulberry32) so a failure is reproducible without printing any value. */
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

test('guard isElfproef and kernel elfproef agree on 200000 seeded strings, the substitutions and the example', () => {
  const next = mulberry32(0x5eed);
  const samples: string[] = [PUBLIC_EXAMPLE, ...substitutions(PUBLIC_EXAMPLE)];
  for (let n = 0; n < 200_000; n++) {
    samples.push(String(Math.floor(next() * 1_000_000_000)).padStart(9, '0'));
  }

  let mismatches = 0;
  let bothAccept = 0;
  for (const sample of samples) {
    const guard = isElfproef(sample);
    const kernel = elfproef(sample);
    if (guard !== kernel) mismatches++;
    if (guard && kernel) bothAccept++;
  }

  expect(samples).toHaveLength(200_000 + 82);
  expect(mismatches).toBe(0);
  expect(bothAccept).toBeGreaterThan(0);
});
