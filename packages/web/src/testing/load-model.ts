import { readFileSync } from 'node:fs';

/**
 * Test helper (never imported by the page, never built): the real built model, `dist/model.json`,
 * as untyped JSON. Mirror of packages/mcp/src/testing/load-model.ts with the URL adjusted to this
 * file's depth; tests turn it into a host through `createHost` in src/engine-host.ts.
 */
export function loadDistJson(): unknown {
  const url = new URL('../../../../dist/model.json', import.meta.url);
  let text: string;
  try {
    text = readFileSync(url, 'utf8');
  } catch {
    throw new Error('dist/model.json is missing: run "npm run build:dist" first');
  }
  return JSON.parse(text);
}
