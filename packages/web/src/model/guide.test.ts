// Tests of the guide data on the real model: WEB-04 (five example chips), D-06 (mixed chips worded
// as questions), D-17 (chip 2 passes rsin and promises no VAT number), DEC-025 (the only nine-digit
// value is the allow-listed example RSIN of SPEC section 10) and DEC-050 (no EORI level, no
// associated VAT number, in a conclusion or in the copy). The values are the public ones of
// SPEC section 10; none is built here.
import { describe, expect, test } from 'vitest';
import { createHost } from '../engine-host.ts';
import { UI_EN } from '../i18n/ui.en.ts';
import { UI_NL } from '../i18n/ui.nl.ts';
import { parseRoute, routeHref } from '../router.ts';
import { loadDistJson } from '../testing/load-model.ts';
import {
  CHIPS,
  type Chip,
  CONTRAST_VALUE,
  EORI_VALUE,
  RSIN_VALUE,
  VAT_VALUE,
  WALKTHROUGH,
} from './guide.ts';
import { runPaste } from './paste.ts';

const host = createHost(loadDistJson());
const { engine } = host;

const SPEC_VALUES = new Set([EORI_VALUE, VAT_VALUE, RSIN_VALUE, CONTRAST_VALUE]);

/** The DEC-050 claims no guide string may make, in either language. */
const DEC_050_TERMS = [
  'B01',
  'level',
  'niveau',
  'top-level',
  'declaring-entity',
  'VAT number of',
  'btw-nummer van',
];

function chip(id: string): Chip {
  const found = CHIPS.find((each) => each.id === id);
  if (found === undefined) throw new Error(`no chip ${id}`);
  return found;
}

function pasteChip(id: string) {
  const found = chip(id);
  if (found.kind !== 'paste') throw new Error(`chip ${id} is not a paste chip`);
  return found;
}

/** Every value any guide entry puts in the box. */
function guideValues(): string[] {
  return [
    ...CHIPS.flatMap((each) => (each.kind === 'paste' ? [...each.lines] : [])),
    ...WALKTHROUGH.flatMap((each) => [...each.lines]),
  ];
}

/** The declared map of a guide entry, as the page builds it. */
function declaredOf(declare?: { position: number; scheme: string }): Map<number, string> {
  return new Map(declare === undefined ? [] : [[declare.position, declare.scheme]]);
}

/** The text of a guide string must not hold a digit or one of the DEC-050 terms. */
function expectNoFacts(label: string, text: string) {
  expect(text, `${label} holds a digit`).not.toMatch(/\d/);
  for (const term of DEC_050_TERMS) {
    expect(text.toLowerCase(), `${label} holds "${term}"`).not.toContain(term.toLowerCase());
  }
}

