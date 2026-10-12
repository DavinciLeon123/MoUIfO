import type { Problem } from 'uio-config';
import { checkPartOf, uncitedSourceWarnings } from './cross-file.ts';
import { checkExamples, checkFormats } from './examples.ts';
import {
  discoverModelFiles,
  type ModelFile,
  noSchemaMessage,
  type ParsedFile,
  parseModelFile,
  schemaFileFor,
} from './load.ts';
import { buildRegistry, checkRequiredVocabs, checkVocabMembers } from './refs.ts';
import { createAjv, schemaProblems } from './schema.ts';
import { checkSchemes } from './schemes.ts';

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
 * Passes A to E over the given files. A: parse and structure with a registry-free Ajv. B: build
 * the registry from files with no parse or schema problem, so a broken file never vouches for a
 * reference. C: re-validate those same files with the registry-backed Ajv and keep only `uioRef`
 * errors, so a file with structural errors is never reference-checked (no cascade). Then the
 * jurisdiction graph check and the uncited-source warnings run on the clean files. Also returns
 * the set of source ids cited anywhere.
 */
export function runModelChecks(files: readonly ModelFile[]): {
  problems: Problem[];
  cited: Set<string>;
} {
  const structural = createAjv();
  const problems: Problem[] = [];
  const clean: { parsed: ParsedFile; schemaId: string }[] = [];
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
    const found = schemaProblems(structural, schemaId, parsed).filter(
      (problem) => !covered.has(`${problem.line}:${problem.column}`),
    );
    problems.push(...found);
    if (parseProblems.length === 0 && found.length === 0) clean.push({ parsed, schemaId });
  }

  const cited = new Set<string>();
  const referencing = createAjv({ registry: buildRegistry(clean), cited });
  for (const { parsed, schemaId } of clean) {
    problems.push(...schemaProblems(referencing, schemaId, parsed, 'uioRef'));
    if (parsed.path.startsWith('model/vocab/')) problems.push(...checkVocabMembers(parsed));
  }
  const inDirectory = (directory: string): ParsedFile[] =>
    clean.map(({ parsed }) => parsed).filter(({ path }) => path.startsWith(`model/${directory}/`));
  // Passes D and E run on structurally valid scheme files only: formats compile through the engine,
  // then the examples run through the compiled format.
  const schemes = inDirectory('schemes');
  const formats = checkFormats(schemes);
  problems.push(
    ...checkPartOf(inDirectory('jurisdictions')),
    ...checkSchemes(schemes),
    ...formats.problems,
    ...checkExamples(schemes, formats.compiled),
    ...uncitedSourceWarnings(inDirectory('sources'), cited),
  );
  return { problems, cited };
}

/**
 * Pure core: parse, schema-check and reference-check the given files; problems sorted by file,
 * line, column and message. A file whose data cannot be trusted (parser error, non-mapping root)
 * is not schema-checked.
 */
export function checkModelFiles(files: readonly ModelFile[]): Problem[] {
  return sorted(uniqueProblems(runModelChecks(files).problems));
}

/** Read every model file under `root` and check it, including stray entries under `model/`. */
export function checkModel(root: string): Problem[] {
  const { files, problems } = discoverModelFiles(root);
  return sorted(
    uniqueProblems([
      ...problems,
      ...checkModelFiles(files),
      ...checkRequiredVocabs(files.map((file) => file.path)),
    ]),
  );
}
