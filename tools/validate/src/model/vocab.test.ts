import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECKSUM_IDS } from '@uio/engine';
import { REPO_ROOT } from 'uio-config';
import { afterAll, describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { checkModel, checkModelFiles } from './check-model.ts';
import { type ModelFile, parseModelFile } from './load.ts';
import { buildRegistry } from './refs.ts';
import { fixture, realModelFiles, withRealModel } from './testing.ts';

const APPLICABILITY_STATUS = 'model/vocab/applicability-status.yaml';

type Member = {
  id: string;
  label: { en: string; nl?: string };
  definition: { en: string };
  inherits_down?: boolean;
  rationale?: { en: string };
  source?: string;
};
type Vocab = { id: string; label: { en: string; nl?: string }; values: Member[] };

const realFile = (path: string): ModelFile => {
  const found = realModelFiles().find((file) => file.path === path);
  if (found === undefined) throw new Error(`missing real file ${path}`);
  return found;
};
const realVocab = (id: string): Vocab =>
  parse(realFile(`model/vocab/${id}.yaml`).text, { schema: 'core' }) as Vocab;
const idsOf = (id: string): string[] => realVocab(id).values.map((value) => value.id);

/** 1-based line and column of the first occurrence of `needle` in `text`. */
function where(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

const HEAD = 'id: applicability-status\nlabel:\n  en: Applicability status\nvalues:\n';
const member = (id: string, extra = ''): string =>
  `  - id: ${id}\n    label:\n      en: Label\n    definition:\n      en: Definition\n${extra}`;
const applicability = (members: string): ModelFile =>
  fixture(APPLICABILITY_STATUS, `${HEAD}${members}`);
const check = (file: ModelFile) => checkModelFiles(withRealModel(file));

const copies: string[] = [];
afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the real `model/` directory, returned as a repository root. */
function modelCopy(): string {
  const root = mkdtempSync(join(tmpdir(), 'uio-vocab-'));
  copies.push(root);
  cpSync(join(REPO_ROOT, 'model'), join(root, 'model'), { recursive: true });
  return root;
}

describe('the real applicability-status vocabulary (DEC-041)', () => {
  test('the four statuses are in SPEC order', () => {
    expect(idsOf('applicability-status')).toEqual([
      'issued',
      'recognised',
      'verifiable',
      'not-applicable',
    ]);
  });

  test('inherits_down is issued false, recognised true, verifiable true, not-applicable false', () => {
    const flags = Object.fromEntries(
      realVocab('applicability-status').values.map((value) => [value.id, value.inherits_down]),
    );
    expect(flags).toEqual({
      issued: false,
      recognised: true,
      verifiable: true,
      'not-applicable': false,
    });
  });

  test('every rationale cites DEC-041 and no member cites a source', () => {
    for (const value of realVocab('applicability-status').values) {
      expect(value.rationale?.en).toContain('DEC-041');
      expect(value.rationale?.en).toContain('no external source');
      expect(value.source).toBeUndefined();
    }
  });

  test('the repository validates with no problem', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });
});

describe('the applicability-status schema', () => {
  test('a member without inherits_down is one error at that member', () => {
    const file = applicability(member('issued'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: APPLICABILITY_STATUS,
      ...where(file.text, 'id: issued'),
    });
    expect(problems[0]?.message).toBe('missing required property "inherits_down"');
  });

  test('a non-boolean inherits_down is one error at the value', () => {
    const file = applicability(member('issued', '    inherits_down: "yes"\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: APPLICABILITY_STATUS,
      ...where(file.text, '"yes"'),
    });
    expect(problems[0]?.message).toBe('must be boolean');
  });

  test('a member with a boolean inherits_down and a rationale is valid', () => {
    const file = applicability(
      member('issued', '    inherits_down: false\n    rationale:\n      en: Because.\n'),
    );
    expect(check(file)).toEqual([]);
  });

  test('an unknown key on a member is reported at the key', () => {
    const file = applicability(member('issued', '    inherits_down: false\n    bogus: 1\n'));
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(file.text, 'bogus'));
    expect(problems[0]?.message).toBe('unknown property "bogus"');
  });
});

describe('the required-file rule for applicability-status', () => {
  // Copies the model to a temp directory and re-validates it; the explicit budget keeps it from
  // timing out when the whole suite runs in parallel on a loaded machine.
  test('a model without the file reports it as missing', () => {
    const root = modelCopy();
    rmSync(join(root, APPLICABILITY_STATUS));
    const problems = checkModel(root);
    expect(problems).toContainEqual(
      expect.objectContaining({
        file: APPLICABILITY_STATUS,
        message: 'required vocabulary file is missing',
      }),
    );
  }, 30_000);
});

