import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from 'uio-config';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

// Trust and persistence of the schemes equal the workbook snapshot (DAT-08, DEC-046, plan 03-13).
// The snapshot is the owner's transcription of the UID table v1.2. A sub-score the workbook leaves
// blank is null (never 0), and a persistence cell reading `n/a` in any case is not modelled.

type Json = Record<string, unknown>;
type Cell = string | number | null;

const SOURCE = 'landscape-v1-2';
const SNAPSHOT = join(REPO_ROOT, 'sources', 'landscape-snapshot-v1.2.json');
const SCHEMES_DIR = join(REPO_ROOT, 'model', 'schemes');

/** The five trust sub-scores of the statement (DAT-08). */
const TRUST_KEYS = [
  'legal_basis',
  'registration_quality',
  'verifiability',
  'crosswalks',
  'lifecycle',
] as const;

/** The keys a trust statement may carry: its sub-scores plus the statement base (DEC-029). */
const TRUST_ALLOWED = [...TRUST_KEYS, 'certainty', 'source', 'note', 'condition'];

/** The six persistence events of model/vocab/persistence-event.yaml, in vocabulary order. */
const PERSISTENCE_EVENTS = [
  'merger',
  'acquisition-without-merger',
  'split',
  'dissolution',
  'move-within-country',
  'move-to-other-country',
] as const;

/** Keys that a total trust score or a persistence summary rating would carry. None is stored. */
const SUMMARY_KEY = /^(total|score|summary|rating|overall)$/i;

type SnapshotScheme = {
  trust?: Record<string, number | null>;
  persistence?: Record<string, Cell | string[]>;
};

const snapshotSchemes = (): Record<string, SnapshotScheme> =>
  (JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { schemes: Record<string, SnapshotScheme> })
    .schemes;

/** A snapshot cell the model does not carry: empty, or `n/a` in any case (DEC-046). */
function isNotModelled(cell: unknown): boolean {
  if (cell === null || cell === undefined) return true;
  return typeof cell === 'string' && (cell.trim() === '' || cell.trim().toLowerCase() === 'n/a');
}

/** The trust sub-scores the snapshot states for `id`, null where the workbook leaves them blank. */
function expectedTrust(id: string): Record<string, number | null> {
  const trust = snapshotSchemes()[id]?.trust;
  if (trust === undefined) throw new Error(`the snapshot has no trust for ${id}`);
  return Object.fromEntries(
    TRUST_KEYS.map((key) => {
      if (!(key in trust)) throw new Error(`the snapshot has no ${key} for ${id}`);
      return [key, trust[key] ?? null];
    }),
  );
}

/** The `[event, behaviour]` pairs the snapshot states for `id`, in vocabulary order, n/a skipped. */
function expectedPersistence(id: string): [string, string][] {
  const persistence = snapshotSchemes()[id]?.persistence;
  if (persistence === undefined) throw new Error(`the snapshot has no persistence for ${id}`);
  return PERSISTENCE_EVENTS.flatMap((event): [string, string][] => {
    const cell = persistence[event];
    return isNotModelled(cell) ? [] : [[event, String(cell)]];
  });
}

function loadScheme(id: string): Json {
  return parse(readFileSync(join(SCHEMES_DIR, `${id}.yaml`), 'utf8')) as Json;
}

function schemeEntries(): { id: string; data: Json }[] {
  return readdirSync(SCHEMES_DIR)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => ({
      id: name.slice(0, -'.yaml'.length),
      data: parse(readFileSync(join(SCHEMES_DIR, name), 'utf8')) as Json,
    }));
}

/** The trust statement of `data` equals the snapshot: five sub-scores, likely, from landscape-v1-2. */
function expectTrustMatches(id: string, data: Json): void {
  expect(data.trust, `${id} declares trust`).toBeDefined();
  const trust = (data.trust ?? {}) as Json;
  expect(
    Object.keys(trust).filter((key) => !TRUST_ALLOWED.includes(key)),
    `${id} trust`,
  ).toEqual([]);
  expect(
    Object.fromEntries(TRUST_KEYS.map((key) => [key, trust[key]])),
    `${id} trust sub-scores`,
  ).toEqual(expectedTrust(id));
  expect(trust.certainty, `${id} trust certainty`).toBe('likely');
  expect(trust.source, `${id} trust source`).toBe(SOURCE);
}

/** The persistence list of `data` equals the snapshot; a scheme with no modelled event has none. */
function expectPersistenceMatches(id: string, data: Json): void {
  const expected = expectedPersistence(id);
  if (expected.length === 0) {
    expect(data.persistence, `${id} declares no persistence`).toBeUndefined();
    return;
  }
  expect(data.persistence, `${id} declares persistence`).toBeDefined();
  const items = (data.persistence ?? []) as Json[];
  expect(
    items.map((item) => [item.event, item.behaviour]),
    `${id} persistence events and behaviour`,
  ).toEqual(expected);
  for (const item of items) {
    expect(item.certainty, `${id} ${String(item.event)} certainty`).toBe('likely');
    expect(item.source, `${id} ${String(item.event)} source`).toBe(SOURCE);
  }
}

describe('trust and persistence equal the workbook snapshot (DAT-08, DEC-046)', () => {
  test('kvk-number declares the trust and the six persistence statements of the snapshot', () => {
    const data = loadScheme('kvk-number');
    expectTrustMatches('kvk-number', data);
    expectPersistenceMatches('kvk-number', data);
  });

  test('every scheme that declares trust or persistence carries the snapshot values', () => {
    for (const { id, data } of schemeEntries()) {
      if (data.trust !== undefined) expectTrustMatches(id, data);
      if (data.persistence !== undefined) expectPersistenceMatches(id, data);
    }
  });

  test('no scheme stores a total trust score or a persistence summary rating', () => {
    for (const { id, data } of schemeEntries()) {
      const trust = (data.trust ?? {}) as Json;
      expect(
        Object.keys(trust).filter((key) => SUMMARY_KEY.test(key)),
        `${id} trust`,
      ).toEqual([]);
      const items = Array.isArray(data.persistence) ? (data.persistence as Json[]) : [];
      for (const item of items) {
        expect(
          Object.keys(item).filter((key) => SUMMARY_KEY.test(key)),
          `${id} persistence`,
        ).toEqual([]);
      }
      const stray = Object.keys(data).filter(
        (key) => /trust|persistence/i.test(key) && key !== 'trust' && key !== 'persistence',
      );
      expect(stray, `${id} top-level trust or persistence summary`).toEqual([]);
    }
  });
});
