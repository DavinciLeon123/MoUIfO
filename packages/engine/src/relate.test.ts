import { describe, expect, test } from 'vitest';
import { createEngine } from './engine.ts';
import type { Model, RelationEntry, Rule } from './model-types.ts';
import type { RelationPath } from './relate.ts';
import { fixtureModel, fixtureScheme } from './testing/fixture-model.ts';
import { loadDistModel } from './testing/load-model.ts';
import type { Certainty, Context, Step } from './types.ts';

const model = loadDistModel();
const engine = createEngine(model);

describe('relate: the rsin-eori tracer on the real model', () => {
  test('rsin and eori give one path whose step is the inverse derived-from relation', () => {
    const result = engine.relate('rsin', 'eori');
    expect(result.warnings).toEqual([]);
    expect(result.data).toHaveLength(1);
    const path = result.data[0];
    expect(path?.schemes).toEqual(['rsin', 'eori']);
    expect(path?.hops).toHaveLength(1);
    const hop = path?.hops[0];
    expect(hop?.from).toBe('rsin');
    expect(hop?.to).toBe('eori');
    expect(hop?.step).toMatchObject({
      kind: 'fact',
      edge: 'relation',
      ref: 'eori/relations/0',
      inverse: true,
    });
  });

  test('the parallel rules are in also_via in code-unit order with their direction', () => {
    const hop = engine.relate('rsin', 'eori').data[0]?.hops[0];
    expect(hop?.also_via.map((step) => [step.kind, step.edge, step.ref, step.inverse])).toEqual([
      ['rule', 'rule', 'eori-nl-from-rsin', false],
      ['rule', 'rule', 'rsin-from-eori-nl', true],
    ]);
  });

  test('without a context the condition is an assumption, so the path is likely', () => {
    const path = engine.relate('rsin', 'eori').data[0];
    expect(path?.certainty).toBe('likely');
    const assumptions = path?.explanation.filter((step) => step.kind === 'assumption') ?? [];
    expect(assumptions.map((step) => step.ref)).toEqual([
      'eori/relations/0/condition/issuing_country',
      'eori/relations/0/condition/entity_form',
    ]);
    expect(assumptions.map((step) => step.condition)).toEqual([
      { issuing_country: 'NL' },
      { entity_form: 'legal-person' },
    ]);
    expect(assumptions.every((step) => step.source === null)).toBe(true);
  });

  test('the conclusion reads the stored relation and marks it inverse', () => {
    const result = engine.relate('rsin', 'eori');
    expect(result.conclusions).toHaveLength(1);
    const conclusion = result.conclusions[0];
    expect(conclusion?.key).toBe('relate.path');
    expect(conclusion?.params).toEqual({ a: 'rsin', b: 'eori', steps: '1' });
    expect(conclusion?.statement).toContain('eori derived-from rsin (inverse)');
    expect(conclusion?.certainty).toBe('likely');
  });

  test('a context that establishes the entity form makes the path certain with the ctx fact', () => {
    const path = engine.relate('rsin', 'eori', { entity_form: 'legal-person' }).data[0];
    expect(path?.certainty).toBe('certain');
    expect(path?.explanation.map((step) => step.ref)).toContain('ctx/entity_form');
    expect(path?.explanation.some((step) => step.kind === 'assumption')).toBe(false);
  });

  test('a context that contradicts the condition drops every rsin-eori edge', () => {
    const result = engine.relate('rsin', 'eori', { entity_form: 'sole-proprietorship' });
    expect(result.data).toEqual([]);
    expect(result.conclusions).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['no-chain']);
  });
});

