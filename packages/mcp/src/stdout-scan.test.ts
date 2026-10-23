import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { type Finding, scanServerSource } from './testing/ast-scan.ts';

/**
 * D-11, MCP-05: the server's source and its emitted JavaScript have no stdout or logging path, no
 * network or file-write API and no import outside the allow-list, proven on the syntax tree. The
 * mcp project's globalSetup has emitted `dist/` before this runs.
 */

const SRC_DIR = new URL('./', import.meta.url);
const DIST_DIR = new URL('../dist/', import.meta.url);
const ENGINE_PACKAGE = new URL('../../engine/package.json', import.meta.url);

/** The engine package name is read at runtime: the npm scope lives only in config.yaml (DEC-010). */
const ENGINE_NAME = (JSON.parse(readFileSync(ENGINE_PACKAGE, 'utf8')) as { name: string }).name;

/** The only non-relative specifiers the server code may import. `node:fs` is read-only use. */
const ALLOWED_IMPORTS: readonly string[] = [
  'node:fs',
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/server/stdio',
  'zod/v4',
  ENGINE_NAME,
];

/** Every server source file that ships: all `.ts` under src except tests and `testing/`, sorted. */
function serverSourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => file !== 'testing' && !file.startsWith('testing/'))
    .sort();
}

function describeFindings(findings: readonly Finding[]): string {
  return findings.map((f) => `${f.file}: ${f.rule} ${f.name}`).join('\n');
}

describe('server source scan', () => {
  const files = serverSourceFiles();

  test('the scanned file list holds the core server files and no test file', () => {
    for (const expected of [
      'cli.ts',
      'server.ts',
      'tools.ts',
      'schemas.ts',
      'summary.ts',
      'model-file.ts',
      'index.ts',
    ]) {
      expect(files, `source list lacks ${expected}`).toContain(expected);
    }
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    expect(files.some((f) => f.startsWith('testing/'))).toBe(false);
  });

  test('no server source file has a finding', () => {
    const findings: Finding[] = [];
    for (const file of files) {
      const text = readFileSync(new URL(file, SRC_DIR), 'utf8');
      findings.push(...scanServerSource(text, 'ts', file, ALLOWED_IMPORTS));
    }
    expect(findings, `findings:\n${describeFindings(findings)}`).toEqual([]);
  });
});

