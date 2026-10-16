import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_CONTRACT } from '@uio/engine';
import { Parser, type Quad } from 'n3';
import { loadConfig, REPO_ROOT } from 'uio-config';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderArtefacts } from './build.ts';
import { LANDSCAPE_COLUMNS } from './tables/landscape.ts';
import { cleanupBuildRoots, makeBuildRoot, parseCsv } from './testing.ts';

const CLI = fileURLToPath(new URL('./index.ts', import.meta.url));

// Each test here renders or spawns the whole build (six outputs plus the BLD-06 proof); under a
// loaded full-suite run the 5 s default is too tight.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => cleanupBuildRoots());

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function stems(directory: string): string[] {
  return readdirSync(join(REPO_ROOT, 'model', directory))
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .sort(compare);
}

function runCli(root: string, extra: string[] = []) {
  return spawnSync(process.execPath, ['--conditions=uio-source', CLI, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: undefined },
  });
}

describe('renderArtefacts', () => {
  test('renders the real model into one model.json output without a problem', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(result.problems).toEqual([]);
    const outputs = result.outputs.filter((output) => output.name === 'model.json');
    expect(outputs).toHaveLength(1);
    const text = outputs[0]?.text ?? '';
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    const model = JSON.parse(text);
    const rootVersion = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;
    expect(model.contract).toBe(MODEL_CONTRACT);
    expect(model.model_version).toBe(rootVersion);
    expect(Object.keys(model.schemes)).toEqual(stems('schemes'));
    expect(Object.keys(model)).toEqual([
      'authorities',
      'contract',
      'jurisdictions',
      'model_version',
      'schemes',
      'sources',
      'vocab',
    ]);
    expect(result.notes.join('\n')).toContain('build: model loaded (');
  });
});

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DCT_SOURCE = 'http://purl.org/dc/terms/source';
const PROV_DERIVED = 'http://www.w3.org/ns/prov#wasDerivedFrom';
const SCHEMA_AGENCY = 'http://www.w3.org/ns/adms#schemaAgency';

describe('renderArtefacts uio.ttl (issuer Statements)', () => {
  test('writes one issuer Statement per scheme, each tied to its scheme, authority and source', async () => {
    const cfg = loadConfig();
    const namespace = cfg.namespace;
    const def = (term: string): string => `${namespace}def#${term}`;
    const result = await renderArtefacts(REPO_ROOT, cfg);
    expect(result.problems).toEqual([]);
    const outputs = result.outputs.filter((output) => output.name === 'uio.ttl');
    expect(outputs).toHaveLength(1);
    const text = outputs[0]?.text ?? '';
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('_:');
    expect(text).not.toContain('<<');

    const quads: Quad[] = new Parser().parse(text);
    const objectsOf = (subject: string, predicate: string): string[] =>
      quads
        .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
        .map((q) => q.object.value);

    const model = JSON.parse(
      (result.outputs.find((output) => output.name === 'model.json') ?? { text: '{}' }).text,
    );
    const schemes = Object.values(model.schemes) as {
      id: string;
      issuer: { value: string; source: string };
    }[];
    const issuers = quads
      .filter((q) => q.predicate.value === def('predicate') && q.object.value === SCHEMA_AGENCY)
      .map((q) => q.subject.value);
    expect(issuers).toHaveLength(schemes.length);
    for (const scheme of schemes) {
      const found = issuers.filter((iri) =>
        new RegExp(`/statement/${scheme.id}/issuer-[0-9a-f]{8}$`).test(iri),
      );
      expect(found).toHaveLength(1);
      const iri = found[0] ?? '';
      expect(objectsOf(iri, RDF_TYPE)).toEqual([def('Statement')]);
      expect(objectsOf(iri, def('subject'))).toEqual([`${namespace}scheme/${scheme.id}`]);
      expect(objectsOf(iri, def('object'))).toEqual([
        `${namespace}authority/${scheme.issuer.value}`,
      ]);
      expect(objectsOf(iri, DCT_SOURCE)).toEqual([`${namespace}source/${scheme.issuer.source}`]);
      expect(objectsOf(iri, PROV_DERIVED)).toEqual(objectsOf(iri, DCT_SOURCE));
      // D-05: no plain triple repeats the claim.
      expect(
        quads.filter(
          (q) => q.predicate.value === SCHEMA_AGENCY && q.subject.value.includes('/scheme/'),
        ),
      ).toEqual([]);
    }
  });
});

