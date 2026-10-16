import { stringify } from 'csv-stringify/sync';
import jsonld, { type ContextDefinition } from 'jsonld';
import { DataFactory, Parser, type Quad, Store, Writer } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { expect, test } from 'vitest';

// Smoke tests of the RDF toolchain the build relies on. Only example.org IRIs appear here.
const { namedNode, literal, quad } = DataFactory;
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

function writeTurtle(quads: Quad[]): string {
  const writer = new Writer();
  writer.addQuads(quads);
  let out = '';
  writer.end((error, result) => {
    if (error) throw error;
    out = result;
  });
  return out;
}

test('n3 writes an xsd:integer literal and re-parses it with its datatype and no language tag', () => {
  const written = writeTurtle([
    quad(
      namedNode('https://example.org/s'),
      namedNode('https://example.org/p'),
      literal('1', namedNode(XSD_INTEGER)),
    ),
  ]);
  const parsed = new Parser().parse(written);
  expect(parsed).toHaveLength(1);
  const object = parsed[0]?.object;
  expect(object?.termType).toBe('Literal');
  if (object?.termType !== 'Literal') throw new Error('object is not a literal');
  expect(object.value).toBe('1');
  expect(object.datatype.value).toBe(XSD_INTEGER);
  expect(object.language).toBe('');
});

test('jsonld refuses a remote context through a throwing document loader', async () => {
  const deny = async (url: string): Promise<never> => {
    throw new Error(`remote document refused: ${url}`);
  };
  // @types/jsonld does not declare the assignable global loader; jsonld itself reads it.
  (jsonld as unknown as { documentLoader: unknown }).documentLoader = deny;
  // jsonld wraps the loader's error in an InvalidUrl whose details.cause is the original error.
  const refused = await jsonld
    .compact(
      { '@id': 'https://example.org/a', 'https://example.org/p': 'x' },
      'https://example.org/context.jsonld' as unknown as ContextDefinition,
      { documentLoader: deny },
    )
    .then(
      () => undefined,
      (error: unknown) => error as { details?: { code?: string; cause?: Error } },
    );
  expect(refused, 'compact against a remote context must reject').toBeDefined();
  expect(refused?.details?.code).toBe('loading remote context failed');
  expect(refused?.details?.cause?.message).toMatch(/remote document refused/);

  const expanded = await jsonld.fromRDF('<https://example.org/s> <https://example.org/p> "v" .\n', {
    format: 'application/n-quads',
    useNativeTypes: false,
  });
  expect(expanded).toHaveLength(1);
});

test('rdf-validate-shacl reports a violation for a Thing without a name', async () => {
  const shapes = new Store(
    new Parser().parse(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix ex: <https://example.org/> .
      ex:ThingShape a sh:NodeShape ;
        sh:targetClass ex:Thing ;
        sh:property [ sh:path ex:name ; sh:minCount 1 ] .
    `),
  );
  const data = new Store(
    new Parser().parse(`
      @prefix ex: <https://example.org/> .
      ex:a a ex:Thing .
    `),
  );
  const report = await new SHACLValidator(shapes).validate(data);
  expect(report.conforms).toBe(false);
});

test('csv-stringify escapes a formula cell', () => {
  const csv = stringify([['=1']], { escape_formulas: true });
  expect(csv.startsWith('=')).toBe(false);
});
