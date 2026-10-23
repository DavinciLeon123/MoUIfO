import { parseAst } from 'vitest/node';

/**
 * Test helper (never exported from the package, excluded from the package build): the AST scanner
 * behind D-11 and MCP-05. The server speaks JSON-RPC on stdout, so nothing in its code may print
 * to stdout, and nothing may log, send or store an entered value. It needs its own rule set
 * (the engine's scanner bans `console`, `process` and `import.meta` outright, which cli.ts needs):
 *  - `console` may only be `console.error` called with string-literal arguments;
 *  - `process` may only be `process.exit`;
 *  - network, dynamic-code and file-write names are banned in every position;
 *  - an import must be relative or on the allow-list the caller passes;
 *  - from `node:fs` only the names of FS_ALLOWED may be bound (an allow-list, not a deny-list: a
 *    name the list does not know, such as `writeSync` to file descriptor 1, can never slip through);
 *    a default or namespace import, or a re-export of the whole module, is a finding.
 * `parseAst` is the Rolldown parser that `vitest/node` forwards, so no package is added.
 */

export type FindingRule =
  | 'console'
  | 'console-error-argument'
  | 'process'
  | 'banned-identifier'
  | 'banned-string'
  | 'dynamic-import'
  | 'import-not-allowed'
  | 'fs-binding';

export type Finding = { file: string; rule: FindingRule; name: string };

/** Network, dynamic-code and file-write names; each is reported as an identifier or a string. */
export const BANNED_NAMES: ReadonlySet<string> = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'sendBeacon',
  'eval',
  'Function',
  'require',
  'globalThis',
  'global',
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
  'copyFile',
  'copyFileSync',
  'mkdir',
  'mkdirSync',
  'rm',
  'rmSync',
  'unlink',
  'unlinkSync',
]);

/** The only names the server code may bind from `node:fs`: it reads its model file and nothing else. */
export const FS_ALLOWED: ReadonlySet<string> = new Set(['readFileSync']);

/** The module specifiers that name the file system module, with or without the `node:` prefix. */
const FS_MODULES: ReadonlySet<string> = new Set(['node:fs', 'fs']);

type AstNode = { type: string } & Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Visit every node with its ancestors (nearest last). */
function walk(
  node: unknown,
  visit: (n: AstNode, ancestors: readonly AstNode[]) => void,
  ancestors: AstNode[] = [],
): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const self = isNode(node) ? node : null;
  if (self !== null) {
    visit(self, ancestors);
    ancestors.push(self);
  }
  for (const key of Object.keys(node)) {
    walk((node as Record<string, unknown>)[key], visit, ancestors);
  }
  if (self !== null) ancestors.pop();
}

function isIdentifier(node: unknown, name?: string): node is AstNode & { name: string } {
  return isNode(node) && node.type === 'Identifier' && (name === undefined || node.name === name);
}

/** The non-computed property name of a member expression, or null when it is computed. */
function memberName(member: AstNode): string | null {
  if (member.computed === true) return null;
  return isIdentifier(member.property) ? member.property.name : null;
}

/** True when the identifier is only a name: a non-computed member property or object key. */
function isPlainName(node: AstNode, parent: AstNode | undefined): boolean {
  if (parent === undefined) return false;
  if (parent.type === 'MemberExpression')
    return parent.property === node && parent.computed !== true;
  if (
    parent.type === 'Property' ||
    parent.type === 'PropertyDefinition' ||
    parent.type === 'MethodDefinition' ||
    parent.type === 'TSPropertySignature' ||
    parent.type === 'TSMethodSignature'
  ) {
    return parent.key === node && parent.computed !== true && parent.shorthand !== true;
  }
  return false;
}

/** A string literal, or a template literal without expressions. */
function isLiteralText(node: unknown): boolean {
  if (!isNode(node)) return false;
  if (node.type === 'Literal') return typeof node.value === 'string';
  if (node.type === 'TemplateLiteral') {
    return Array.isArray(node.expressions) && node.expressions.length === 0;
  }
  return false;
}

