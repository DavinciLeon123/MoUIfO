import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import { runEoriCase } from './testing/eori-case.ts';
import { loadDistModel } from './testing/load-model.ts';

/**
 * ENG-10 (D-15): the same model and input give identical output. The projected EORI case is a
 * committed golden compared byte for byte. A deliberate change rewrites it and is then reviewed in
 * the diff:
 *   UIO_UPDATE_GOLDEN=1 npx vitest run --project engine packages/engine/src/determinism.test.ts
 * It is never written without that variable (so never in CI); a missing or different golden fails.
 */
const GOLDEN = new URL('../test-fixtures/eori-case.json.golden', import.meta.url);
const UPDATE = process.env.UIO_UPDATE_GOLDEN === '1';

function render(): string {
  return `${JSON.stringify(runEoriCase(createEngine(loadDistModel())), null, 2)}\n`;
}

describe('the EORI case golden', () => {
  test('the projected output equals the committed golden byte for byte', () => {
    const fresh = render();
    if (UPDATE) {
      mkdirSync(dirname(fileURLToPath(GOLDEN)), { recursive: true });
      writeFileSync(GOLDEN, fresh);
      return;
    }
    let committed: string;
    try {
      committed = readFileSync(GOLDEN, 'utf8');
    } catch {
      throw new Error(
        'golden missing: run UIO_UPDATE_GOLDEN=1 npx vitest run --project engine packages/engine/src/determinism.test.ts',
      );
    }
    expect(committed).toBe(fresh);
  });
});
