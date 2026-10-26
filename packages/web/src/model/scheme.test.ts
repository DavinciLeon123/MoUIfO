// Tests of the relation graph model on the real model: D-15 (the edges of the scheme page come only
// from engine describe data, incoming edges are marked inverse, the layout is deterministic) and
// WEB-02. The sections and applicability view-models of the scheme page are checked here too.
// No pasted value is involved.
import { describe, expect, test } from 'vitest';
import { createHost } from '../engine-host.ts';
import { loadDistJson } from '../testing/load-model.ts';
import { type GraphEdge, graphEdges, layout } from './graph.ts';
import { applicabilityRows, schemeSections } from './scheme.ts';

const host = createHost(loadDistJson());
const ids = Object.keys(host.model.schemes);

function describeOf(id: string) {
  const data = host.engine.describe(id).data;
  if (data === null) throw new Error(`no description for ${id}`);
  return data;
}

/**
 * The edges of a scheme computed in the test from describe data alone: its relations, components and
 * rules_out (outgoing), its rules_in (incoming), and every other scheme's relations and components
 * that point at it (incoming, inverse). Each as "other|type|ref|direction|certainty|source".
 */
function expectedEdges(id: string): string[] {
  const line = (
    other: string,
    type: string,
    ref: string,
    direction: string,
    claim: { certainty: string; source: { id: string } },
  ) => `${other}|${type}|${ref}|${direction}|${claim.certainty}|${claim.source.id}`;
  const out: string[] = [];
  const own = describeOf(id);
  const usable = (other: string) => other !== id && ids.includes(other);
  for (const claim of own.relations) {
    if (usable(claim.value.target)) {
      out.push(line(claim.value.target, 'relation', claim.value.kind, 'out', claim));
    }
  }
  for (const claim of own.components) {
    if (usable(claim.value.scheme)) {
      out.push(line(claim.value.scheme, 'component', claim.value.prefix, 'out', claim));
    }
  }
  for (const claim of own.rules_out) {
    if (usable(claim.value.output)) {
      out.push(line(claim.value.output, 'rule', claim.value.id, 'out', claim));
    }
  }
  for (const claim of own.rules_in) {
    if (usable(claim.value.input)) {
      out.push(line(claim.value.input, 'rule', claim.value.id, 'in', claim));
    }
  }
  for (const other of ids) {
    if (other === id) continue;
    for (const claim of describeOf(other).relations) {
      if (claim.value.target === id)
        out.push(line(other, 'relation', claim.value.kind, 'in', claim));
    }
    for (const claim of describeOf(other).components) {
      if (claim.value.scheme === id)
        out.push(line(other, 'component', claim.value.prefix, 'in', claim));
    }
  }
  return out.sort();
}

const asLine = (edge: GraphEdge) =>
  `${edge.other}|${edge.type}|${edge.ref}|${edge.direction}|${edge.certainty}|${edge.source.id}`;

describe('graphEdges (D-15)', () => {
  test('eori: the relation to rsin, both rules with rsin, and nothing else', () => {
    const edges = graphEdges(host, 'eori');
    const mine = edges.map((edge) => `${edge.other}|${edge.type}|${edge.ref}|${edge.direction}`);
    expect(mine).toContain('rsin|relation|derived-from|out');
    expect(mine).toContain('rsin|rule|eori-nl-from-rsin|in');
    expect(mine).toContain('rsin|rule|rsin-from-eori-nl|out');
    expect(new Set(edges.map((edge) => edge.other))).toEqual(new Set(['rsin']));
  });

  test('an incoming edge is marked inverse and an outgoing one is not', () => {
    for (const id of ids) {
      for (const edge of graphEdges(host, id)) {
        expect(edge.inverse, `${id} ${asLine(edge)}`).toBe(edge.direction === 'in');
        // The statement is kept in the model's direction.
        expect(edge.direction === 'out' ? edge.from : edge.to, id).toBe(id);
        expect(edge.direction === 'out' ? edge.to : edge.from, id).toBe(edge.other);
      }
    }
  });

  test('the edges of every scheme equal the set computed independently from describe data', () => {
    for (const id of ids) {
      expect(graphEdges(host, id).map(asLine).sort(), id).toEqual(expectedEdges(id));
    }
  });

  test('the order is by neighbour, then type, and is the same on every call', () => {
    for (const id of ids) {
      const first = graphEdges(host, id);
      expect(JSON.stringify(graphEdges(host, id))).toBe(JSON.stringify(first));
      const others = first.map((edge) => edge.other);
      expect(others, id).toEqual([...others].sort());
    }
  });

  test('a scheme the model does not hold has no edges', () => {
    expect(graphEdges(host, 'nope')).toEqual([]);
  });
});

