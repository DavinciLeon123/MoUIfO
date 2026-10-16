import { expect, test } from 'vitest';
import { assertModelContract, MODEL_CONTRACT } from './model-types.ts';

test('MODEL_CONTRACT is 1', () => {
  expect(MODEL_CONTRACT).toBe(1);
});

test('assertModelContract accepts an object whose contract is MODEL_CONTRACT', () => {
  expect(() => assertModelContract({ contract: 1 })).not.toThrow();
});

test('assertModelContract throws for another contract and names both numbers', () => {
  expect(() => assertModelContract({ contract: 2 })).toThrow(/1.*2|2.*1/);
});

test('assertModelContract throws for a value that is not an object', () => {
  for (const value of [null, undefined, 1, 'model', [1]]) {
    expect(() => assertModelContract(value)).toThrow(Error);
  }
});

test('assertModelContract throws for an object without a contract', () => {
  expect(() => assertModelContract({})).toThrow(Error);
});
