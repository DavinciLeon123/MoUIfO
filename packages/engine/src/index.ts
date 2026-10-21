export const ENGINE_VERSION = '0.0.0';

export type {
  Applicability,
  ApplicabilityBasis,
  ApplicabilityStatus,
} from './applicability.ts';
export type { ConsistencyFinding } from './check.ts';
export { elfproef } from './checksum/elfproef.ts';
export { gs1Mod10 } from './checksum/gs1-mod10.ts';
export { CHECKSUM_IDS, CHECKSUMS, type ChecksumId } from './checksum/index.ts';
export { iso7064Mod9710 } from './checksum/iso7064-mod97-10.ts';
export { none } from './checksum/none.ts';
export type { Derivation } from './derive.ts';
export type {
  IssuerDescription,
  IssuerInstance,
  RuleLink,
  SchemeDescription,
  SourcedClaim,
} from './describe.ts';
export { createEngine, type Engine } from './engine.ts';
export {
  type ChecksumOutcome,
  checkValue,
  compileFormat,
  type FormatCompileResult,
  type FormatError,
  type FormatResult,
  type FormatSpec,
} from './format.ts';
export type {
  ApplicabilityEntry,
  Authority,
  ChecksumEntry,
  Claim,
  Component,
  Condition,
  ContextFrom,
  Format,
  Jurisdiction,
  Label,
  LegalBasisEntry,
  LevelEntry,
  Mandatory,
  Model,
  PatternEntry,
  PersistenceEntry,
  RelationEntry,
  RoleEntry,
  Rule,
  Scheme,
  Source,
  Statement,
  Text,
  Trust,
  ValidationSource,
  Vocabulary,
  VocabularyMember,
} from './model-types.ts';
export { assertModelContract, MODEL_CONTRACT } from './model-types.ts';
export type { Candidate, ComponentMatch } from './recognise.ts';
export type { RelationHop, RelationPath } from './relate.ts';
export {
  compilePattern,
  compileTransform,
  type PatternResult,
  REGEX_FLAGS,
  TRANSFORM_OPERATIONS,
  type TransformError,
  type TransformOperation,
  type TransformResult,
} from './transform.ts';
export type * from './types.ts';
