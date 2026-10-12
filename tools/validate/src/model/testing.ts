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

/** Test helper: a register-doc source with a placeholder url, for fixtures to cite. */
export function fixtureSource(id = 'fixture-source'): ModelFile {
  return fixture(
    `model/sources/${id}.yaml`,
    `id: ${id}\ntitle: Fixture register documentation\ntype: register-doc\ndate: 2026-01-01\nurl: https://example.org/${id}\n`,
  );
}

/** Test helper: an authority class `fixture-authority` and its NL instance `fixture-authority-nl`. */
export function fixtureAuthorities(): ModelFile[] {
  return [
    fixture(
      'model/authorities/fixture-authority.yaml',
      'id: fixture-authority\nkind: class\nlabel:\n  en: Fixture authority\ndefinition:\n  en: An authority that exists only in tests.\n',
    ),
    fixture(
      'model/authorities/fixture-authority-nl.yaml',
      'id: fixture-authority-nl\nkind: instance\nlabel:\n  en: Fixture authority NL\ninstance_of: fixture-authority\njurisdiction: NL\nsource: fixture-source\ncertainty: certain\n',
    ),
  ];
}

/** Test helper: a scheme file `model/schemes/<id>.yaml` with the exact header and `body`. */
export function schemeFixture(id: string, body: string): ModelFile {
  return fixture(`model/schemes/${id}.yaml`, body);
}

/**
 * Test helper: the header fields of a minimal valid scheme, one per line, with `overrides`
 * replacing the line of the same key (a value of `undefined` drops the line; a multi-line value
 * is allowed). `extra` is appended unchanged.
 */
export function minimalSchemeBody(
  id: string,
  overrides: Readonly<Record<string, string | undefined>> = {},
  extra = '',
): string {
  const fields: Record<string, string | undefined> = {
    id,
    label: '\n  en: Fixture scheme',
    kind: 'identifier',
    issuer: 'fixture-authority',
    jurisdiction: 'NL',
    sources: '\n  default: fixture-source',
    abbreviation: 'FIX',
    availability: 'public',
    iso6523_icd: '"0106"',
    peppol_eas: 'null',
    ...overrides,
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
  return `${lines}${extra}`;
}