function sourceValue(node: AstNode): string | null {
  const source = node.source;
  if (isNode(source) && typeof source.value === 'string') return source.value;
  return null;
}

/** The name an import or export specifier binds from the module, or null for a default or namespace. */
function boundName(specifier: AstNode): string | null {
  const name = specifier.type === 'ExportSpecifier' ? specifier.local : specifier.imported;
  if (isIdentifier(name)) return name.name;
  if (isNode(name) && name.type === 'Literal' && typeof name.value === 'string') return name.value;
  return null;
}

/** Report every binding of a `node:fs` import or re-export that FS_ALLOWED does not list. */
function checkFsBindings(node: AstNode, report: (rule: FindingRule, name: string) => void): void {
  if (node.type === 'ExportAllDeclaration') {
    report('fs-binding', 'node:fs *');
    return;
  }
  const specifiers = Array.isArray(node.specifiers) ? (node.specifiers as AstNode[]) : [];
  for (const specifier of specifiers) {
    if (!isNode(specifier)) continue;
    if (specifier.type === 'ImportDefaultSpecifier') {
      report('fs-binding', 'node:fs default');
    } else if (specifier.type === 'ImportNamespaceSpecifier') {
      report('fs-binding', 'node:fs *');
    } else {
      const name = boundName(specifier);
      if (name === null || !FS_ALLOWED.has(name)) report('fs-binding', `node:fs ${name ?? '?'}`);
    }
  }
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function compareFindings(a: Finding, b: Finding): number {
  const left = `${a.file}\u0000${a.rule}\u0000${a.name}`;
  const right = `${b.file}\u0000${b.rule}\u0000${b.name}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Is this member expression the callee of a call whose arguments are all literal text? */
function isLiteralErrorCall(member: AstNode, parent: AstNode | undefined): boolean {
  if (parent === undefined || parent.type !== 'CallExpression' || parent.callee !== member) {
    return false;
  }
  const args = parent.arguments;
  return Array.isArray(args) && args.every(isLiteralText);
}

/**
 * Scan one file's text. Findings are sorted by file, rule and name, duplicates collapsed.
 * `allowedImports` lists the non-relative import specifiers the file may use.
 */
export function scanServerSource(
  text: string,
  lang: 'ts' | 'js',
  file: string,
  allowedImports: readonly string[],
): Finding[] {
  const allowed = new Set(allowedImports);
  const seen = new Map<string, Finding>();
  const report = (rule: FindingRule, name: string): void => {
    seen.set(`${rule}\u0000${name}`, { file, rule, name });
  };

  walk(parseAst(text, { lang }), (n, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    switch (n.type) {
      case 'ImportExpression':
        report('dynamic-import', 'import()');
        break;
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration': {
        const specifier = sourceValue(n);
        if (specifier !== null && !isRelative(specifier) && !allowed.has(specifier)) {
          report('import-not-allowed', specifier);
        }
        if (specifier !== null && FS_MODULES.has(specifier)) checkFsBindings(n, report);
        break;
      }
      case 'Literal':
        if (typeof n.value === 'string' && BANNED_NAMES.has(n.value)) {
          report('banned-string', n.value);
        }
        break;
      case 'Identifier': {
        const name = n.name as string;
        if (BANNED_NAMES.has(name)) report('banned-identifier', name);
        if (name !== 'console' && name !== 'process') break;
        if (isPlainName(n, parent)) break;
        const isObject = parent?.type === 'MemberExpression' && parent.object === n;
        const rule = name === 'console' ? 'console' : 'process';
        if (!isObject || parent === undefined) {
          report(rule, name);
          break;
        }
        const member = memberName(parent);
        if (member === null) {
          report(rule, `${name}[]`);
        } else if (name === 'process') {
          if (member !== 'exit') report('process', `process.${member}`);
        } else if (member !== 'error') {
          report('console', `console.${member}`);
        } else if (!isLiteralErrorCall(parent, ancestors[ancestors.length - 2])) {
          report('console-error-argument', 'console.error');
        }
        break;
      }
      default:
        break;
    }
  });
  return [...seen.values()].sort(compareFindings);
}