describe('example chips (WEB-04, D-06)', () => {
  test('five chips in the order recognise, derive, consistency, describe, relate with unique ids', () => {
    expect(CHIPS.map((each) => each.id)).toEqual([
      'recognise',
      'derive',
      'consistency',
      'describe',
      'relate',
    ]);
    expect(CHIPS.map((each) => each.kind)).toEqual(['paste', 'paste', 'paste', 'view', 'view']);
    expect(new Set(CHIPS.map((each) => each.id)).size).toBe(CHIPS.length);
  });

  test('every value in a chip or walkthrough step is one of the four SPEC section 10 values, and the only nine-digit run is the allow-listed RSIN (T-07-17)', () => {
    for (const value of guideValues()) {
      expect(SPEC_VALUES.has(value), `${value.length} chars`).toBe(true);
      for (const run of value.match(/\d+/g) ?? []) {
        if (run.length === 9) expect(run).toBe(RSIN_VALUE);
      }
    }
  });

  test('chip derive declares the RSIN as rsin and derives an eori and no vat-nl (D-17, DEC-050)', () => {
    const derive = pasteChip('derive');
    expect(derive.lines).toEqual([RSIN_VALUE]);
    expect(derive.declare).toEqual({ position: 1, scheme: 'rsin' });
    const declared = new Map(
      derive.declare === undefined ? [] : [[derive.declare.position, derive.declare.scheme]],
    );
    const run = runPaste(engine, derive.lines, declared);
    const rows = (run.values.at(0)?.derivations ?? []).filter(
      (row) => row.conclusion.key === 'derive.derivation',
    );
    const schemes = rows.map((row) => row.conclusion.params.scheme);
    expect(schemes).toContain('eori');
    expect(schemes).not.toContain('vat-nl');
  });

  test('chip consistency gives three pairs, all consistent', () => {
    const consistency = pasteChip('consistency');
    expect(consistency.lines).toEqual([EORI_VALUE, VAT_VALUE, RSIN_VALUE]);
    const run = runPaste(engine, consistency.lines);
    expect(run.pairs.map((pair) => pair.outcome)).toEqual([
      'consistent',
      'consistent',
      'consistent',
    ]);
  });

  test('chip describe routes to the eori scheme and chip relate to rsin and eori, and both addresses round-trip', () => {
    const describe = chip('describe');
    const relate = chip('relate');
    if (describe.kind !== 'view' || relate.kind !== 'view') throw new Error('view chips expected');
    expect(describe.route).toEqual({ view: 'scheme', id: 'eori' });
    expect(relate.route).toEqual({ view: 'relate', a: 'rsin', b: 'eori' });
    for (const route of [describe.route, relate.route]) {
      expect(parseRoute(routeHref(route), host.model)).toEqual(route);
      expect(routeHref(route)).not.toMatch(/\d/);
    }
  });

  test('the question of every chip, in English and in Dutch, holds no digit and no DEC-050 term (T-07-18)', () => {
    expect(CHIPS.length).toBeGreaterThan(0);
    for (const each of CHIPS) {
      expectNoFacts(`en ${each.id}`, UI_EN[each.question]);
      expectNoFacts(`nl ${each.id}`, UI_NL[each.question]);
    }
  });
});

describe('EORI walkthrough (WEB-05, D-07, D-08)', () => {
  test('four steps in the order one value, an RSIN treated as RSIN, the contrast, all three together', () => {
    expect(WALKTHROUGH.map((step) => [step.lines, step.declare, step.section])).toEqual([
      [[EORI_VALUE], undefined, 'recognition'],
      [[RSIN_VALUE], { position: 1, scheme: 'rsin' }, 'derivations'],
      [[CONTRAST_VALUE], undefined, 'derivations'],
      [[EORI_VALUE, VAT_VALUE, RSIN_VALUE], undefined, 'consistency'],
    ]);
    expect(new Set(WALKTHROUGH.map((step) => step.id)).size).toBe(WALKTHROUGH.length);
  });

  test('each step runs to a non-empty target section of live engine output', () => {
    expect(WALKTHROUGH).toHaveLength(4);
    for (const step of WALKTHROUGH) {
      const run = runPaste(engine, step.lines, declaredOf(step.declare));
      if (step.section === 'recognition') {
        expect(
          run.values.some((value) => value.recognise.conclusions.length > 0),
          step.id,
        ).toBe(true);
      } else if (step.section === 'derivations') {
        expect(
          run.values.some(
            (value) => value.derivations.length > 0 || value.derive.conclusions.length > 0,
          ),
          step.id,
        ).toBe(true);
      } else {
        expect(run.pairs.length, step.id).toBeGreaterThan(0);
      }
    }
  });

  test('step 3 gives no derivation row for rsin or vat-nl (DEC-071)', () => {
    const step = WALKTHROUGH.at(2);
    expect(step?.lines).toEqual([CONTRAST_VALUE]);
    const run = runPaste(engine, step?.lines ?? [], declaredOf(step?.declare));
    const rows = (run.values.at(0)?.derivations ?? []).filter(
      (row) => row.conclusion.key === 'derive.derivation',
    );
    const schemes = rows.map((row) => row.conclusion.params.scheme);
    expect(schemes).not.toContain('rsin');
    expect(schemes).not.toContain('vat-nl');
  });

  test('every walkthrough title and body, in English and in Dutch, holds no digit and no DEC-050 term (T-07-18)', () => {
    expect(WALKTHROUGH.length).toBeGreaterThan(0);
    for (const step of WALKTHROUGH) {
      for (const key of [step.title, step.body]) {
        expectNoFacts(`en ${step.id} ${key}`, UI_EN[key]);
        expectNoFacts(`nl ${step.id} ${key}`, UI_NL[key]);
      }
    }
  });
});