describe('relate: eori and rsin by issuing country (D-02, DEC-074)', () => {
  test('a Dutch legal-person context gives one certain path through the relation with the ctx facts', () => {
    const result = engine.relate('eori', 'rsin', {
      issuing_country: 'NL',
      entity_form: 'legal-person',
    });
    expect(result.data).toHaveLength(1);
    const path = result.data[0];
    expect(path?.certainty).toBe('certain');
    expect(path?.hops[0]?.step).toMatchObject({
      edge: 'relation',
      ref: 'eori/relations/0',
      inverse: false,
    });
    const refs = path?.explanation.map((step) => step.ref) ?? [];
    expect(refs).toContain('ctx/issuing_country');
    expect(refs).toContain('ctx/entity_form');
  });

  test('a Belgian legal-person context no longer takes the relation: the hop is the inverse rule', () => {
    const result = engine.relate('eori', 'rsin', {
      issuing_country: 'BE',
      entity_form: 'legal-person',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.hops[0]?.step).toMatchObject({
      edge: 'rule',
      ref: 'eori-nl-from-rsin',
      inverse: true,
    });
  });
});

/** An edge read straight from the raw model: its ref, its stored ends and its kind. */
type OracleEdge = {
  ref: string;
  from: string;
  to: string;
  kind: 'relation' | 'rule' | 'component';
};

/** Every relation, rule and component of the raw model as an edge; no engine module is used. */
function oracleEdges(source: Model): OracleEdge[] {
  const edges: OracleEdge[] = [];
  for (const id of Object.keys(source.schemes).sort()) {
    const scheme = source.schemes[id];
    if (scheme === undefined) continue;
    (scheme.relations ?? []).forEach((relation, index) => {
      edges.push({
        ref: `${id}/relations/${index}`,
        from: id,
        to: relation.target,
        kind: 'relation',
      });
    });
    for (const component of scheme.components ?? []) {
      edges.push({
        ref: `${id}/components/${component.prefix}`,
        from: id,
        to: component.scheme,
        kind: 'component',
      });
    }
    for (const rule of scheme.rules ?? []) {
      edges.push({ ref: rule.id, from: rule.input, to: rule.output, kind: 'rule' });
    }
  }
  return edges;
}

/** Breadth-first distance over the undirected raw edges for every ordered pair (null: unreachable). */
function oracleDistances(source: Model): Map<string, number | null> {
  const ids = Object.keys(source.schemes).sort();
  const neighbours = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const edge of oracleEdges(source)) {
    neighbours.get(edge.from)?.add(edge.to);
    neighbours.get(edge.to)?.add(edge.from);
  }
  const result = new Map<string, number | null>();
  for (const start of ids) {
    const seen = new Map<string, number>([[start, 0]]);
    const queue = [start];
    for (let at = 0; at < queue.length; at += 1) {
      const node = queue[at] as string;
      for (const next of neighbours.get(node) ?? []) {
        if (seen.has(next)) continue;
        seen.set(next, (seen.get(node) as number) + 1);
        queue.push(next);
      }
    }
    for (const end of ids) {
      if (end !== start) result.set(`${start}>${end}`, seen.get(end) ?? null);
    }
  }
  return result;
}

const RANK: Record<Certainty, number> = { certain: 3, likely: 2, possible: 1 };

function weakestOf(steps: readonly Step[]): Certainty {
  let result: Certainty = 'certain';
  for (const step of steps) if (RANK[step.certainty] < RANK[result]) result = step.certainty;
  return result;
}

function sequences(paths: readonly RelationPath[]): string[] {
  return paths.map((path) => path.schemes.join('>'));
}

const schemeIds = Object.keys(model.schemes).sort();
const distances = oracleDistances(model);
const edges = oracleEdges(model);