describe('layout (D-15)', () => {
  test('the centre is the middle of the viewBox and each neighbour sits on one circle around it', () => {
    for (const id of ids) {
      const edges = graphEdges(host, id);
      const placed = layout(edges);
      const others = [...new Set(edges.map((edge) => edge.other))];
      expect(
        placed.nodes.map((node) => node.id),
        id,
      ).toEqual(others);
      expect(placed.centre).toEqual({ x: placed.width / 2, y: placed.height / 2 });
      const seen = new Set<string>();
      for (const node of placed.nodes) {
        const distance = Math.hypot(node.x - placed.centre.x, node.y - placed.centre.y);
        expect(distance, `${id} ${node.id}`).toBeCloseTo(placed.radius, 1);
        expect(node.x).toBeGreaterThan(0);
        expect(node.x).toBeLessThan(placed.width);
        expect(node.y).toBeGreaterThan(0);
        expect(node.y).toBeLessThan(placed.height);
        seen.add(`${node.x}/${node.y}`);
      }
      expect(seen.size, `${id} positions are distinct`).toBe(others.length);
      expect(placed.lines.length, id).toBe(edges.length);
    }
  });

  test('parallel edges between the same two schemes are drawn apart', () => {
    const placed = layout(graphEdges(host, 'eori'));
    expect(placed.lines.length).toBe(3);
    const labels = new Set(placed.lines.map((line) => `${line.lx}/${line.ly}`));
    expect(labels.size).toBe(3);
  });

  test('the output is deterministic and an edgeless scheme has the centre only', () => {
    const edges = graphEdges(host, 'kvk-number');
    expect(JSON.stringify(layout(edges))).toBe(JSON.stringify(layout(edges)));
    const none = layout([]);
    expect(none.nodes).toEqual([]);
    expect(none.lines).toEqual([]);
  });
});

describe('schemeSections', () => {
  test('groups the describe conclusions by key in the engine order, one group per key', () => {
    const parts = schemeSections(host, 'eori');
    expect(parts).not.toBeNull();
    const keys = (parts?.sections ?? []).map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('describe.kind');
    const grouped = (parts?.sections ?? []).flatMap((section) => section.conclusions);
    expect(grouped.length).toBe(host.engine.describe('eori').conclusions.length);
    expect(grouped.length).toBeGreaterThan(20);
    for (const section of parts?.sections ?? []) {
      for (const conclusion of section.conclusions) expect(conclusion.key).toBe(section.key);
    }
  });

  test('an unknown id gives null', () => {
    expect(schemeSections(host, 'nope')).toBeNull();
  });
});

describe('applicabilityRows (DEC-032, DEC-041)', () => {
  test('one row per jurisdiction of the model in sorted order, every vocabulary status in each', () => {
    const rows = applicabilityRows(host, 'eori');
    expect(rows.map((row) => row.jurisdiction)).toEqual([
      'BE',
      'EU',
      'GB',
      'GLOBAL',
      'GR',
      'NL',
      'XI',
    ]);
    for (const row of rows) {
      expect(row.statuses.map((entry) => entry.status)).toEqual([
        'issued',
        'recognised',
        'verifiable',
        'not-applicable',
      ]);
    }
  });

  test('NL inherits recognised and verifiable from the EU, with a conclusion', () => {
    const nl = applicabilityRows(host, 'eori').find((row) => row.jurisdiction === 'NL');
    for (const status of ['recognised', 'verifiable']) {
      const entry = nl?.statuses.find((each) => each.status === status);
      expect(entry?.basis).toBe('inherited');
      expect(entry?.from?.id).toBe('EU');
      expect(entry?.conclusion?.key).toBe('applicability.inherited');
    }
  });

  test('GLOBAL has no data for any status and no conclusion', () => {
    const global = applicabilityRows(host, 'eori').find((row) => row.jurisdiction === 'GLOBAL');
    for (const entry of global?.statuses ?? []) {
      expect(entry.basis).toBe('no-data');
      expect(entry.conclusion).toBeNull();
      expect(entry.certainty).toBeNull();
    }
  });
});
