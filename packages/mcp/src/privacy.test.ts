import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine } from '@uio/engine';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadDistModel } from './testing/load-model.ts';
import { CLI_PATH, connectSpawned } from './testing/spawn-client.ts';
import { syntheticInvalid, syntheticValid } from './testing/synthetic-values.ts';

/**
 * D-11, MCP-05, SC-4: over a really spawned `node dist/cli.js`, no entered value reaches stderr
 * (the owner chose "captured stderr contains no value", not "fully silent stderr"), stdout carries
 * only JSON-RPC messages, the process exits 0 when stdin ends and writes nothing to disk, and the
 * SPEC section 10 EORI case answers exactly as the engine does. Synthetic nine-digit values are
 * built at runtime; the only nine-digit literal is the public example RSIN.
 */

const EORI = 'NL001469630';
const VAT = 'NL001469630B01';
const RSIN = '001469630';

const engine = createEngine(loadDistModel());

/** Every value entered in any session below: each must be absent from every captured stderr. */
const ENTERED: readonly string[] = [
  EORI,
  VAT,
  RSIN,
  syntheticValid(0),
  syntheticValid(1),
  syntheticInvalid(0),
];

type Reply = { isError?: boolean; structuredContent?: unknown };

type EraRun = {
  derive: Reply;
  check: Reply;
  stderr: string;
};

const children: ChildProcess[] = [];
const scratch: string[] = [];

afterAll(() => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A call the server may refuse (rejected argument, unknown tool): only its absence of a leak matters. */
async function tolerate(call: Promise<unknown>): Promise<void> {
  try {
    await call;
  } catch {
    // a protocol error for a refused call is the expected outcome here
  }
}

describe.each(['legacy', 'auto'] as const)('a spawned client session in the %s era', (mode) => {
  let run: EraRun;

  beforeAll(async () => {
    const session = await connectSpawned(mode);
    try {
      const derive = (await session.client.callTool({
        name: 'uio_derive',
        arguments: { value: EORI, scheme: 'eori' },
      })) as Reply;
      const check = (await session.client.callTool({
        name: 'uio_check',
        arguments: { values: [EORI, VAT, RSIN] },
      })) as Reply;
      const valid = syntheticValid(0);
      const other = syntheticValid(1);
      await tolerate(
        session.client.callTool({ name: 'uio_recognise', arguments: { value: valid } }),
      );
      await tolerate(
        session.client.callTool({
          name: 'uio_derive',
          arguments: { value: valid, scheme: 'rsin' },
        }),
      );
      await tolerate(
        session.client.callTool({
          name: 'uio_check',
          arguments: { values: [valid, other, syntheticInvalid(0)] },
        }),
      );
      // A rejected argument, an unknown ctx key and an unknown tool name.
      await tolerate(session.client.callTool({ name: 'uio_derive', arguments: { value: 7 } }));
      await tolerate(
        session.client.callTool({
          name: 'uio_check',
          arguments: { values: [valid], ctx: { [`key-${other}`]: 'x' } },
        }),
      );
      await tolerate(session.client.callTool({ name: `uio_unknown_${other}`, arguments: {} }));
      await session.close();
      // Let the piped stderr drain after the child has gone.
      await new Promise((resolve) => setTimeout(resolve, 200));
      run = { derive, check, stderr: session.stderr() };
    } finally {
      await session.close().catch(() => undefined);
    }
  }, 60_000);

  test('the EORI derive over MCP equals the engine result, with the RSIN at likely', () => {
    expect(run.derive.isError).toBeFalsy();
    const direct = engine.derive(EORI, 'eori');
    expect(run.derive.structuredContent).toEqual(direct);
    const rsin = direct.data.find((each) => each.scheme === 'rsin');
    expect(rsin?.value).toBe(RSIN);
    expect(rsin?.certainty).toBe('likely');
  });

  test('the SPEC section 10 check over MCP equals the engine result: three consistent pairs', () => {
    expect(run.check.isError).toBeFalsy();
    const direct = engine.check([EORI, VAT, RSIN]);
    expect(run.check.structuredContent).toEqual(direct);
    expect(direct.data).toHaveLength(3);
    for (const finding of direct.data) expect(finding.outcome).toBe('consistent');
  });

  test.for(ENTERED.map((value, index) => [index, value] as const))(
    'stderr does not contain entered value %#',
    ([, value]) => {
      expect(run.stderr).not.toContain(value);
    },
  );
});

describe('a raw spawned session', () => {
  type Raw = { lines: string[]; stderr: string; code: number | null; cwdAfter: string[] };
  let raw: Raw;

  beforeAll(async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'uio-mcp-privacy-'));
    scratch.push(cwd);
    const child = spawn(process.execPath, [CLI_PATH], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);

    let buffer = '';
    const lines: string[] = [];
    const answered = new Set<number>();
    let stderr = '';
    const waiting: (() => void)[] = [];
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.trim() !== '') {
          lines.push(line);
          try {
            const message = JSON.parse(line) as { id?: unknown };
            if (typeof message.id === 'number') answered.add(message.id);
          } catch {
            // reported by the test that parses every line
          }
        }
        newline = buffer.indexOf('\n');
      }
      for (const wake of waiting.splice(0)) wake();
    });
    const until = (ids: readonly number[]): Promise<void> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`no response to ${ids.join(', ')}`)),
          15_000,
        );
        const check = (): void => {
          if (ids.every((id) => answered.has(id))) {
            clearTimeout(timer);
            resolve();
          } else {
            waiting.push(check);
          }
        };
        check();
      });
    const send = (message: object): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const exited = new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'uio-mcp-raw', version: '0.0.0' },
      },
    });
    await until([1]);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'uio_derive', arguments: { value: EORI, scheme: 'eori' } },
    });
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'uio_recognise', arguments: { value: syntheticValid(0) } },
    });
    child.stdin.write(`this is not json ${syntheticValid(1)}\n`);
    send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'uio_derive', arguments: { value: 7, scheme: syntheticInvalid(0) } },
    });
    await until([2, 3, 4]);
    child.stdin.end();
    const code = await Promise.race([
      exited,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10_000)),
    ]);
    if (code === 'timeout') throw new Error('the server did not exit after stdin ended');
    raw = { lines, stderr, code, cwdAfter: readdirSync(cwd) };
  }, 60_000);

  test('the process exits with code 0 after stdin closes', () => {
    expect(raw.code).toBe(0);
  });

  test('every non-empty stdout line is a JSON-RPC 2.0 message', () => {
    expect(raw.lines.length).toBeGreaterThanOrEqual(4);
    for (const line of raw.lines) {
      const message = JSON.parse(line) as { jsonrpc?: unknown };
      expect(typeof message).toBe('object');
      expect(message.jsonrpc).toBe('2.0');
    }
  });

  test.for(ENTERED.map((value, index) => [index, value] as const))(
    'raw stderr does not contain entered value %#',
    ([, value]) => {
      expect(raw.stderr).not.toContain(value);
    },
  );

  test('the working directory the server ran in is still empty', () => {
    expect(raw.cwdAfter).toEqual([]);
  });
});