describe('relate on the real model: known chains', () => {
  test('peppol-id to rsin gives the three sequences, each hop from peppol-id choosing its contains relation', () => {
    const result = engine.relate('peppol-id', 'rsin');
    expect(sequences(result.data)).toEqual([
      'peppol-id>kvk-number>rsin',
      'peppol-id>oin>rsin',
      'peppol-id>vat-nl>rsin',
    ]);
    const refs = result.data.map((path) => [
      path.hops[0]?.step.ref,
      path.hops[0]?.step.edge,
      path.hops[0]?.also_via.map((step) => step.ref),
    ]);
    expect(refs).toEqual([
      ['peppol-id/relations/0', 'relation', ['peppol-id/components/0106']],
      ['peppol-id/relations/1', 'relation', ['peppol-id/components/0190']],
      ['peppol-id/relations/2', 'relation', ['peppol-id/components/9944']],
    ]);
    expect(result.data[0]?.hops[0]?.also_via[0]).toMatchObject({
      kind: 'component',
      edge: 'component',
      inverse: false,
    });
  });

  test('vat-nl to eori is the single chain through rsin', () => {
    const result = engine.relate('vat-nl', 'eori');
    expect(sequences(result.data)).toEqual(['vat-nl>rsin>eori']);
    expect(result.data[0]?.hops.map((hop) => hop.step.ref)).toEqual([
      'vat-nl/relations/0',
      'eori/relations/0',
    ]);
  });

  test('eori to kbo gives the four 4-hop sequences, not one chain per edge combination', () => {
    const result = engine.relate('eori', 'kbo');
    expect(sequences(result.data)).toEqual([
      'eori>rsin>kvk-number>lei>kbo',
      'eori>rsin>kvk-number>peppol-id>kbo',
      'eori>rsin>oin>peppol-id>kbo',
      'eori>rsin>vat-nl>peppol-id>kbo',
    ]);
    expect(result.conclusions).toHaveLength(4);
    for (const path of result.data) expect(path.hops).toHaveLength(4);
  });

  test('a rule hop and an inverse relation hop read as rule and inverse text', () => {
    const statement = engine.relate('peppol-id', 'rsin').conclusions[0]?.statement;
    expect(statement).toContain(
      'peppol-id contains kvk-number; rsin prerequisite kvk-number (inverse).',
    );
    const rule = engine.relate('oin', 'rsin').data[0]?.hops[0];
    expect(rule?.step.ref).toBe('oin/relations/1');
    expect(rule?.also_via.map((step) => [step.ref, step.edge, step.inverse])).toEqual([
      ['rsin-from-oin', 'rule', false],
      ['oin-from-rsin', 'rule', true],
    ]);
  });

  test('the step of a hop is never one of its also_via steps and parallel edges are not chains', () => {
    for (const path of engine.relate('rsin', 'eori').data) {
      for (const hop of path.hops) {
        expect(hop.also_via.map((step) => step.ref)).not.toContain(hop.step.ref);
      }
    }
    expect(engine.relate('rsin', 'eori').data).toHaveLength(1);
  });
});

describe('relate on the real model: oracle over every ordered pair', () => {
  test('the model has 16 schemes and the oracle sees 35 edges', () => {
    expect(schemeIds).toHaveLength(16);
    expect(edges).toHaveLength(35);
  });

  const pairs = schemeIds.flatMap((a) =>
    schemeIds.filter((b) => b !== a).map((b) => [a, b] as const),
  );

  test.for(pairs)('%s to %s: the path length is the breadth-first distance', ([a, b]) => {
    const distance = distances.get(`${a}>${b}`) ?? null;
    const result = engine.relate(a, b);
    if (distance === null || distance > 4) {
      expect(result.data).toEqual([]);
      expect(result.conclusions).toEqual([]);
      expect(result.warnings.map((warning) => warning.code)).toEqual(['no-chain']);
      return;
    }
    expect(result.warnings).toEqual([]);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.conclusions).toHaveLength(result.data.length);
    const seen = new Set<string>();
    for (const [position, path] of result.data.entries()) {
      expect(path.hops).toHaveLength(distance);
      expect(path.schemes).toHaveLength(distance + 1);
      expect(path.schemes[0]).toBe(a);
      expect(path.schemes[distance]).toBe(b);
      expect(new Set(path.schemes).size).toBe(path.schemes.length);
      expect(seen.has(path.schemes.join('>'))).toBe(false);
      seen.add(path.schemes.join('>'));
      for (const [index, hop] of path.hops.entries()) {
        expect(hop.from).toBe(path.schemes[index]);
        expect(hop.to).toBe(path.schemes[index + 1]);
        const between = edges
          .filter(
            (edge) =>
              (edge.from === hop.from && edge.to === hop.to) ||
              (edge.from === hop.to && edge.to === hop.from),
          )
          .map((edge) => edge.ref)
          .sort();
        const named = [hop.step, ...hop.also_via].map((step) => step.ref).sort();
        expect(named).toEqual(between);
        for (const step of [hop.step, ...hop.also_via]) {
          const edge = edges.find((each) => each.ref === step.ref);
          expect(step.edge).toBe(edge?.kind);
          expect(step.inverse).toBe(edge?.from !== hop.from);
        }
      }
      const conclusion = result.conclusions[position];
      expect(conclusion?.certainty).toBe(path.certainty);
      expect(conclusion?.certainty).toBe(weakestOf(path.explanation));
      expect(conclusion?.explanation).toEqual(path.explanation);
      expect(path.certainty).toBe(weakestOf(path.explanation));
    }
    expect(JSON.stringify(engine.relate(a, b))).toBe(JSON.stringify(result));

    const back = engine.relate(b, a);
    expect(sequences(back.data).sort()).toEqual(
      result.data.map((path) => [...path.schemes].reverse().join('>')).sort(),
    );
    for (const path of result.data) {
      const reversed = back.data.find(
        (each) => each.schemes.join('>') === [...path.schemes].reverse().join('>'),
      );
      const forward = path.hops.map((hop) => [hop.step.ref, hop.step.inverse]);
      const flipped = [...(reversed?.hops ?? [])]
        .reverse()
        .map((hop) => [hop.step.ref, hop.step.inverse !== true]);
      expect(flipped).toEqual(forward);
    }
  });

  test('every pair with bsn gives no-chain and all 105 other unordered pairs have a path', () => {
    let unordered = 0;
    for (const [index, a] of schemeIds.entries()) {
      for (const b of schemeIds.slice(index + 1)) {
        const result = engine.relate(a, b);
        if (a === 'bsn' || b === 'bsn') {
          expect(result.data, `${a} ${b}`).toEqual([]);
          expect(result.warnings.map((warning) => warning.code)).toEqual(['no-chain']);
        } else {
          unordered += 1;
          expect(result.data.length, `${a} ${b}`).toBeGreaterThan(0);
        }
      }
    }
    expect(unordered).toBe(105);
  });
});

