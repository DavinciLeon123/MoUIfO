import { parseAst } from 'vitest/node';

/**
 * Test helper (never exported from the package, excluded from the package build): an AST-level
 * scanner for ENG-11 and ENG-10. `parseAst` is the Rolldown parser that Vite re-exports and
 * `vitest/node` forwards, so no package is added to any package.json.
 */

/**
 * Identifier names the engine must not use as any name (a binding, a property, a type name).
 * Network and dynamic-code APIs guard ENG-11 (no external requests); clock, locale, logging and
 * timer names guard ENG-10 (same input and model give the same output).
 */
export const BANNED_IDENTIFIERS: ReadonlySet<string> = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'sendBeacon',
  'importScripts',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'eval',
  'Function',
  'require',
  'process',
  'navigator',
  'window',
  'self',
  'document',
  'globalThis',
  'global',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'Image',
  'Date',
  'Intl',
  'localeCompare',
  'toLocaleString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  'toLocaleDateString',
  'toLocaleTimeString',
  'console',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'performance',
]);

export type FindingRule =
  | 'dynamic-import'
  | 'import-meta'
  | 'banned-identifier'
  | 'banned-string'
  | 'random'
  | 'non-relative-import';

export type Finding = { file: string; rule: FindingRule; name: string };

type AstNode = { type: string } & Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Visit every node of an ESTree-shaped tree: arrays and objects, any key holding a `type` string. */
function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  if (isNode(node)) visit(node);
  for (const key of Object.keys(node)) walk((node as Record<string, unknown>)[key], visit);
}

function parse(text: string, lang: 'ts' | 'js'): unknown {
  return parseAst(text, { lang });
}

function sourceValue(node: AstNode): string | null {
  const source = node.source;
  if (isNode(source) && typeof source.value === 'string') return source.value;
  return null;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function isImportOrExport(node: AstNode): boolean {
  return (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportAllDeclaration'
  );
}

function isMathRandom(node: AstNode): boolean {
  const { object, property, computed } = node;
  if (!isNode(object) || object.type !== 'Identifier' || object.name !== 'Math') return false;
  if (!isNode(property)) return false;
  if (computed === true) return property.type === 'Literal' && property.value === 'random';
  return property.type === 'Identifier' && property.name === 'random';
}

function compareFindings(a: Finding, b: Finding): number {
  const left = `${a.file}\u0000${a.rule}\u0000${a.name}`;
  const right = `${b.file}\u0000${b.rule}\u0000${b.name}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Scan one file's text; findings are sorted by file, rule and name, duplicates collapsed. */
export function scanSource(text: string, lang: 'ts' | 'js', file: string): Finding[] {
  const seen = new Map<string, Finding>();
  const report = (rule: FindingRule, name: string): void => {
    seen.set(`${rule}\u0000${name}`, { file, rule, name });
  };
  walk(parse(text, lang), (n) => {
    switch (n.type) {
      case 'ImportExpression':
        report('dynamic-import', 'import()');
        break;
      case 'MetaProperty':
        report('import-meta', 'import.meta');
        break;
      case 'Identifier':
        if (typeof n.name === 'string' && BANNED_IDENTIFIERS.has(n.name)) {
          report('banned-identifier', n.name);
        }
        break;
      case 'Literal':
        if (typeof n.value === 'string' && BANNED_IDENTIFIERS.has(n.value)) {
          report('banned-string', n.value);
        }
        break;
      case 'MemberExpression':
        if (isMathRandom(n)) report('random', 'Math.random');
        break;
      default:
        break;
    }
    if (isImportOrExport(n)) {
      const specifier = sourceValue(n);
      if (specifier !== null && !isRelative(specifier)) report('non-relative-import', specifier);
    }
  });
  return [...seen.values()].sort(compareFindings);
}
