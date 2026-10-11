import { REPO_ROOT } from 'uio-config';
import { discoverModelFiles, expectedHeader, type ModelFile } from './load.ts';

/**
 * Test helper: a model file with the exact header its path requires, followed by `body`.
 * A path without a known schema gets no header.
 */
export function fixture(path: string, body: string): ModelFile {
  const header = expectedHeader(path);
  return { path, text: header === undefined ? body : `${header}\n${body}` };
}

/** Test helper: every real model file under `root` with its text. */
export function realModelFiles(root: string = REPO_ROOT): ModelFile[] {
  return discoverModelFiles(root).files;
}

/** Test helper: the real model files with `extra` added, or replacing the file of the same path. */
export function withRealModel(extra: ModelFile | readonly ModelFile[]): ModelFile[] {
  const added = Array.isArray(extra) ? extra : [extra as ModelFile];
  const paths = new Set(added.map((file) => file.path));
  return [...realModelFiles().filter((file) => !paths.has(file.path)), ...added];
}
