import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem, UioConfig } from 'uio-config';
import { checkModelJson, loadValidatedModel } from 'uio-validate';
import { normalise } from './model/normalise.ts';

/** One generated file: where it goes, its name and its text. */
export type Output = { target: 'dist'; name: string; text: string };

export type Rendered = { problems: Problem[]; outputs: Output[]; notes: string[] };

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/** The `version` of the root package.json, or a problem on that file. */
function readVersion(root: string): { version: string } | { problem: Problem } {
  const file = 'package.json';
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, file), 'utf8'));
    const version = (parsed as { version?: unknown } | null)?.version;
    if (typeof version === 'string' && VERSION.test(version)) return { version };
    return { problem: { file, message: 'version must be a semantic version of the form x.y.z' } };
  } catch {
    return { problem: { file, message: 'cannot be read as JSON with a version field' } };
  }
}

/**
 * Render every artefact in memory; nothing is written here. A problem at any step ends the render
 * with the problems found, so the caller writes only after every check passed.
 */
export async function renderArtefacts(root: string, _cfg: UioConfig): Promise<Rendered> {
  const loaded = loadValidatedModel(root);
  if (!loaded.ok) return { problems: loaded.problems, outputs: [], notes: [] };

  const read = readVersion(root);
  if ('problem' in read) return { problems: [read.problem], outputs: [], notes: [] };

  const model = normalise(loaded.model, read.version);
  const modelProblems = checkModelJson(model);
  if (modelProblems.length > 0) return { problems: modelProblems, outputs: [], notes: [] };

  const size = (table: Record<string, unknown>): number => Object.keys(table).length;
  const notes = [
    `build: model loaded (${size(model.schemes)} schemes, ${size(model.authorities)} authorities, ${size(model.jurisdictions)} jurisdictions, ${size(model.sources)} sources, ${size(model.vocab)} vocabularies)`,
  ];
  const outputs: Output[] = [
    { target: 'dist', name: 'model.json', text: `${JSON.stringify(model, null, 2)}\n` },
  ];
  return { problems: [], outputs, notes };
}
