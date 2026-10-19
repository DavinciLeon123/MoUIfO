import type { Problem } from 'uio-config';
import { checkModel } from './check-model.ts';
import { discoverModelFiles, parseModelFile } from './load.ts';

/**
 * The model as plain data: one table per directory under `model/`, each mapping a file id (the
 * file name without `.yaml`) to the plain YAML data of that file.
 */
export type RawModel = {
  schemes: Record<string, unknown>;
  authorities: Record<string, unknown>;
  jurisdictions: Record<string, unknown>;
  sources: Record<string, unknown>;
  vocab: Record<string, unknown>;
};

export type LoadResult =
  | { ok: true; model: RawModel; warnings: Problem[] }
  | { ok: false; problems: Problem[] };

const FILE_PATH = /^model\/([^/]+)\/([^/]+)\.yaml$/;

const isTable = (kind: string): kind is keyof RawModel =>
  kind === 'schemes' ||
  kind === 'authorities' ||
  kind === 'jurisdictions' ||
  kind === 'sources' ||
  kind === 'vocab';

/**
 * Check the model under `root` with every validator rule (`checkModel`) and, when nothing but
 * warnings remain, return its files' plain data. A model with an error is never returned: the
 * problems come back instead, in the validator's order. Parsing and every rule stay in the
 * validator; this function only gathers the already-checked data.
 */
export function loadValidatedModel(root: string): LoadResult {
  const problems = checkModel(root);
  if (problems.some((problem) => problem.severity !== 'warning')) return { ok: false, problems };

  const model: RawModel = {
    schemes: {},
    authorities: {},
    jurisdictions: {},
    sources: {},
    vocab: {},
  };
  for (const file of discoverModelFiles(root).files) {
    const match = FILE_PATH.exec(file.path);
    const kind = match?.[1];
    const id = match?.[2];
    if (kind === undefined || id === undefined || !isTable(kind)) continue;
    model[kind][id] = parseModelFile(file).parsed.data;
  }
  return { ok: true, model, warnings: problems };
}
