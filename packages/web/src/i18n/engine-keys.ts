import type { Conclusion, Host, Text, Warning } from '../engine-host.ts';

/**
 * Every `Conclusion.key` the engine can emit (D-09, D-12): 13 fixed keys and the 21 `describe.<field>`
 * keys that describe.ts builds from the key argument of its `header(` and `take(` calls. The list is
 * written out so that a key added to the engine is a failing test (engine-keys.test.ts) until it has
 * an English and a Dutch entry.
 */
export const CONCLUSION_KEYS = [
  'applicability.stated',
  'applicability.inherited',
  'check.consistent',
  'check.inconsistent',
  'derive.derivation',
  'derive.issued-by',
  'derive.verify-through',
  'derive.look-up-through',
  'recognise.candidate',
  'recognise.checksum-failed',
  'recognise.component-not-accepted',
  'relate.path',
  'describe.issuer-instance',
  'describe.kind',
  'describe.issuer',
  'describe.jurisdiction',
  'describe.abbreviation',
  'describe.availability',
  'describe.iso6523-icd',
  'describe.peppol-eas',
  'describe.legal-basis',
  'describe.validation-source',
  'describe.mandatory',
  'describe.level',
  'describe.role',
  'describe.applicability',
  'describe.persistence',
  'describe.trust',
  'describe.relation',
  'describe.pattern',
  'describe.checksum',
  'describe.component',
  'describe.context-from',
  'describe.rule',
] as const;

/** Every `Warning.code` the engine can emit, as the union over all engine sources (D-12). */
export const WARNING_CODES = [
  'component-not-accepted',
  'context-conflict',
  'duplicate-value',
  'empty-input',
  'input-too-long',
  'invalid-context',
  'invalid-input',
  'no-applicable-checksum',
  'no-chain',
  'output-failed-validation',
  'possible-personal-identifier',
  'same-scheme',
  'too-many-results',
  'too-many-values',
  'unknown-component-prefix',
  'unknown-context-key',
  'unknown-context-value',
  'unknown-country-hint',
  'unknown-jurisdiction',
  'unknown-scheme',
  'value-not-accepted',
] as const;

export type ConclusionKey = (typeof CONCLUSION_KEYS)[number];
export type WarningCode = (typeof WARNING_CODES)[number];

/**
 * What a renderer may read besides the conclusion or warning itself (D-08, D-09): the engine host
 * (the model), the data of the call that produced it, and `label`, which returns the model's text in
 * the dictionary's language, falling back to English and recording that it did (D-10).
 */
export type EngineContext = {
  host: Host;
  data?: unknown;
  label: (text: Text) => string;
};

/** A short field label (row heading) and the sentence renderer of one conclusion key. */
export type ConclusionEntry = {
  label: string;
  render: (conclusion: Conclusion, ctx: EngineContext) => string;
};

export type WarningEntry = {
  label: string;
  render: (warning: Warning, ctx: EngineContext) => string;
};

/** One language's complete set of entries: no key missing, none extra. */
export type EngineDictionary = {
  conclusions: Record<ConclusionKey, ConclusionEntry>;
  warnings: Record<WarningCode, WarningEntry>;
};
