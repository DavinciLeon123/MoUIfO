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

function run(steps: readonly unknown[], value: string): string | null {
  return compiled(steps).run(value);
}

function errorSteps(steps: readonly unknown[]): number[] {
  const result = compileTransform(steps);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((error) => error.step);
}

describe('strip_prefix and strip_suffix boundaries (T-02-12)', () => {
  test.for([
    ['strip_prefix', 0, 'abc'],
    ['strip_prefix', 3, ''],
    ['strip_prefix', 4, null],
    ['strip_suffix', 0, 'abc'],
    ['strip_suffix', 3, ''],
    ['strip_suffix', 4, null],
  ] as const)('%s: %i on abc gives %j', ([operation, n, expected]) => {
    expect(run([{ [operation]: n }], 'abc')).toBe(expected);
  });

  test('strip_suffix 3 on a vat-nl value gives the core with the NL prefix', () => {
    expect(run([{ strip_suffix: 3 }], 'NL001469630B01')).toBe('NL001469630');
  });

  test.for([-1, 1.5, '1', null] as const)(
    'a non-integer or negative argument %j is a compile error',
    (n) => {
      expect(errorSteps([{ strip_prefix: n }])).toEqual([0]);
      expect(errorSteps([{ strip_suffix: n }])).toEqual([0]);
    },
  );
});

describe('add_prefix and add_suffix', () => {
  test('add_prefix', () => {
    expect(run([{ add_prefix: 'NL' }], '001469630')).toBe('NL001469630');
  });
  test('add_suffix', () => {
    expect(run([{ add_suffix: 'B01' }], 'NL001469630')).toBe('NL001469630B01');
  });
  test.for([{ add_prefix: '' }, { add_suffix: '' }, { add_prefix: 1 }, { add_suffix: null }])(
    '%j is a compile error',
    (step) => {
      expect(errorSteps([step])).toEqual([0]);
    },
  );
});

describe('pad_left', () => {
  test('pads to length with the char', () => {
    expect(run([{ pad_left: { length: 9, char: '0' } }], '1469630')).toBe('001469630');
  });
  test('leaves a longer value unchanged', () => {
    expect(run([{ pad_left: { length: 3, char: '0' } }], '14696')).toBe('14696');
  });
  test.for([
    { pad_left: { length: 9, char: '00' } },
    { pad_left: { length: 9, char: '' } },
    { pad_left: { length: 0, char: '0' } },
    { pad_left: { length: 1.5, char: '0' } },
    { pad_left: { length: 9, char: '0', extra: 1 } },
    { pad_left: 9 },
  ])('%j is a compile error', (step) => {
    expect(errorSteps([step])).toEqual([0]);
  });
});

describe('uppercase', () => {
  test('upper-cases the bare string step', () => {
    expect(run(['uppercase'], 'nl001469630b01')).toBe('NL001469630B01');
  });
  test('uppercase with an argument is a compile error', () => {
    expect(errorSteps([{ uppercase: true }])).toEqual([0]);
  });
  test('upper-casing does not depend on the locale (dotless i stays an ordinary letter)', () => {
    expect(run(['uppercase'], 'i')).toBe('I');
  });
});

describe('remove', () => {
  test('deletes every character of the argument from the value', () => {
    expect(run([{ remove: ' .-' }], 'NL 0014.6963-0')).toBe('NL001469630');
  });
  test('an empty set is a compile error', () => {
    expect(errorSteps([{ remove: '' }])).toEqual([0]);
  });
  test('a non-string set is a compile error', () => {
    expect(errorSteps([{ remove: 5 }])).toEqual([0]);
  });
});