function relation(target: string, more: Partial<RelationEntry> = {}): RelationEntry {
  return { kind: 'derived-from', target, certainty: 'certain', source: 'fx-law', ...more };
}

function ruleOf(id: string, input: string, output: string, more: Partial<Rule> = {}): Rule {
  return {
    id,
    input,
    output,
    transform: [{ add_prefix: 'X' }],
    certainty: 'certain',
    source: 'fx-law',
    ...more,
  };
}

function chainModel(ids: readonly string[], cyclic = false): Model {
  return fixtureModel({
    schemes: ids.map((id, index) => {
      const next = ids[index + 1] ?? (cyclic ? ids[0] : undefined);
      return fixtureScheme(id, { relations: next === undefined ? [] : [relation(next)] });
    }),
  });
}

describe('relate on fixtures: limits', () => {
  const six = createEngine(chainModel(['s1', 's2', 's3', 's4', 's5', 's6']));

  test('a five-hop chain: s1 to s5 has 4 hops and s1 to s6 has no chain', () => {
    const reached = six.relate('s1', 's5');
    expect(sequences(reached.data)).toEqual(['s1>s2>s3>s4>s5']);
    expect(reached.data[0]?.hops).toHaveLength(4);
    const missed = six.relate('s1', 's6');
    expect(missed.data).toEqual([]);
    expect(missed.warnings).toEqual([
      { code: 'no-chain', message: 'No chain of at most four steps connects the two schemes.' },
    ]);
    expect(six.relate('s6', 's2').data).toHaveLength(1);
    expect(six.relate('s6', 's1').data).toEqual([]);
  });

  test('a cycle never repeats a scheme and returns both shortest chains', () => {
    const cycle = createEngine(chainModel(['c1', 'c2', 'c3', 'c4'], true));
    expect(sequences(cycle.relate('c1', 'c3').data)).toEqual(['c1>c2>c3', 'c1>c4>c3']);
    for (const a of ['c1', 'c2', 'c3', 'c4']) {
      for (const b of ['c1', 'c2', 'c3', 'c4']) {
        if (a === b) continue;
        for (const path of cycle.relate(a, b).data) {
          expect(new Set(path.schemes).size).toBe(path.schemes.length);
          expect(path.hops.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  test('a triangle with a tail: the direct hop wins and no chain loops back', () => {
    const triangle = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('t1', { relations: [relation('t2'), relation('t3')] }),
          fixtureScheme('t2', { relations: [relation('t3')] }),
          fixtureScheme('t3', { relations: [relation('t4')] }),
          fixtureScheme('t4'),
        ],
      }),
    );
    expect(sequences(triangle.relate('t1', 't3').data)).toEqual(['t1>t3']);
    expect(sequences(triangle.relate('t1', 't4').data)).toEqual(['t1>t3>t4']);
    expect(sequences(triangle.relate('t2', 't4').data)).toEqual(['t2>t3>t4']);
  });
});

describe('relate on fixtures: edge choice and conditions', () => {
  test('equal strength: relation before rule before component; a stronger edge wins first', () => {
    const tied = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('p1', {
            relations: [relation('p2', { certainty: 'likely' })],
            components: [{ prefix: '01', scheme: 'p2', certainty: 'likely', source: 'fx-law' }],
            rules: [ruleOf('p-rule', 'p1', 'p2', { certainty: 'likely' })],
          }),
          fixtureScheme('p2'),
        ],
      }),
    );
    const hop = tied.relate('p1', 'p2').data[0]?.hops[0];
    expect([hop?.step.ref, hop?.also_via.map((step) => step.ref)]).toEqual([
      'p1/relations/0',
      ['p-rule', 'p1/components/01'],
    ]);

    const strong = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('p1', {
            relations: [relation('p2', { certainty: 'likely' })],
            components: [{ prefix: '01', scheme: 'p2', certainty: 'certain', source: 'fx-law' }],
          }),
          fixtureScheme('p2'),
        ],
      }),
    );
    const result = strong.relate('p1', 'p2');
    const best = result.data[0]?.hops[0];
    expect(best?.step).toMatchObject({ kind: 'component', edge: 'component', inverse: false });
    expect(best?.also_via.map((step) => step.ref)).toEqual(['p1/relations/0']);
    expect(result.data[0]?.certainty).toBe('certain');
    expect(result.conclusions[0]?.statement).toContain('p1 contains component p2 (prefix 01).');
  });

  test('a rule edge reads as a rule hop and an inverted rule is marked', () => {
    const ruled = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('r1', { rules: [ruleOf('r-up', 'r1', 'r2')] }),
          fixtureScheme('r2'),
        ],
      }),
    );
    expect(ruled.relate('r1', 'r2').conclusions[0]?.statement).toContain('rule r-up: r1 to r2.');
    const back = ruled.relate('r2', 'r1');
    expect(back.data[0]?.hops[0]?.step).toMatchObject({
      kind: 'rule',
      edge: 'rule',
      inverse: true,
    });
    expect(back.conclusions[0]?.statement).toContain('rule r-up: r1 to r2 (inverse).');
  });

  const conditional = createEngine(
    fixtureModel({
      schemes: [
        fixtureScheme('k1', {
          relations: [relation('k2', { condition: { issuing_country: '!AA' } })],
        }),
        fixtureScheme('k2'),
      ],
    }),
  );

  test('issuing_country !AA: AA drops the edge, BB keeps it with the ctx fact, no ctx keeps it as an assumption', () => {
    const dropped = conditional.relate('k1', 'k2', { issuing_country: 'AA' });
    expect(dropped.data).toEqual([]);
    expect(dropped.warnings.map((warning) => warning.code)).toEqual(['no-chain']);

    const kept = conditional.relate('k1', 'k2', { issuing_country: 'BB' }).data[0];
    expect(kept?.certainty).toBe('certain');
    expect(kept?.explanation.map((step) => [step.kind, step.ref])).toEqual([
      ['fact', 'k1/relations/0'],
      ['fact', 'ctx/issuing_country'],
    ]);

    const assumed = conditional.relate('k1', 'k2').data[0];
    expect(assumed?.certainty).toBe('likely');
    expect(assumed?.explanation.map((step) => [step.kind, step.ref])).toEqual([
      ['fact', 'k1/relations/0'],
      ['assumption', 'k1/relations/0/condition/issuing_country'],
    ]);
    expect(assumed?.explanation[1]?.condition).toEqual({ issuing_country: '!AA' });
  });

  test('a dropped edge makes a longer chain the shortest', () => {
    const detour = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('d1', {
            relations: [relation('d3', { condition: { issuing_country: 'AA' } }), relation('d2')],
          }),
          fixtureScheme('d2', { relations: [relation('d3')] }),
          fixtureScheme('d3'),
        ],
      }),
    );
    expect(sequences(detour.relate('d1', 'd3').data)).toEqual(['d1>d3']);
    expect(sequences(detour.relate('d1', 'd3', { issuing_country: 'BB' }).data)).toEqual([
      'd1>d2>d3',
    ]);
  });

  test('the same ctx fact is listed once in an explanation that uses it on several hops', () => {
    const twice = createEngine(
      fixtureModel({
        schemes: [
          fixtureScheme('m1', {
            relations: [relation('m2', { condition: { entity_form: 'legal-person' } })],
          }),
          fixtureScheme('m2', {
            relations: [relation('m3', { condition: { entity_form: 'legal-person' } })],
          }),
          fixtureScheme('m3'),
        ],
      }),
    );
    const path = twice.relate('m1', 'm3', { entity_form: 'legal-person' }).data[0];
    expect(path?.explanation.filter((step) => step.ref === 'ctx/entity_form')).toHaveLength(1);
    expect(path?.certainty).toBe('certain');
  });
});