describe('renderArtefacts landscape tables', () => {
  test('writes landscape-table.md and .csv with one row per scheme in id order', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(result.problems).toEqual([]);
    const output = (name: string): string =>
      result.outputs.find((candidate) => candidate.name === name)?.text ?? '';
    const csv = output('landscape-table.csv');
    const markdown = output('landscape-table.md');
    for (const text of [csv, markdown]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
    }
    const records = parseCsv(csv);
    expect(records[0]).toEqual([...LANDSCAPE_COLUMNS]);
    expect(csv.startsWith(`${LANDSCAPE_COLUMNS.join(',')}\n`)).toBe(true);
    expect(records.slice(1).map((record) => record[0])).toEqual(stems('schemes'));
    expect(markdown.startsWith('# Landscape table\n')).toBe(true);
  });
});

describe('build CLI model.json', () => {
  test('writes dist/model.json and prints its path', () => {
    const root = makeBuildRoot();
    const result = runCli(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist/model.json');
    const model = JSON.parse(readFileSync(join(root, 'dist', 'model.json'), 'utf8'));
    expect(model.contract).toBe(MODEL_CONTRACT);
    expect(existsSync(join(root, 'dist', 'build-info.json'))).toBe(true);
  });

  test('a root package.json version that is not x.y.z exits 1 and writes no model.json', () => {
    const root = makeBuildRoot();
    const path = join(root, 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, `${JSON.stringify({ ...pkg, version: 'x' })}\n`);
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('package.json');
    expect(existsSync(join(root, 'dist', 'model.json'))).toBe(false);
  });

  test('a model with a problem exits 1 and writes nothing at all', () => {
    const root = makeBuildRoot();
    const path = join(root, 'model', 'schemes', 'eori.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^id: eori$/m, 'id: not-eori'));
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
});

describe('renderArtefacts uio.jsonld', () => {
  test('writes one flat JSON-LD document with an inline context and no blank node', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(result.problems).toEqual([]);
    const outputs = result.outputs.filter((output) => output.name === 'uio.jsonld');
    expect(outputs).toHaveLength(1);
    const text = outputs[0]?.text ?? '';
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    const doc = JSON.parse(text);
    expect(typeof doc['@context']).toBe('object');
    expect(Array.isArray(doc['@graph'])).toBe(true);
    expect(doc['@graph'].length).toBeGreaterThan(100);
    expect(text).not.toContain('"_:');
  });
});

describe('renderArtefacts BLD-06 gate', () => {
  test('fails with a dist/uio.jsonld problem when the JSON-LD would differ', async () => {
    const broken = async (): Promise<string> =>
      `${JSON.stringify({ '@context': {}, '@graph': [] }, null, 2)}\n`;
    const result = await renderArtefacts(REPO_ROOT, loadConfig(), { serialiseJsonLd: broken });
    expect(result.outputs).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.file).toBe('dist/uio.jsonld');
    expect(result.problems[0]?.message).toMatch(/triples/);
    expect(result.problems[0]?.message).toMatch(/only in the Turtle/);
  });

  test('fails with a dist/uio.jsonld problem when the JSON-LD cannot be parsed', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig(), {
      serialiseJsonLd: async () => 'not json',
    });
    expect(result.problems[0]?.file).toBe('dist/uio.jsonld');
  });

  test('a full render succeeds while fetch is a throwing stub that is never called', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error('fetch must not be called');
    }) as typeof fetch;
    try {
      const result = await renderArtefacts(REPO_ROOT, loadConfig());
      expect(result.problems).toEqual([]);
      expect(result.outputs.map((output) => output.name)).toContain('uio.jsonld');
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});