describe('template', () => {
  test('{value} is the current value', () => {
    expect(run([{ template: 'NL{value}B01' }], '001469630')).toBe('NL001469630B01');
  });
  test('{capture:n} reads the most recent preceding capture', () => {
    expect(
      run(
        [{ capture: { regex: '^NL([0-9]{9})$', group: 1 } }, { template: '{capture:1}' }],
        'NL001469630',
      ),
    ).toBe('001469630');
  });
  test('{capture:0} is the whole match of the most recent capture', () => {
    expect(
      run([{ capture: { regex: '[0-9]+', group: 0 } }, { template: '<{capture:0}>' }], 'ab12cd'),
    ).toBe('<12>');
  });
  test('the most recent capture wins', () => {
    expect(
      run(
        [
          { capture: { regex: '^(a)(b)$', group: 0 } },
          { capture: { regex: '(b)', group: 0 } },
          { template: '{capture:1}' },
        ],
        'ab',
      ),
    ).toBe('b');
  });
  test.for([
    ['no preceding capture', '{capture:1}'],
    ['{bogus}', '{bogus}'],
    ['a lone {', 'a{b'],
    ['a lone }', 'a}b'],
    ['an empty placeholder', '{}'],
    ['a non-decimal index', '{capture:x}'],
  ] as const)('%s is a compile error naming the step index', ([, text]) => {
    expect(errorSteps([{ add_prefix: 'a' }, { template: text }])).toEqual([1]);
  });
  test('{capture:2} after a one-group capture is a compile error', () => {
    expect(
      errorSteps([{ capture: { regex: '^NL([0-9]{9})$', group: 1 } }, { template: '{capture:2}' }]),
    ).toEqual([1]);
  });
  test('a non-string template is a compile error', () => {
    expect(errorSteps([{ template: 1 }])).toEqual([0]);
  });
});

describe('empty edge', () => {
  test('strip_prefix 0 on the empty string gives the empty string', () => {
    expect(run([{ strip_prefix: 0 }], '')).toBe('');
  });
  test('a non-matching capture on the empty string gives null', () => {
    expect(run([{ capture: { regex: '^[0-9]+$', group: 0 } }], '')).toBeNull();
  });
  test('template {value} on the empty string gives the empty string', () => {
    expect(run([{ template: '{value}' }], '')).toBe('');
  });
});

describe('ordering edge and null propagation', () => {
  test('steps run in list order', () => {
    expect(run([{ strip_prefix: 1 }, { add_prefix: 'Z' }], 'abc')).toBe('Zbc');
    expect(run([{ add_prefix: 'Z' }, { strip_prefix: 1 }], 'abc')).toBe('abc');
  });
  test('once a step gives null the whole transform gives null', () => {
    expect(run([{ capture: { regex: '^X', group: 0 } }, { add_suffix: 'Y' }], 'abc')).toBeNull();
  });
  test('a run keeps no state between calls', () => {
    const transform = compiled([
      { capture: { regex: '^NL([0-9]{9})$', group: 1 } },
      { template: '{capture:1}!' },
    ]);
    expect(transform.run('NL001469630')).toBe('001469630!');
    expect(transform.run('XX')).toBeNull();
    expect(transform.run('NL001469630')).toBe('001469630!');
  });
});

describe('compile errors are collected per step', () => {
  test('every failing step of a list is reported', () => {
    expect(errorSteps([{ shout: 1 }, { add_prefix: 'a' }, { strip_prefix: -1 }, 'lower'])).toEqual([
      0, 2, 3,
    ]);
  });
  test.for([[{ strip_prefix: 1, add_prefix: 'a' }], [42], [null], [[]]] as const)(
    'step shape %j is a compile error',
    ([step]) => {
      expect(errorSteps([step])).toEqual([0]);
    },
  );
});

describe('every operation is implemented', () => {
  const sample: Record<string, { step: unknown; input: string; expected: string }> = {
    strip_prefix: { step: { strip_prefix: 1 }, input: 'abc', expected: 'bc' },
    strip_suffix: { step: { strip_suffix: 1 }, input: 'abc', expected: 'ab' },
    add_prefix: { step: { add_prefix: 'x' }, input: 'abc', expected: 'xabc' },
    add_suffix: { step: { add_suffix: 'x' }, input: 'abc', expected: 'abcx' },
    pad_left: { step: { pad_left: { length: 4, char: '0' } }, input: 'abc', expected: '0abc' },
    uppercase: { step: 'uppercase', input: 'abc', expected: 'ABC' },
    remove: { step: { remove: 'b' }, input: 'abc', expected: 'ac' },
    capture: { step: { capture: { regex: '(b)', group: 1 } }, input: 'abc', expected: 'b' },
    template: { step: { template: '[{value}]' }, input: 'abc', expected: '[abc]' },
  };

  test.for([...TRANSFORM_OPERATIONS])('%s has a passing run test', (name) => {
    const entry = sample[name];
    expect(entry, `no sample for ${name}`).toBeDefined();
    if (entry) expect(run([entry.step], entry.input)).toBe(entry.expected);
  });
});
