/**
 * The contract of `dist/model.json` (DEC-054): the one normalised model the engine, the MCP server
 * and the website read. The number changes only with a new DECISIONS.md row and a migration of
 * every consumer. These types mirror tools/validate/schemas/model.schema.json; this module imports
 * nothing, so no schema validator can reach the engine (DEC-028).
 */
export const MODEL_CONTRACT = 1;

/** A short name or a longer text: English always, Dutch where available. */
export type Label = { en: string; nl?: string };
export type Text = { en: string; nl?: string };

/** A header value with its own source and certainty (the DEC-029 long form). */
export type Claim<T> = { value: T; source: string; certainty: string };

/** When a statement applies (SPEC 5.3). */
export type Condition = {
  issuing_country?: string;
  entity_form?: string;
  context?: string;
};

/** The source, certainty and optional condition and note every scheme statement carries. */
export type Statement = {
  certainty: string;
  source: string;
  condition?: Condition;
  note?: string;
};

export type LevelEntry = Statement & { value: string };
export type RoleEntry = Statement & { value: string };
export type ApplicabilityEntry = Statement & { jurisdiction: string; status: readonly string[] };
export type PersistenceEntry = Statement & { event: string; behaviour: string };
export type RelationEntry = Statement & { kind: string; target: string };
export type LegalBasisEntry = Statement & { title: string; eli?: string; url?: string };
export type ValidationSource = Statement & { label: string; url: string };
export type Mandatory = Statement & { text: string };

/** The five trust sub-scores in their workbook ranges, each null when not assessed. */
export type Trust = Statement & {
  legal_basis: number | null;
  registration_quality: number | null;
  verifiability: number | null;
  crosswalks: number | null;
  lifecycle: number | null;
};

export type PatternEntry = Statement & { regex: string };
/** `over` is a transform list that `compileTransform` accepts. */
export type ChecksumEntry = Statement & { algorithm: string; over?: readonly unknown[] };

export type Format = {
  patterns?: readonly PatternEntry[];
  checksum?: readonly ChecksumEntry[];
  examples_valid?: readonly string[];
  examples_invalid?: readonly string[];
};

export type ContextFrom = {
  issuing_country?: Statement & { capture: { regex: string; group: number }; map: string };
};

export type Component = Statement & { prefix: string; scheme: string };

/** `transform` is a transform list that `compileTransform` accepts. */
export type Rule = Statement & {
  id: string;
  input: string;
  output: string;
  transform: readonly unknown[];
  examples?: readonly { in: string; out: string }[];
};

/** One scheme as model.json holds it: every header field present is a long-form claim. */
export type Scheme = {
  id: string;
  label: Label;
  kind: Claim<'identifier' | 'register' | 'composite'>;
  issuer: Claim<string>;
  jurisdiction: Claim<string>;
  abbreviation?: Claim<string>;
  availability?: Claim<string>;
  iso6523_icd?: Claim<string | null>;
  peppol_eas?: Claim<string | null>;
  scope?: Text;
  notes?: Text;
  level?: readonly LevelEntry[];
  roles?: readonly RoleEntry[];
  applicability?: readonly ApplicabilityEntry[];
  persistence?: readonly PersistenceEntry[];
  trust?: Trust;
  relations?: readonly RelationEntry[];
  legal_basis?: readonly LegalBasisEntry[];
  validation_source?: ValidationSource;
  mandatory?: Mandatory;
  format?: Format;
  context_from?: ContextFrom;
  components?: readonly Component[];
  rules?: readonly Rule[];
};

export type Authority = {
  id: string;
  kind: 'class' | 'instance';
  label: Label;
  definition?: Text;
  instance_of?: string;
  jurisdiction?: string;
  source?: string;
  certainty?: string;
  notes?: Text;
};

export type Jurisdiction = {
  id: string;
  label: Label;
  part_of?: readonly { jurisdiction: string; source: string; certainty: string; note?: Text }[];
  /** The entry in the Publications Office country table (DEC-057). */
  authority_table?: { iri: string; source: string; certainty: string; note?: Text };
  notes?: Text;
};

export type Source = {
  id: string;
  title: string;
  type: 'law' | 'standard' | 'register-doc' | 'expert' | 'analysis';
  date: string;
  url?: string;
  eli?: string;
  publisher?: string;
  reference?: string;
  method?: string;
  role?: string;
  organisation?: string;
};

/** A member of a vocabulary; which optional fields appear depends on the vocabulary. */
export type VocabularyMember = {
  id?: string;
  label?: Label;
  definition?: Text;
  source?: string;
  certainty?: string;
  rank?: number;
  inherits_down?: boolean;
  rationale?: Text;
  prefix?: string;
  jurisdiction?: string;
  note?: Text;
};

export type Vocabulary = {
  id: string;
  label: Label;
  values: readonly VocabularyMember[];
};

/** The normalised model: five tables keyed by id. */
export type Model = {
  contract: number;
  model_version: string;
  schemes: Record<string, Scheme>;
  authorities: Record<string, Authority>;
  jurisdictions: Record<string, Jurisdiction>;
  sources: Record<string, Source>;
  vocab: Record<string, Vocabulary>;
};

/**
 * Refuse a model of another contract: throws unless `value` is an object whose `contract` equals
 * MODEL_CONTRACT. It checks nothing else; the build validated the shape against its schema.
 */
export function assertModelContract(value: unknown): asserts value is Model {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`the model must be an object with contract ${MODEL_CONTRACT}`);
  }
  const contract = (value as { contract?: unknown }).contract;
  if (contract !== MODEL_CONTRACT) {
    throw new Error(
      `this engine reads model contract ${MODEL_CONTRACT}, but the model has contract ${String(contract)}`,
    );
  }
}
