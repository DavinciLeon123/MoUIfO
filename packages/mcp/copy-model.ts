import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Build step (D-04): copy the repository's built `dist/model.json` next to the compiled code, so the
 * published package carries its model and reads it relative to the module. Always overwrites; fails
 * loudly when the source is missing. Runs as native TypeScript (the repository's Node floor), never
 * from the published package. Changes no file mode.
 */
const SOURCE = new URL('../../dist/model.json', import.meta.url);
const TARGET_DIR = new URL('./dist/', import.meta.url);
const TARGET = new URL('./dist/model.json', import.meta.url);

if (!existsSync(SOURCE)) {
  throw new Error('dist/model.json is missing: run "npm run build:dist" first');
}
mkdirSync(fileURLToPath(TARGET_DIR), { recursive: true });
copyFileSync(SOURCE, TARGET);
