import {
  type Authority,
  type Jurisdiction,
  MODEL_CONTRACT,
  type Model,
  type Scheme,
  type Source,
  type Vocabulary,
  type VocabularyMember,
} from '../model-types.ts';

/**
 * Test helpers (never exported from the package): small synthetic models for scenarios the real
 * model cannot show, such as a condition that is false or a certainty vocabulary in another order.
 * Fixture ids are two-letter uppercase jurisdictions and lowercase scheme ids; no fixture value is
 * a personal number.
 */

const SOURCE = 'fx-law';

export function fixtureVocabulary(id: string, values: readonly VocabularyMember[]): Vocabulary {
  return { id, label: { en: id }, values };
}

function named(ids: readonly string[]): VocabularyMember[] {
  return ids.map((id) => ({ id, label: { en: id } }));
}

function vocabularies(): Record<string, Vocabulary> {
  const ranked = (id: string, rank: number): VocabularyMember => ({
    id,
    label: { en: id },
    rank,
  });
  const prefix = (code: string): VocabularyMember => ({
    prefix: code,
    jurisdiction: code,
    source: SOURCE,
    certainty: 'certain',
  });
  const list: Vocabulary[] = [
    fixtureVocabulary('certainty', [
      ranked('certain', 3),
      ranked('likely', 2),
      ranked('possible', 1),
    ]),
    fixtureVocabulary('applicability-status', [
      { id: 'issued', label: { en: 'Issued' }, inherits_down: false },
      { id: 'recognised', label: { en: 'Recognised' }, inherits_down: true },
      { id: 'verifiable', label: { en: 'Verifiable' }, inherits_down: true },
      { id: 'not-applicable', label: { en: 'Not applicable' }, inherits_down: false },
    ]),
    fixtureVocabulary('country-prefix', [prefix('AA'), prefix('BB'), prefix('CC')]),
    fixtureVocabulary('entity-form', named(['legal-person', 'sole-proprietorship', 'fiscal-unit'])),
    fixtureVocabulary('condition-context', []),
    fixtureVocabulary(
      'relation-kind',
      named([
        'derived-from',
        'contains',
        'prerequisite',
        'same-level',
        'different-level',
        'equivalent-in',
        'may-identify-same-party',
        'references',
        'specializes',
      ]),
    ),
    fixtureVocabulary('level', named(['legal-entity', 'enterprise', 'natural-person'])),
    fixtureVocabulary('role', named(['taxpayer', 'economic-operator'])),
    fixtureVocabulary('persistence-event', named(['merger', 'dissolution'])),
    fixtureVocabulary('checksum', named(['elfproef', 'iso7064-mod97-10', 'gs1-mod10', 'none'])),
  ];
  return Object.fromEntries(list.map((vocabulary) => [vocabulary.id, vocabulary]));
}

function jurisdiction(id: string, parents: readonly string[]): Jurisdiction {
  return {
    id,
    label: { en: id },
    part_of: parents.map((parent) => ({
      jurisdiction: parent,
      source: SOURCE,
      certainty: 'certain',
    })),
  };
}

function sources(): Record<string, Source> {
  return {
    'fx-analysis': {
      id: 'fx-analysis',
      title: 'Fixture analysis',
      type: 'analysis',
      date: '2026-01-01',
    },
    [SOURCE]: { id: SOURCE, title: 'Fixture law', type: 'law', date: '2026-01-01' },
  };
}

export type FixtureParts = {
  schemes?: readonly Scheme[];
  /** Whole vocabularies that replace the fixture's own, keyed by vocabulary id. */
  vocab?: Record<string, Vocabulary>;
  authorities?: Record<string, Authority>;
};

/** A complete, valid-by-type `Model`: AA part_of BB, BB part_of CC, DD part_of BB and CC. */
export function fixtureModel(parts: FixtureParts = {}): Model {
  const authority: Authority = {
    id: 'fx-authority',
    kind: 'class',
    label: { en: 'Fixture authority' },
  };
  return {
    contract: MODEL_CONTRACT,
    model_version: '0.0.0',
    schemes: Object.fromEntries((parts.schemes ?? []).map((scheme) => [scheme.id, scheme])),
    authorities: parts.authorities ?? { 'fx-authority': authority },
    jurisdictions: Object.fromEntries(
      [
        jurisdiction('AA', ['BB']),
        jurisdiction('BB', ['CC']),
        jurisdiction('CC', []),
        jurisdiction('DD', ['BB', 'CC']),
      ].map((each) => [each.id, each]),
    ),
    sources: sources(),
    vocab: { ...vocabularies(), ...parts.vocab },
  };
}

/** A scheme with the long-form header claims; `overrides` replace any field. */
export function fixtureScheme(id: string, overrides: Partial<Scheme> = {}): Scheme {
  const claim = <T>(value: T) => ({ value, source: SOURCE, certainty: 'certain' });
  return {
    id,
    label: { en: `Fixture ${id}` },
    kind: claim('identifier' as const),
    issuer: claim('fx-authority'),
    jurisdiction: claim('AA'),
    ...overrides,
  };
}
