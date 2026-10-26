import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildSummary, SUMMARY_URI } from './summary.ts';
import { connectInProcess, type InProcess } from './testing/in-process.ts';

/** D-10, MCP-04: the model summary resource, in process over the real dist/model.json. */

let session: InProcess;

beforeAll(async () => {
  session = await connectInProcess();
});

afterAll(async () => {
  await session.close();
});

/** The ids in code-unit order, computed here with plain comparison operators. */
function sortedIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function reverseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeys) as T;
  if (typeof value !== 'object' || value === null) return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value).reverse()) {
    copy[key] = reverseKeys((value as Record<string, unknown>)[key]);
  }
  return copy as T;
}

test('the server lists exactly one resource, the summary, as application/json', async () => {
  const { resources } = await session.client.listResources();
  expect(resources).toHaveLength(1);
  expect(resources[0]?.uri).toBe(SUMMARY_URI);
  expect(resources[0]?.mimeType).toBe('application/json');
});

test('reading the summary returns one application/json content equal to buildSummary', async () => {
  const reply = await session.client.readResource({ uri: SUMMARY_URI });
  expect(reply.contents).toHaveLength(1);
  const content = reply.contents[0] as { uri: string; mimeType?: string; text: string };
  expect(content.uri).toBe(SUMMARY_URI);
  expect(content.mimeType).toBe('application/json');
  expect(content.text).toBe(JSON.stringify(buildSummary(session.model)));
});

test('one item per scheme, sorted by id in code-unit order', () => {
  const summary = buildSummary(session.model);
  const modelIds = Object.keys(session.model.schemes);
  expect(modelIds.length).toBeGreaterThan(0);
  expect(summary.schemes.map((s) => s.id)).toEqual(sortedIds(modelIds));
  expect(summary.model_version).toBe(session.model.model_version);
  expect(summary.contract).toBe(session.model.contract);
  expect(Object.keys(summary)).toEqual(['model_version', 'contract', 'schemes']);
});

test('each item has the D-10 keys in order, absent optional keys left out, values from the model', () => {
  for (const item of buildSummary(session.model).schemes) {
    const scheme = session.model.schemes[item.id];
    expect(scheme).toBeDefined();
    if (scheme === undefined) continue;
    const expectedKeys = [
      'id',
      'label',
      ...(scheme.abbreviation === undefined ? [] : ['abbreviation']),
      'kind',
      'jurisdiction',
      ...(scheme.scope === undefined ? [] : ['description']),
    ];
    expect(Object.keys(item), item.id).toEqual(expectedKeys);
    expect(item.label).toEqual(scheme.label);
    expect(item.kind).toBe(scheme.kind.value);
    expect(item.jurisdiction).toBe(scheme.jurisdiction.value);
    if (scheme.abbreviation !== undefined)
      expect(item.abbreviation).toBe(scheme.abbreviation.value);
    if (scheme.scope !== undefined) expect(item.description).toEqual(scheme.scope);
  }
});

test('bsn has no scope in the model and so no description', () => {
  const bsn = buildSummary(session.model).schemes.find((s) => s.id === 'bsn');
  expect(bsn).toBeDefined();
  expect(session.model.schemes.bsn?.scope).toBeUndefined();
  expect(bsn).not.toHaveProperty('description');
});

test('a model with every key order reversed gives the identical text', () => {
  const reversed = reverseKeys(session.model);
  expect(Object.keys(reversed.schemes)).not.toEqual(Object.keys(session.model.schemes));
  expect(JSON.stringify(buildSummary(reversed))).toBe(JSON.stringify(buildSummary(session.model)));
});

test('buildSummary does not change the model and shares no object with it', () => {
  const before = JSON.stringify(session.model);
  const summary = buildSummary(session.model);
  expect(JSON.stringify(session.model)).toBe(before);
  const first = summary.schemes[0];
  const source = first === undefined ? undefined : session.model.schemes[first.id];
  expect(first?.label).not.toBe(source?.label);
});
