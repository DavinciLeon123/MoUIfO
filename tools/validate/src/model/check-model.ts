import type { Problem } from 'uio-config';
import { discoverModelFiles, type ModelFile, parseModelFile, schemaFileFor } from './load.ts';
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

/** Pure core: parse and schema-check the given files; problems sorted by file, line, column, message. */
export function checkModelFiles(files: readonly ModelFile[]): Problem[] {
  const ajv = createAjv();
  const problems: Problem[] = [];
  for (const file of files) {
    const { parsed, problems: parseProblems } = parseModelFile(file);
    problems.push(...parseProblems);
    if (parseProblems.length > 0) continue;
    const schemaId = schemaFileFor(file.path);
    if (schemaId === undefined) {
      problems.push({ file: file.path, message: 'no schema is known for this file' });
      continue;
    }
    problems.push(...schemaProblems(ajv, schemaId, parsed));
  }
  return sorted(problems);
}

/** Read every model file under `root` and check it. */
export function checkModel(root: string): Problem[] {
  return checkModelFiles(discoverModelFiles(root));
}
