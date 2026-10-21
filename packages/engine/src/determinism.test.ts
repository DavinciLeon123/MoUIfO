import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import type { Model } from './model-types.ts';
import { runEoriCase } from './testing/eori-case.ts';
import { loadDistModel } from './testing/load-model.ts';

/**
 * ENG-10 (D-15): the same model and input give identical output. The projected EORI case is a
 * committed golden compared byte for byte. A deliberate change rewrites it and is then reviewed in
 * the diff:
 *   UIO_UPDATE_GOLDEN=1 npx vitest run --project engine packages/engine/src/determinism.test.ts
 * It is never written without that variable (so never in CI); a missing or different golden fails.
 */
const CLI = fileURLToPath(new URL('./testing/eori-case-cli.ts', import.meta.url));
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

/** Rebuild an object with its own keys in reverse insertion order (values untouched, lists unchanged). */
function reverseKeys<T extends object>(value: T): T {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value).reverse()) {
    copy[key] = (value as Record<string, unknown>)[key];
  }
  return copy as T;
}

/** A copy of the model whose maps and scheme objects have their keys inserted in reverse order. */
function reversedModel(model: Model): Model {
  const schemes: Model['schemes'] = {};
  for (const [id, scheme] of Object.entries(reverseKeys(model.schemes))) {
    schemes[id] = reverseKeys(scheme);
  }
  return {
    contract: model.contract,
    model_version: model.model_version,
    schemes,
    authorities: reverseKeys(model.authorities),
    jurisdictions: reverseKeys(model.jurisdictions),
    sources: reverseKeys(model.sources),
    vocab: reverseKeys(model.vocab),
  };
}

describe('determinism of the engine (ENG-10)', () => {
  test('two fresh engines over two separately loaded models agree, and so do two calls on one engine', () => {
    const first = render();
    const second = render();
    expect(second).toBe(first);
    const engine = createEngine(loadDistModel());
    const once = JSON.stringify(runEoriCase(engine));
    expect(JSON.stringify(runEoriCase(engine))).toBe(once);
  });

  test('a second process under LC_ALL=C, LANG=C and TZ=Asia/Tokyo prints the same output', () => {
    const child = spawnSync(process.execPath, [CLI], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'Asia/Tokyo' },
    });
    if (child.status !== 0) {
      throw new Error(`child exited ${child.status}\n${child.stderr}`);
    }
    expect(child.stdout).toBe(render());
  }, 30_000);

  test('a model whose table keys are inserted in reverse order gives the same output', () => {
    const reversed = reversedModel(loadDistModel());
    // The helper really reversed something, so the equality below is not trivial.
    expect(Object.keys(reversed.schemes)).toEqual(Object.keys(loadDistModel().schemes).reverse());
    const text = `${JSON.stringify(runEoriCase(createEngine(reversed)), null, 2)}\n`;
    expect(text).toBe(render());
  });

  test('mutating a returned result does not change any later result', () => {
    const engine = createEngine(loadDistModel());
    const rawDerive = () => JSON.stringify(engine.derive('NL001469630', 'eori'));
    const rawCheck = () =>
      JSON.stringify(engine.check(['NL001469630', 'NL001469630B01', '001469630']));
    const deriveBefore = rawDerive();
    const checkBefore = rawCheck();

    // Frozen results are allowed: each attempt ignores a TypeError.
    const attempt = (change: () => void): void => {
      try {
        change();
      } catch (error) {
        if (!(error instanceof TypeError)) {
          throw error;
        }
      }
    };
    const results = [
      engine.derive('NL001469630', 'eori'),
      engine.check(['NL001469630', 'NL001469630B01', '001469630']),
    ];
    let sourcesSeen = 0;
    for (const result of results) {
      for (const conclusion of result.conclusions) {
        attempt(() => {
          conclusion.explanation.push(
            conclusion.explanation[0] as (typeof conclusion.explanation)[0],
          );
        });
        attempt(() => {
          conclusion.certainty = 'possible';
        });
        for (const step of conclusion.explanation) {
          attempt(() => {
            step.certainty = 'possible';
          });
          if (step.source !== null) {
            const source = step.source;
            sourcesSeen += 1;
            attempt(() => {
              source.title = 'changed';
            });
          }
        }
      }
    }
    // The mutations ran over real SourceRef objects, so the comparison below is not trivial.
    expect(sourcesSeen).toBeGreaterThan(0);

    expect(rawDerive()).toBe(deriveBefore);
    expect(rawCheck()).toBe(checkBefore);
  });
});