describe('emitted JavaScript scan', () => {
  const emitted = readdirSync(DIST_DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.js'))
    .sort();

  test('every source file was emitted', () => {
    for (const file of serverSourceFiles()) {
      expect(emitted, `dist lacks ${file}`).toContain(file.replace(/\.ts$/, '.js'));
    }
  });

  test('no emitted JavaScript file has a finding', () => {
    const findings: Finding[] = [];
    for (const file of emitted) {
      const text = readFileSync(new URL(file, DIST_DIR), 'utf8');
      findings.push(...scanServerSource(text, 'js', file, ALLOWED_IMPORTS));
    }
    expect(findings, `findings:\n${describeFindings(findings)}`).toEqual([]);
  });
});

describe('scanner self-test', () => {
  /** One hostile snippet per reported form: [snippet, rule, name]. */
  const HOSTILE: readonly (readonly [string, string, string])[] = [
    ["console.log('x');", 'console', 'console.log'],
    ["console.info('x');", 'console', 'console.info'],
    ["console.debug('x');", 'console', 'console.debug'],
    ["console.warn('x');", 'console', 'console.warn'],
    ["console['log']('x');", 'console', 'console[]'],
    ["const m = 'error'; console[m]('x');", 'console', 'console[]'],
    ['const { log } = console;', 'console', 'console'],
    ['const c = console;', 'console', 'console'],
    ['let c; c = console;', 'console', 'console'],
    ['use(console);', 'console', 'console'],
    ['const w = console.error;', 'console-error-argument', 'console.error'],
    ['console.error(value);', 'console-error-argument', 'console.error'],
    ["console.error('a', value);", 'console-error-argument', 'console.error'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a hostile snippet, source text on purpose
    ['console.error(`a ${value}`);', 'console-error-argument', 'console.error'],
    ["console.error(...['a']);", 'console-error-argument', 'console.error'],
    ["process.stdout.write('x');", 'process', 'process.stdout'],
    ["process.stderr.write('x');", 'process', 'process.stderr'],
    ['process.stdin.on("data", f);', 'process', 'process.stdin'],
    ['const e = process.env;', 'process', 'process.env'],
    ['const a = process.argv;', 'process', 'process.argv'],
    ['const d = process.cwd();', 'process', 'process.cwd'],
    ["process['stdout'].write('x');", 'process', 'process[]'],
    ['const p = process;', 'process', 'process'],
    ['const { stdout } = process;', 'process', 'process'],
    ["fetch('https://example.invalid');", 'banned-identifier', 'fetch'],
    ['new XMLHttpRequest();', 'banned-identifier', 'XMLHttpRequest'],
    ["new WebSocket('wss://example.invalid');", 'banned-identifier', 'WebSocket'],
    ["new EventSource('https://example.invalid');", 'banned-identifier', 'EventSource'],
    ['new WebTransport(u);', 'banned-identifier', 'WebTransport'],
    ['new RTCPeerConnection();', 'banned-identifier', 'RTCPeerConnection'],
    ['navigator.sendBeacon(u, d);', 'banned-identifier', 'sendBeacon'],
    ["eval('1');", 'banned-identifier', 'eval'],
    ["new Function('return 1');", 'banned-identifier', 'Function'],
    ["require('fs');", 'banned-identifier', 'require'],
    ['const g = globalThis;', 'banned-identifier', 'globalThis'],
    ['const g = global;', 'banned-identifier', 'global'],
    ["globalThis.fetch('u');", 'banned-identifier', 'fetch'],
    ["fs.writeFile('a', 'b', f);", 'banned-identifier', 'writeFile'],
    ["fs.writeFileSync('a', 'b');", 'banned-identifier', 'writeFileSync'],
    ["fs.appendFile('a', 'b', f);", 'banned-identifier', 'appendFile'],
    ["fs.appendFileSync('a', 'b');", 'banned-identifier', 'appendFileSync'],
    ["fs.createWriteStream('a');", 'banned-identifier', 'createWriteStream'],
    ["fs.copyFile('a', 'b', f);", 'banned-identifier', 'copyFile'],
    ["fs.copyFileSync('a', 'b');", 'banned-identifier', 'copyFileSync'],
    ["fs.mkdir('a', f);", 'banned-identifier', 'mkdir'],
    ["fs.mkdirSync('a');", 'banned-identifier', 'mkdirSync'],
    ["fs.rm('a', f);", 'banned-identifier', 'rm'],
    ["fs.rmSync('a');", 'banned-identifier', 'rmSync'],
    ["fs.unlink('a', f);", 'banned-identifier', 'unlink'],
    ["fs.unlinkSync('a');", 'banned-identifier', 'unlinkSync'],
    ["import { writeFileSync } from 'node:fs';", 'banned-identifier', 'writeFileSync'],
    ["const s = 'fetch';", 'banned-string', 'fetch'],
    ["const o = a['writeFileSync'];", 'banned-string', 'writeFileSync'],
    ["const lazy = import('x');", 'dynamic-import', 'import()'],
    ["import x from 'left-pad';", 'import-not-allowed', 'left-pad'],
    ["import 'node:child_process';", 'import-not-allowed', 'node:child_process'],
    ["import type { T } from 'node:net';", 'import-not-allowed', 'node:net'],
    ["export { y } from 'left-pad';", 'import-not-allowed', 'left-pad'],
    ["export * from 'node:http';", 'import-not-allowed', 'node:http'],
  ];

  test.for(HOSTILE)('reports %s', ([snippet, rule, name]) => {
    const findings = scanServerSource(snippet, 'ts', 'hostile.ts', ALLOWED_IMPORTS);
    expect(
      findings.some((f) => f.rule === rule && f.name === name),
      `expected ${rule} ${name}, got:\n${describeFindings(findings)}`,
    ).toBe(true);
  });

  /** One allowed snippet per allowed form. */
  const ALLOWED: readonly string[] = [
    "console.error('a static line');",
    'console.error(`a static line`);',
    "console.error('a', 'b');",
    'console.error();',
    'process.exit(1);',
    'const u = import.meta.url;',
    "import { a } from './a.ts';",
    "export * from '../b.ts';",
    "export { c } from './c.js';",
    "import { readFileSync } from 'node:fs';",
    "import { McpServer } from '@modelcontextprotocol/server';",
    "import { serveStdio } from '@modelcontextprotocol/server/stdio';",
    "import * as z from 'zod/v4';",
    `import type { Engine } from '${ENGINE_NAME}';`,
    'const options = { process: 1, console: 2 }; options.process = options.console;',
    'class A { console = 1; process() { return this.console; } }',
    'type T = { console: string; process: number };',
    'const n: number = 1;',
  ];

  test.for(ALLOWED)('accepts %s', (snippet) => {
    const findings = scanServerSource(snippet, 'ts', 'allowed.ts', ALLOWED_IMPORTS);
    expect(findings, `findings:\n${describeFindings(findings)}`).toEqual([]);
  });

  test('scans JavaScript the same way as TypeScript', () => {
    const findings = scanServerSource(
      "console.log('x'); process.stdout.write('y');",
      'js',
      'hostile.js',
      [],
    );
    expect(findings.map((f) => f.name)).toEqual(['console.log', 'process.stdout']);
  });

  test('findings are sorted by file, rule and name and duplicates collapse', () => {
    const findings = scanServerSource(
      "process.env; console.log('a'); console.log('b'); fetch('u');",
      'ts',
      'sorted.ts',
      [],
    );
    const keys = findings.map((f) => `${f.file}\u0000${f.rule}\u0000${f.name}`);
    expect(keys).toEqual([...keys].sort());
    expect(findings.filter((f) => f.name === 'console.log')).toHaveLength(1);
  });
});
