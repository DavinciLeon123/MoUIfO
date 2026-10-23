#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { Engine, Model } from '@uio/engine';
import { loadModelFile } from './model-file.ts';
import { createServer } from './server.ts';

/**
 * The bin entry (D-05): it only wires stdio. The model is read next to this file, never from the
 * working directory, an argument or an environment variable (D-04). On any load failure it writes
 * one static line to stderr and exits 1; it prints no error object, path or argument (T-06-07).
 */
let loaded: { model: Model; engine: Engine };
try {
  loaded = loadModelFile(new URL('./model.json', import.meta.url));
} catch {
  console.error(
    'uio-mcp-server: its model.json is missing or unusable; reinstall or rebuild the package',
  );
  process.exit(1);
}

const { model, engine } = loaded;
serveStdio(() => createServer(model, engine));
