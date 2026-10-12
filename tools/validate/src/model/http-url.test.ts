import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { checkModelFiles } from './check-model.ts';
import type { ModelFile } from './load.ts';
import { SCHEMA_DIR } from './schema.ts';
import {
  cleanupCopies,
  copyOfRepo,
  fixture,
  fixtureAuthorities,
  fixtureSource,
  minimalSchemeBody,
  positionOfToken,
  runValidateCli,
  schemeFixture,
  withRealModel,
} from './testing.ts';

vi.setConfig({ testTimeout: 60_000 });

// WR-03, T-02-36: every field that holds a web address takes an absolute http or https URI and
// nothing else, through one shared definition. The values below are public, synthetic web
// addresses; no personal-number-like literal appears here.

const HTTP_URL_MESSAGE = 'must match pattern "^https?://"';
const URI_MESSAGE = 'must match format "uri"';

const SCHEME_ID = 'fixture-http';
const SCHEME_PATH = `model/schemes/${SCHEME_ID}.yaml`;
const SOURCE_PATH = 'model/sources/fixture-src.yaml';

/** One schema field that holds a web address, with the file that carries it. */
interface Field {
  readonly name: string;
  readonly path: string;
  readonly files: (quotedValue: string) => ModelFile[];
}

const schemeField = (name: string, extra: (quoted: string) => string): Field => ({
  name,
  path: SCHEME_PATH,
  files: (quoted) => [
    fixtureSource(),
    ...fixtureAuthorities(),
    schemeFixture(SCHEME_ID, minimalSchemeBody(SCHEME_ID, {}, extra(quoted))),
  ],
});

/** A fixture jurisdiction that cites the fixture source so no uncited warning appears. */
const citing = (): ModelFile =>
  fixture(
    'model/jurisdictions/ZZ.yaml',
    'id: ZZ\nlabel:\n  en: Fixture\npart_of:\n  - jurisdiction: EU\n    source: fixture-src\n    certainty: certain\n',
  );

const sourceField = (name: string, type: string, key: string): Field => ({
  name,
  path: SOURCE_PATH,
  files: (quoted) => [
    fixture(
      SOURCE_PATH,
      `id: fixture-src\ntitle: Fixture source\ndate: 2026-01-01\ntype: ${type}\n${key}: ${quoted}\n`,
    ),
    citing(),
  ],
});

const FIELDS: readonly Field[] = [
  schemeField(
    'legal_basis[].eli',
    (quoted) =>
      `legal_basis:\n  - { title: Fixture law, eli: ${quoted}, certainty: likely, source: fixture-source }\n`,
  ),
  schemeField(
    'legal_basis[].url',
    (quoted) =>
      `legal_basis:\n  - { title: Fixture law, url: ${quoted}, certainty: likely, source: fixture-source }\n`,
  ),
  schemeField(
    'validation_source.url',
    (quoted) =>
      `validation_source:\n  label: Fixture check\n  url: ${quoted}\n  certainty: likely\n  source: fixture-source\n`,
  ),
  sourceField('source url', 'register-doc', 'url'),
  sourceField('source eli', 'law', 'eli'),
];

const NON_WEB_VALUES = [
  'javascript:alert(1)',
  'data:text/html,x',
  'ftp://example.org/file',
  'file:///etc/hosts',
  'mailto:info@example.org',
  'HTTPS://example.org/x',
] as const;

const WEB_VALUES = ['https://example.org/x', 'http://data.europa.eu/eli/reg/2013/952/oj'] as const;

/** The problems of the file under test, with the fixture text and the quoted value position. */
function problemsOf(field: Field, value: string) {
  const quoted = JSON.stringify(value);
  const files = field.files(quoted);
  const text = files.find((file) => file.path === field.path)?.text ?? '';
  const problems = checkModelFiles(withRealModel(files)).filter(
    (problem) => problem.file === field.path,
  );
  return { problems, at: positionOfToken(text, quoted) };
}

