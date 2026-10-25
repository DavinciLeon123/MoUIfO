import { existsSync } from 'node:fs';
import { join } from 'node:path';
import preact from '@preact/preset-vite';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { defaultClientConditions, defineConfig, type Plugin } from 'vite';

// The Content-Security-Policy of the built page (D-19, WEB-10). GitHub Pages cannot send headers,
// so the policy travels in a meta element that comes first in <head>; `connect-src 'none'` means
// the page can never send a value anywhere.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Build only: the CSP meta first in head, then the no-referrer meta. The tags are written into the
 * HTML text because Vite's tag serializer would turn the quotes of the policy into entities.
 */
function cspMeta(): Plugin {
  const tags = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="referrer" content="no-referrer">`;
  return {
    name: 'uio-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('<head>', `<head>\n    ${tags}`),
    },
  };
}

const MODEL_ID = 'virtual:uio-model';

/** Resolves the module id of the bundled model to dist/model.json, which only this build knows. */
function uioModel(): Plugin {
  const modelPath = join(REPO_ROOT, 'dist', 'model.json');
  return {
    name: 'uio-model',
    resolveId(id) {
      if (id !== MODEL_ID) return null;
      if (!existsSync(modelPath)) {
        throw new Error('dist/model.json is missing: run "npm run build:dist" first');
      }
      return modelPath;
    },
  };
}

export default defineConfig({
  base: loadConfig().pages_base_path,
  plugins: [preact(), cspMeta(), uioModel()],
  resolve: { conditions: [...defaultClientConditions, 'uio-source'] },
  build: { modulePreload: { polyfill: false } },
});