const EXPECTED_IDS: Readonly<Record<string, readonly string[]>> = {
  'applicability-status': ['issued', 'recognised', 'verifiable', 'not-applicable'],
  certainty: ['certain', 'likely', 'possible'],
  level: [
    'legal-entity',
    'legal-entity-top-level',
    'enterprise',
    'establishment',
    'natural-person',
    'government-organisation',
    'location',
    'declaring-entity',
  ],
  role: ['taxpayer', 'economic-operator', 'e-invoicing-participant', 'financial-counterparty'],
  'persistence-event': [
    'merger',
    'acquisition-without-merger',
    'split',
    'dissolution',
    'move-within-country',
    'move-to-other-country',
  ],
  'entity-form': ['legal-person', 'sole-proprietorship', 'fiscal-unit'],
  'condition-context': [],
  checksum: ['elfproef', 'iso7064-mod97-10', 'gs1-mod10', 'none'],
  'relation-kind': [
    'derived-from',
    'contains',
    'prerequisite',
    'same-level',
    'different-level',
    'equivalent-in',
    'may-identify-same-party',
    'references',
    'specializes',
  ],
};

describe('the closed lists of SPEC 5.1 and DEC-003', () => {
  test.for(Object.entries(EXPECTED_IDS))('%s has exactly its member ids, in order', ([id, ids]) => {
    expect(idsOf(id)).toEqual(ids);
  });

  test('model/vocab holds exactly the ten vocabulary files (nine closed lists and the country-prefix map)', () => {
    expect(readdirSync(join(REPO_ROOT, 'model', 'vocab')).sort()).toEqual([
      'applicability-status.yaml',
      'certainty.yaml',
      'checksum.yaml',
      'condition-context.yaml',
      'country-prefix.yaml',
      'entity-form.yaml',
      'level.yaml',
      'persistence-event.yaml',
      'relation-kind.yaml',
      'role.yaml',
    ]);
  });

  test('the checksum ids equal the engine CHECKSUM_IDS', () => {
    expect(idsOf('checksum')).toEqual([...CHECKSUM_IDS]);
  });

  test('entity-form carries the Dutch labels of DEC-003', () => {
    expect(realVocab('entity-form').values.map((value) => value.label.nl)).toEqual([
      'rechtspersoon',
      'eenmanszaak',
      'fiscale eenheid',
    ]);
  });

  test('every member has an English definition and none cites a source (DEC-019)', () => {
    for (const id of Object.keys(EXPECTED_IDS)) {
      for (const value of realVocab(id).values) {
        expect(value.definition.en.length).toBeGreaterThan(0);
        expect(value.source).toBeUndefined();
      }
    }
  });

  test('every vocabulary has an English label and there is no availability vocabulary', () => {
    for (const id of Object.keys(EXPECTED_IDS)) {
      expect(realVocab(id).label.en.length).toBeGreaterThan(0);
    }
    expect(readdirSync(join(REPO_ROOT, 'model', 'vocab'))).not.toContain('availability.yaml');
  });

  test('buildRegistry gives each vocab:<id> set equal to its member ids', () => {
    const parsed = realModelFiles().map((file) => ({ parsed: parseModelFile(file).parsed }));
    const registry = buildRegistry(parsed);
    for (const [id, ids] of Object.entries(EXPECTED_IDS)) {
      expect([...(registry.get(`vocab:${id}`) ?? [])].sort()).toEqual([...ids].sort());
    }
    expect(registry.get('vocab:condition-context') ?? new Set()).toEqual(new Set());
  });

  test('the repository validates with no problem', () => {
    expect(checkModel(REPO_ROOT)).toEqual([]);
  });
});

describe('vocabulary fixtures', () => {
  const simple = (id: string, label: string, body: string): ModelFile =>
    fixture(`model/vocab/${id}.yaml`, `id: ${id}\nlabel:\n  en: ${label}\n${body}`);

  test('level with values: [] is a problem at the values key', () => {
    const file = simple('level', 'Level', 'values: []\n');
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: file.path, ...where(file.text, 'values') });
    expect(problems[0]?.message).toBe('a vocabulary needs at least one value');
  });

  test('condition-context with values: [] is valid', () => {
    expect(check(simple('condition-context', 'Condition context', 'values: []\n'))).toEqual([]);
  });

  test('an unknown key on a role member is reported at the key', () => {
    const file = simple(
      'role',
      'Role',
      'values:\n  - id: taxpayer\n    label:\n      en: Taxpayer\n    definition:\n      en: D\n    bogus: 1\n',
    );
    const problems = check(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject(where(file.text, 'bogus'));
    expect(problems[0]?.message).toBe('unknown property "bogus"');
  });
});
