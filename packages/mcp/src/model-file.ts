import { readFileSync } from 'node:fs';
import { assertModelContract, createEngine, type Engine, type Model } from '@uio/engine';

/**
 * Read the model file the package ships next to its code (D-04), refuse it unless it carries the
 * contract this engine reads, and compile the engine over it. Throws on any failure (missing file,
 * not JSON, wrong contract, compile error); it writes nothing.
 */
export function loadModelFile(url: URL): { model: Model; engine: Engine } {
  const parsed: unknown = JSON.parse(readFileSync(url, 'utf8'));
  assertModelContract(parsed);
  const engine = createEngine(parsed);
  return { model: parsed, engine };
}
