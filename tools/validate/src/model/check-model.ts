import type { Problem } from 'uio-config';
import {
  discoverModelFiles,
  type ModelFile,
  noSchemaMessage,
  parseModelFile,
  schemaFileFor,
} from './load.ts';
import { createAjv, schemaProblems } from './schema.ts';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sorted(problems: Problem[]): Problem[] {
  return problems.sort(
    (a, b) =>
      compare(a.file, b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      compare(a.message, b.message),
  );
}

/**
 * Pure core: parse and schema-check the given files; problems sorted by file, line, column and
 * message. A file whose data cannot be trusted (parser error, non-mapping root) is not schema-checked.
 */
export function checkModelFiles(files: readonly ModelFile[]): Problem[] {
  const ajv = createAjv();
  const problems: Problem[] = [];
  for (const file of files) {
    const { parsed, problems: parseProblems, usable } = parseModelFile(file);
    problems.push(...parseProblems);
    if (!usable) continue;
    const schemaId = schemaFileFor(file.path);
    if (schemaId === undefined) {
      problems.push({ file: file.path, message: noSchemaMessage(file.path) });
      continue;
    }
    problems.push(...schemaProblems(ajv, schemaId, parsed));
  }
  return sorted(problems);
}

/** Read every model file under `root` and check it, including stray entries under `model/`. */
export function checkModel(root: string): Problem[] {
  const { files, problems } = discoverModelFiles(root);
  return sorted([...problems, ...checkModelFiles(files)]);
}
