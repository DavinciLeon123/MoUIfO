// Manifest and provenance checks for the files committed under sources/ (D-12, D-13, D-22).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_FILE, sha256Hex } from './export-landscape.ts';

export type ManifestEntry = { hash: string; name: string };
export type Problem = { file: string; message: string };

const MANIFEST_LINE = /^([0-9a-f]{64}) {2}(\S.*)$/;

/** Strict coreutils `sha256sum` manifest: `<64 lowercase hex>  <name>` per line, optional single trailing LF. */
export function parseManifest(text: string): ManifestEntry[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((line, i) => {
    const m = MANIFEST_LINE.exec(line);
    if (!m)
      throw new Error(`manifest line ${i + 1} is not '<sha256>  <name>': ${JSON.stringify(line)}`);
    return { hash: m[1] as string, name: m[2] as string };
  });
}

/** Check every listed file against the manifest; any `landscape-v1.2*` file that is not listed is a problem too. */
export function verifyManifest(dir: string, manifestName: string = MANIFEST_FILE): Problem[] {
  const manifestPath = join(dir, manifestName);
  if (!existsSync(manifestPath)) return [{ file: manifestName, message: 'manifest is missing' }];
  let entries: ManifestEntry[];
  try {
    entries = parseManifest(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [
      { file: manifestName, message: error instanceof Error ? error.message : String(error) },
    ];
  }
  const problems: Problem[] = [];
  const listed = new Set<string>();
  for (const { hash, name } of entries) {
    listed.add(name);
    const path = join(dir, name);
    if (!existsSync(path)) {
      problems.push({ file: name, message: 'listed in the manifest but missing' });
    } else if (sha256Hex(readFileSync(path)) !== hash) {
      problems.push({ file: name, message: 'SHA-256 does not match the manifest' });
    }
  }
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('landscape-v1.2') && name !== manifestName && !listed.has(name)) {
      problems.push({ file: name, message: 'present but not listed in the manifest' });
    }
  }
  return problems;
}

/** Markers of a personal storage location; none may appear in committed export output (T-01-22). */
export const PERSONAL_PATH_PATTERN = /sharepoint|onedrive|file:\/\/|[A-Z]:\\|\/Users\//i;

export type ProvenanceRow = Record<string, string>;

const PROVENANCE_HEADER =
  '| File | Original name | Version | Date | SHA-256 (original) | SHA-256 (repository copy) | Licence | Status |';

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Rows of the provenance table (header must equal PROVENANCE_HEADER), keyed by column title. */
export function parseProvenanceTable(markdown: string): ProvenanceRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === PROVENANCE_HEADER);
  if (start < 0) throw new Error('provenance table header not found');
  const header = cells(PROVENANCE_HEADER);
  const rows: ProvenanceRow[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const values = cells(line);
    if (values.length !== header.length)
      throw new Error(`provenance row has ${values.length} cells: ${line}`);
    rows.push(Object.fromEntries(header.map((h, i) => [h, values[i] as string])));
  }
  return rows;
}
