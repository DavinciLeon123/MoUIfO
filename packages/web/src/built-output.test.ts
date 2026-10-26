// WEB-10 and DEC-076: the built site is scanned on every test run. The real `vite build` writes to a
// temporary folder, then the emitted index.html must carry the Content-Security-Policy meta first
// in head with exactly the nine directives of DEC-076, the no-referrer meta next, no inline script
// or style and asset URLs only under the configured base; the emitted JavaScript and CSS must hold
// no network, storage, cookie, service-worker or dynamic-code API, and the model must be bundled
// (so the page never has to fetch it). The browser-side evidence is e2e/privacy.e2e.ts.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from 'uio-config';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = loadConfig().pages_base_path;

/** The policy of DEC-076, written out here so that a change to the build must change this test. */
const DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
];

/** The vite CLI file, read from the `bin` field of the installed vite package. */
function viteBin(): string {
  const packageJson = createRequire(import.meta.url).resolve('vite/package.json');
  const { bin } = JSON.parse(readFileSync(packageJson, 'utf8')) as { bin: { vite: string } };
  return join(dirname(packageJson), bin.vite);
}

/** Every file under a folder, as a path relative to it. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .sort();
}

let out = '';
let html = '';
let scripts: { file: string; text: string }[] = [];
let styles: { file: string; text: string }[] = [];

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'uio-web-build-'));
  const build = spawnSync(
    process.execPath,
    [viteBin(), 'build', '--outDir', out, '--emptyOutDir'],
    { cwd: WEB_ROOT, encoding: 'utf8', timeout: 120_000 },
  );
  if (build.status !== 0) {
    throw new Error(`vite build failed (${build.status}): ${build.stdout}\n${build.stderr}`);
  }
  html = readFileSync(join(out, 'index.html'), 'utf8');
  const emitted = filesUnder(out).filter((file) => /\.(js|css)$/.test(file));
  const read = (extension: string) =>
    emitted
      .filter((file) => file.endsWith(extension))
      .map((file) => ({ file, text: readFileSync(join(out, file), 'utf8') }));
  scripts = read('.js');
  styles = read('.css');
}, 130_000);

afterAll(() => {
  if (out !== '') rmSync(out, { recursive: true, force: true });
});

describe('index.html of a fresh build', () => {
  test('the CSP meta is the first element of head and holds exactly the nine directives of DEC-076', () => {
    const match = /<head>\s*<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(
      html,
    );
    expect(match, 'the CSP meta is not the first element after <head>').not.toBeNull();
    expect((match?.[1] ?? '').split('; ')).toEqual(DIRECTIVES);
  });

  test('the no-referrer meta follows the CSP meta', () => {
    expect(html).toMatch(
      /Content-Security-Policy"[^>]*>\s*<meta name="referrer" content="no-referrer">/,
    );
  });

  test('there is no inline script and no inline style', () => {
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag, 'a script without src').toMatch(/\ssrc="/);
    expect(html).not.toMatch(/<script\b[^>]*>\s*(?!<\/script>)\S/);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  test('every asset URL that is not an external link starts with the configured base', () => {
    const urls = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(urls.length).toBeGreaterThan(2);
    for (const url of urls) {
      if (/^https?:\/\//i.test(url)) continue;
      expect(url.startsWith(BASE), `${url} does not start with ${BASE}`).toBe(true);
    }
    // The favicon is a same-origin asset under the base, never a request to the site root.
    expect(urls).toContain(`${BASE}favicon.svg`);
  });
});

/** Word-boundary patterns, so that model words such as "retrieval" never match. */
const FORBIDDEN_IN_SCRIPT: readonly [string, RegExp][] = [
  ['a call to fetch', /(?<![\w$])fetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['document.cookie', /\bdocument\s*\.\s*cookie\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['serviceWorker', /\bserviceWorker\b/],
  ['a call to eval', /(?<![\w$.])eval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
];

describe('emitted JavaScript and CSS', () => {
  test('the build emitted JavaScript and CSS to scan', () => {
    expect(scripts.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
  });

  test('no emitted JavaScript holds a network, storage, cookie, service-worker or eval API', () => {
    // Preact's own innerHTML support stays in the bundle; raw-HTML use in the site code is blocked by
    // Biome's noDangerouslySetInnerHtml, so it is not scanned for here.
    for (const { file, text } of scripts) {
      for (const [name, pattern] of FORBIDDEN_IN_SCRIPT) {
        expect(pattern.test(text), `${file} contains ${name}`).toBe(false);
      }
    }
  });

  test('no emitted CSS imports another file or loads a url from another origin', () => {
    for (const { file, text } of styles) {
      expect(text, `${file} has an @import`).not.toMatch(/@import\b/);
      expect(text, `${file} has a url() outside the site`).not.toMatch(
        /url\(\s*["']?\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i,
      );
    }
  });

  test('the model is bundled in the JavaScript, so the page has nothing to fetch', () => {
    const bundled = scripts.some(({ text }) => text.includes('eori-validation'));
    expect(bundled, 'the source id eori-validation is not in any emitted script').toBe(true);
  });
});