describe('renderArtefacts uio-def.ttl (D-09)', () => {
  test('publishes ontology/uio-def.ttl byte for byte as a separate uio-def.ttl output', async () => {
    const result = await renderArtefacts(REPO_ROOT, loadConfig());
    expect(result.problems).toEqual([]);
    const outputs = result.outputs.filter((output) => output.name === 'uio-def.ttl');
    expect(outputs).toHaveLength(1);
    const published = Buffer.from(outputs[0]?.text ?? '', 'utf8');
    const authored = readFileSync(join(REPO_ROOT, 'ontology', 'uio-def.ttl'));
    expect(published.equals(authored)).toBe(true);
    expect(authored.at(-1)).toBe(0x0a);
    expect(authored.at(-2)).not.toBe(0x0a);
    // D-09: the ontology is a separate file, never merged into uio.ttl.
    const turtle = result.outputs.find((output) => output.name === 'uio.ttl')?.text ?? '';
    expect(turtle).not.toContain('owl:Ontology');
  });

  test('invalid Turtle in ontology/uio-def.ttl is a problem naming that file', async () => {
    const root = makeBuildRoot();
    writeFileSync(join(root, 'ontology', 'uio-def.ttl'), 'this is not turtle .\n');
    const result = await renderArtefacts(root, loadConfig(root));
    expect(result.outputs).toEqual([]);
    expect(result.problems.map((problem) => problem.file)).toContain('ontology/uio-def.ttl');
  });

  test('a missing ontology/uio-def.ttl is a problem naming that file', async () => {
    const root = makeBuildRoot();
    rmSync(join(root, 'ontology'), { recursive: true, force: true });
    const result = await renderArtefacts(root, loadConfig(root));
    expect(result.outputs).toEqual([]);
    expect(result.problems.map((problem) => problem.file)).toContain('ontology/uio-def.ttl');
  });

  test('an emitted def: term with no definition fails the render naming the term', async () => {
    const root = makeBuildRoot();
    const path = join(root, 'ontology', 'uio-def.ttl');
    const text = readFileSync(path, 'utf8');
    const start = text.indexOf('def:Rule a owl:Class');
    const end = text.indexOf('def:Condition a owl:Class');
    expect(start).toBeGreaterThan(0);
    writeFileSync(path, text.slice(0, start) + text.slice(end));
    const result = await renderArtefacts(root, loadConfig(root));
    expect(result.outputs).toEqual([]);
    expect(result.problems).toEqual([
      { file: 'ontology/uio-def.ttl', message: 'def:Rule is emitted but not defined' },
    ]);
  });

  test('a defined def: term the graph never emits fails the render naming the term', async () => {
    const root = makeBuildRoot();
    const path = join(root, 'ontology', 'uio-def.ttl');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\ndef:Unused a owl:Class .\n`);
    const result = await renderArtefacts(root, loadConfig(root));
    expect(result.outputs).toEqual([]);
    expect(result.problems).toEqual([
      { file: 'ontology/uio-def.ttl', message: 'def:Unused is defined but not emitted (D-08)' },
    ]);
  });

  test('the CLI writes dist/uio-def.ttl next to dist/uio.ttl', () => {
    const root = makeBuildRoot();
    const result = runCli(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist/uio-def.ttl');
    const copy = readFileSync(join(root, 'dist', 'uio-def.ttl'));
    expect(copy.equals(readFileSync(join(root, 'ontology', 'uio-def.ttl')))).toBe(true);
    expect(existsSync(join(root, 'dist', 'uio.ttl'))).toBe(true);
  });
});