describe('relate: input handling', () => {
  test('unknown, prototype and non-string ids', () => {
    for (const bad of ['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const first = engine.relate(bad, 'eori');
      expect(first.data).toEqual([]);
      expect(first.warnings).toEqual([
        {
          code: 'unknown-scheme',
          message: 'No scheme with this id exists in the model.',
          ref: 'a',
        },
      ]);
      const second = engine.relate('eori', bad);
      expect(second.warnings.map((warning) => [warning.code, warning.ref])).toEqual([
        ['unknown-scheme', 'b'],
      ]);
      expect(JSON.stringify(first.warnings)).not.toContain(bad);
    }
    const both = engine.relate('nope', 'nada');
    expect(both.warnings.map((warning) => [warning.code, warning.ref])).toEqual([
      ['unknown-scheme', 'a'],
      ['unknown-scheme', 'b'],
    ]);
    for (const bad of [42, null, undefined, {}, ['eori']]) {
      const result = engine.relate(bad as unknown as string, 'eori');
      expect(result.data).toEqual([]);
      expect(result.warnings.map((warning) => [warning.code, warning.ref])).toEqual([
        ['invalid-input', 'a'],
      ]);
      expect(engine.relate('eori', bad as unknown as string).warnings[0]?.code).toBe(
        'invalid-input',
      );
    }
  });

  test('the same scheme twice gives same-scheme and no data', () => {
    for (const id of ['eori', 'bsn']) {
      const result = engine.relate(id, id);
      expect(result.data).toEqual([]);
      expect(result.conclusions).toEqual([]);
      expect(result.warnings.map((warning) => warning.code)).toEqual(['same-scheme']);
    }
  });

  test('a ctx with an unknown key or value still answers, with a warning', () => {
    const key = engine.relate('rsin', 'eori', { colour: 'red' } as unknown as Context);
    expect(key.data).toHaveLength(1);
    expect(key.warnings.map((warning) => warning.code)).toEqual(['unknown-context-key']);
    const value = engine.relate('rsin', 'eori', { entity_form: 'not-a-form' });
    expect(value.data[0]?.certainty).toBe('likely');
    expect(value.warnings.map((warning) => warning.code)).toEqual(['unknown-context-value']);
    const proto = JSON.parse('{"__proto__": {"entity_form": "legal-person"}}') as Context;
    const polluted = engine.relate('rsin', 'eori', proto);
    expect(polluted.data[0]?.certainty).toBe('likely');
    expect(polluted.warnings.map((warning) => warning.code)).toEqual(['unknown-context-key']);
    const bad = engine.relate('rsin', 'eori', 'legal-person' as unknown as Context);
    expect(bad.warnings.map((warning) => warning.code)).toEqual(['invalid-context']);
    expect(bad.data).toHaveLength(1);
  });

  test('a result never aliases the engine: changing it does not change the next answer', () => {
    const first = engine.relate('rsin', 'eori');
    const before = JSON.stringify(first);
    const hop = first.data[0]?.hops[0];
    if (hop?.step.source) hop.step.source.title = 'changed';
    hop?.also_via.pop();
    first.data[0]?.explanation.pop();
    expect(JSON.stringify(engine.relate('rsin', 'eori'))).toBe(before);
  });
});
