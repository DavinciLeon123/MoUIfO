import { describe, expect, test } from 'vitest';
import {
  compilePattern,
  compileTransform,
  REGEX_FLAGS,
  TRANSFORM_OPERATIONS,
} from './transform.ts';

const CAPTURE_NL = { capture: { regex: '^NL([0-9]{9})B[0-9]{2}$', group: 1 } };

function compiled(steps: readonly unknown[]) {
  const result = compileTransform(steps);
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.errors)}`);
  return result;
}

describe('constants', () => {
  test('TRANSFORM_OPERATIONS lists the nine SPEC 5.3 names in order', () => {
    expect([...TRANSFORM_OPERATIONS]).toEqual([
      'strip_prefix',
      'strip_suffix',
      'add_prefix',
      'add_suffix',
      'pad_left',
      'uppercase',
      'remove',
      'capture',
      'template',
    ]);
  });

  test('regexes compile with the single flag u', () => {
    expect(REGEX_FLAGS).toBe('u');
  });
});

describe('compilePattern', () => {
  test.for([
    ['^([A-Z]{2})', 1],
    ['^(?<cc>[A-Z]{2})(x)', 2],
    ['^[A-Z]{2}$', 0],
  ] as const)('%s has %i groups', ([source, groups]) => {
    const result = compilePattern(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.groups).toBe(groups);
  });

  test('an invalid pattern fails with a message', () => {
    const result = compilePattern('(');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('compileTransform (tracer: capture and shape checks)', () => {
  test('capture group 1 extracts the core of a vat-nl value', () => {
    expect(compiled([CAPTURE_NL]).run('NL001469630B01')).toBe('001469630');
  });

  test('capture gives null when there is no match', () => {
    expect(compiled([CAPTURE_NL]).run('XX')).toBeNull();
  });

  test('an unknown operation is a compile error naming step 0 and the key', () => {
    const result = compileTransform([{ shout: 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.step).toBe(0);
      expect(result.errors[0]?.message).toContain('shout');
    }
  });

  test('an empty step list is a compile error', () => {
    expect(compileTransform([]).ok).toBe(false);
  });
});
