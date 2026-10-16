export const ENGINE_VERSION = '0.0.0';

export { elfproef } from './checksum/elfproef.ts';
export { gs1Mod10 } from './checksum/gs1-mod10.ts';
export { CHECKSUM_IDS, CHECKSUMS, type ChecksumId } from './checksum/index.ts';
export { iso7064Mod9710 } from './checksum/iso7064-mod97-10.ts';
export { none } from './checksum/none.ts';
export {
  type ChecksumOutcome,
  checkValue,
  compileFormat,
  type FormatCompileResult,
  type FormatError,
  type FormatResult,
  type FormatSpec,
} from './format.ts';
export { MODEL_CONTRACT, type Model, type ModelRecord } from './model-types.ts';
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
