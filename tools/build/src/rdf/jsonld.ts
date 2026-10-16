import jsonld, { type ContextDefinition } from 'jsonld';
import { type Quad, Writer } from 'n3';

/**
 * The only document loader the build ever gives jsonld: it refuses every remote document, so a
 * context URL can neither be fetched nor leak the build's location (privacy, determinism).
 */
export async function refuseRemoteDocument(url: string): Promise<never> {
  throw new Error(`remote document refused: ${url}`);
}

// @types/jsonld does not declare the assignable global loader; jsonld itself reads it.
(jsonld as unknown as { documentLoader: unknown }).documentLoader = refuseRemoteDocument;

const jsonText = (value: unknown): string => JSON.stringify(value);

/**
 * Sort every object's keys with `<` and `>` and every array by the JSON text of its items, so the
 * text no longer depends on the order jsonld received the quads in.
 */
export function normaliseJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => normaliseJson(item))
      .sort((a, b) => {
        const left = jsonText(a);
        const right = jsonText(b);
        return left < right ? -1 : left > right ? 1 : 0;
      });
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => [key, normaliseJson(record[key])]),
    );
  }
  return value;
}

function toNQuads(quads: readonly Quad[]): string {
  const writer = new Writer({ format: 'N-Quads' });
  writer.addQuads([...quads]);
  let out = '';
  let failure: Error | null = null;
  writer.end((error, result) => {
    failure = error;
    out = result;
  });
  if (failure) throw failure;
  return out;
}

/**
 * The flat compacted JSON-LD form of the quads: `{ "@context": {prefix: IRI, ...}, "@graph": [...] }`.
 * The context is the inline prefix map, never a URL; the text is normalised, 2-space indented and
 * ends with exactly one LF.
 */
export async function toJsonLd(
  quads: readonly Quad[],
  context: Record<string, string>,
): Promise<string> {
  const expanded = await jsonld.fromRDF(toNQuads(quads), {
    format: 'application/n-quads',
    useNativeTypes: false,
  });
  const compacted = await jsonld.compact(expanded, context as ContextDefinition, {
    documentLoader: refuseRemoteDocument,
    graph: true,
  });
  return `${JSON.stringify(normaliseJson(compacted), null, 2)}\n`;
}
