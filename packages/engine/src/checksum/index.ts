import { elfproef } from './elfproef.ts';
import { gs1Mod10 } from './gs1-mod10.ts';
import { iso7064Mod9710 } from './iso7064-mod97-10.ts';
import { none } from './none.ts';

/**
 * Checksum algorithm ids in SPEC §6.4 order. They equal the checksum vocabulary ids and are named
 * in model data, so renaming one touches the vocabulary, the schemes and the engine.
 */
export const CHECKSUM_IDS = ['elfproef', 'iso7064-mod97-10', 'gs1-mod10', 'none'] as const;

export type ChecksumId = (typeof CHECKSUM_IDS)[number];

export const CHECKSUMS: Readonly<Record<ChecksumId, (value: string) => boolean>> = Object.freeze({
  elfproef,
  'iso7064-mod97-10': iso7064Mod9710,
  'gs1-mod10': gs1Mod10,
  none,
});
