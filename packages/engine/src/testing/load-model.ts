import { readFileSync } from 'node:fs';
import type { Model } from '../model-types.ts';

/** Test helper (never exported from the package): read the real built model, `dist/model.json`. */
export function loadDistModel(): Model {
  const url = new URL('../../../../dist/model.json', import.meta.url);
  let text: string;
  try {
    text = readFileSync(url, 'utf8');
  } catch {
    throw new Error('dist/model.json is missing: run "npm run build:dist" first');
  }
  return JSON.parse(text) as Model;
}