describe('a script URI in a URL field fails at the CLI with one positioned line', () => {
  const value = 'javascript:alert(1)';
  const quoted = JSON.stringify(value);
  const scheme = schemeFixture(
    SCHEME_ID,
    minimalSchemeBody(
      SCHEME_ID,
      {},
      `validation_source:\n  label: Fixture check\n  url: ${quoted}\n  certainty: likely\n  source: fixture-source\n`,
    ),
  );
  let run: { status: number | null; stdout: string };

  beforeAll(() => {
    const root = copyOfRepo();
    for (const file of [fixtureSource(), ...fixtureAuthorities(), scheme]) {
      mkdirSync(dirname(join(root, file.path)), { recursive: true });
      writeFileSync(join(root, file.path), file.text);
    }
    run = runValidateCli(root, { GITHUB_ACTIONS: undefined });
  });

  afterAll(cleanupCopies);

  test('the run exits 1', () => {
    expect(run.status).toBe(1);
  });

  test('exactly one line is printed, at the opening quote of the value, ending in the pattern message', () => {
    const at = positionOfToken(scheme.text, quoted);
    const lines = run.stdout.split('\n').filter((line) => line.includes(SCHEME_PATH));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.startsWith(`${SCHEME_PATH}:${at.line}:${at.column} `)).toBe(true);
    expect(lines[0]?.endsWith(HTTP_URL_MESSAGE)).toBe(true);
  });

  test('the printed output does not contain the value', () => {
    expect(run.stdout.includes(value)).toBe(false);
  });
});

describe('a non-web URI is one positioned problem in each of the five web-address fields', () => {
  test.for(
    FIELDS.flatMap((field) => NON_WEB_VALUES.map((value) => [field.name, value, field] as const)),
  )('%s rejects %s', ([, value, field]) => {
    const { problems, at } = problemsOf(field, value);
    expect(problems).toEqual([{ file: field.path, ...at, message: HTTP_URL_MESSAGE }]);
    expect(problems.some((problem) => problem.message.includes(value))).toBe(false);
  });
});

describe('an http or https URI is accepted in each of the five web-address fields', () => {
  test.for(
    FIELDS.flatMap((field) => WEB_VALUES.map((value) => [field.name, value, field] as const)),
  )('%s accepts %s', ([, value, field]) => {
    expect(problemsOf(field, value).problems).toEqual([]);
  });
});

describe('plain words are rejected by the format and the pattern at one position', () => {
  test.for(FIELDS.map((field) => [field.name, field] as const))('%s', ([, field]) => {
    const { problems, at } = problemsOf(field, 'not a url');
    expect(problems.map((problem) => problem.message).sort()).toEqual(
      [HTTP_URL_MESSAGE, URI_MESSAGE].sort(),
    );
    for (const problem of problems) {
      expect({ line: problem.line, column: problem.column }).toEqual(at);
      expect(problem.message.includes('not a url')).toBe(false);
    }
  });
});

describe('the schema sweep: one definition of a web address, referenced everywhere', () => {
  const dir = fileURLToPath(SCHEMA_DIR);
  const schemas = readdirSync(dir)
    .filter((name) => name.endsWith('.schema.json'))
    .map((name) => ({ name, json: JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown }));
  const URI_FORMATS = new Set(['uri', 'iri', 'uri-reference', 'iri-reference', 'url']);
  const REFERENCE = 'common.schema.json#/$defs/http-url';

  /** Every `file#pointer` whose `format` keyword names a URI-like format. */
  function uriFormatPlaces(): string[] {
    const found: string[] = [];
    const walk = (node: unknown, name: string, pointer: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          walk(item, name, `${pointer}/${index}`);
        });
      } else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'format' && typeof value === 'string' && URI_FORMATS.has(value)) {
            found.push(`${name}#${pointer}/format`);
          } else {
            walk(value, name, `${pointer}/${key}`);
          }
        }
      }
    };
    for (const schema of schemas) walk(schema.json, schema.name, '');
    return found.sort();
  }

  function countReferences(): number {
    let count = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
      } else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === '$ref' && value === REFERENCE) count += 1;
          else walk(value);
        }
      }
    };
    for (const schema of schemas.filter((entry) => entry.name !== 'common.schema.json')) {
      walk(schema.json);
    }
    return count;
  }

  test('the sweep reads the schema files, so it cannot be empty', () => {
    expect(schemas.map((schema) => schema.name)).toEqual(
      expect.arrayContaining(['common.schema.json', 'scheme.schema.json', 'source.schema.json']),
    );
  });

  test('a URI-like format keyword appears only in the http-url definition of common.schema.json', () => {
    expect(uriFormatPlaces()).toEqual(['common.schema.json#/$defs/http-url/format']);
  });

  test('at least five references point at the http-url definition', () => {
    expect(countReferences()).toBeGreaterThanOrEqual(5);
  });

  test('the definition is a string, a uri and an http(s) pattern', () => {
    const common = schemas.find((schema) => schema.name === 'common.schema.json')?.json as {
      $defs: Record<string, unknown>;
    };
    expect(common.$defs['http-url']).toMatchObject({
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
    });
  });
});
