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

/** Remove exact duplicates (same file, line, column, severity and message), keeping the first. */
export function uniqueProblems(problems: readonly Problem[]): Problem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = JSON.stringify([
      problem.file,
      problem.line,
      problem.column,
      problem.severity,
      problem.message,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Pure core: parse and schema-check the given files; problems sorted by file, line, column and
 * message. A file whose data cannot be trusted (parser error, non-mapping root) is not schema-checked.
 */
export function checkModelFiles(files: readonly ModelFile[]): Problem[] {
  const ajv = createAjv();
  const problems: Problem[] = [];
  for (const file of files) {
    const { parsed, problems: parseProblems, usable, coerced } = parseModelFile(file);
    problems.push(...parseProblems);
    if (!usable) continue;
    const schemaId = schemaFileFor(file.path);
    if (schemaId === undefined) {
      problems.push({ file: file.path, message: noSchemaMessage(file.path) });
      continue;
    }
    // A bare number that lost digits is already reported where it stands; its schema type error
    // at the same position would be the same finding twice.
    const covered = new Set(coerced.map((position) => `${position.line}:${position.column}`));
    problems.push(
      ...schemaProblems(ajv, schemaId, parsed).filter(
        (problem) => !covered.has(`${problem.line}:${problem.column}`),
      ),
    );
  }
  return sorted(uniqueProblems(problems));
}

/** Read every model file under `root` and check it, including stray entries under `model/`. */
export function checkModel(root: string): Problem[] {
  const { files, problems } = discoverModelFiles(root);
  return sorted(uniqueProblems([...problems, ...checkModelFiles(files)]));
}
