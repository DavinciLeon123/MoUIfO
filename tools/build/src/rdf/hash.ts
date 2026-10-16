import { createHash } from 'node:crypto';
import type { Iris } from './iris.ts';

/**
 * Canonical JSON (DEC-055): object keys sorted by UTF-16 code unit, no whitespace, arrays in
 * order, `undefined` written as null; strings and numbers as `JSON.stringify` writes them.
 */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The first 8 lowercase hexadecimal characters of SHA-256 over the UTF-8 bytes of `text`. */
export function hash8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8);
}

/** The inputs of one claim that decide its Statement IRI (DEC-055). */
export type MintInput = {
  /** The id of the subject: a scheme, authority, jurisdiction or vocabulary id. */
  subjectId: string;
  /** The claim slug, the kebab-case name of the claim. */
  claim: string;
  subjectIri: string;
  /** The IRI that is the value of `def:predicate`. */
  predicate: string;
  /** An IRI string, a literal value or a compound payload. */
  object: unknown;
  qualifiers: Record<string, unknown>;
  /** The authored condition object, or null. */
  condition: unknown;
  sourceId: string;
};

export type MinterOptions = { hash?: (text: string) => string };

/** The canonical text of a claim: certainty, note and position are not part of it. */
export function canonicalText(input: MintInput): string {
  return canon({
    condition: input.condition,
    object: input.object,
    predicate: input.predicate,
    qualifiers: input.qualifiers,
    source: input.sourceId,
    subject: input.subjectIri,
  });
}

/**
 * Gives every claim its Statement IRI and remembers the canonical text behind each IRI, so a
 * collision (two texts, one IRI) and a duplicate claim (one text twice) are reported.
 */
export function createMinter(iris: Iris, options: MinterOptions = {}) {
  const hash = options.hash ?? hash8;
  const seen = new Map<string, string>();
  const found: string[] = [];
  return {
    mint(input: MintInput): string {
      const text = canonicalText(input);
      const iri = iris.statement(input.subjectId, input.claim, hash(text));
      const earlier = seen.get(iri);
      if (earlier === undefined) seen.set(iri, text);
      else if (earlier === text) found.push(`duplicate claim at ${iri}: ${text}`);
      else found.push(`statement hash collision at ${iri}: ${earlier} versus ${text}`);
      return iri;
    },
    problems(): string[] {
      return [...found];
    },
  };
}

export type Minter = ReturnType<typeof createMinter>;
