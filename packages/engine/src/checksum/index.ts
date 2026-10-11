import { elfproef } from './elfproef.ts';

/** Checksum algorithm ids, in SPEC §6.4 order. Task 2 of plan 02-02 extends this to the full set. */
export const CHECKSUM_IDS = ['elfproef'] as const;

export type ChecksumId = (typeof CHECKSUM_IDS)[number];

export const CHECKSUMS: Readonly<Record<ChecksumId, (value: string) => boolean>> = Object.freeze({
  elfproef,
});
