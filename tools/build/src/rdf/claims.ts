import type { Scheme } from '@uio/engine';
import { DataFactory, type Literal, type NamedNode } from 'n3';
import { ADMS, DCT, type Iris } from './iris.ts';

const { namedNode, literal } = DataFactory;

/** A triple that hangs off the Statement node: a predicate IRI and an object term. */
export type Extra = { predicate: string; object: NamedNode | Literal };

/**
 * One sourced claim, before it becomes the Statement triples of DEC-055. `payload` is what the
 * hash reads for the object; `qualifiers` and `condition` are hashed too, `certainty`, `note` and
 * `extra` are not.
 */
export type ClaimInstance = {
  subjectId: string;
  subjectIri: string;
  /** The claim slug, the IRI segment. */
  claim: string;
  /** The IRI that is the value of `def:predicate`. */
  predicate: string;
  object: NamedNode | Literal;
  payload: unknown;
  qualifiers: Record<string, unknown>;
  /** The qualifier triples; they carry the same terms as `qualifiers`. */
  qualifierTriples: Extra[];
  /** Triples outside the hash, such as a position. */
  extra: Extra[];
  condition: unknown;
  certainty: string;
  source: string;
  note?: string;
};

type Header = { value: unknown; source: string; certainty: string };

/** A scheme header field with its claim slug, predicate and the kind of object it carries. */
type HeaderKind = {
  field: keyof Scheme;
  claim: string;
  predicate: (iris: Iris) => string;
  object: (value: string, iris: Iris) => NamedNode | Literal;
  payload: (value: string, iris: Iris) => string;
};

/** A header field whose object is a plain literal and whose predicate is a `def:` term. */
function plainLiteral(field: keyof Scheme, claim: string, term: string): HeaderKind {
  return {
    field,
    claim,
    predicate: (iris) => iris.def(term),
    object: (value) => literal(value),
    payload: (value) => value,
  };
}

const HEADERS: readonly HeaderKind[] = [
  {
    field: 'issuer',
    claim: 'issuer',
    predicate: () => `${ADMS}schemaAgency`,
    object: (value, iris) => namedNode(iris.authority(value)),
    payload: (value, iris) => iris.authority(value),
  },
  {
    field: 'jurisdiction',
    claim: 'jurisdiction',
    predicate: () => `${DCT}spatial`,
    object: (value, iris) => namedNode(iris.jurisdiction(value)),
    payload: (value, iris) => iris.jurisdiction(value),
  },
  plainLiteral('kind', 'kind', 'kind'),
  plainLiteral('abbreviation', 'abbreviation', 'abbreviation'),
  plainLiteral('availability', 'availability', 'availability'),
  plainLiteral('iso6523_icd', 'iso6523-icd', 'iso6523Icd'),
  plainLiteral('peppol_eas', 'peppol-eas', 'peppolEas'),
];

/** The header claims of one scheme, in table order. */
export function schemeClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const claims: ClaimInstance[] = [];
  for (const kind of HEADERS) {
    const header = scheme[kind.field] as Header | undefined;
    if (header === undefined || header.value === null || header.value === undefined) continue;
    const value = String(header.value);
    claims.push({
      subjectId: scheme.id,
      subjectIri: iris.scheme(scheme.id),
      claim: kind.claim,
      predicate: kind.predicate(iris),
      object: kind.object(value, iris),
      payload: kind.payload(value, iris),
      qualifiers: {},
      qualifierTriples: [],
      extra: [],
      condition: null,
      certainty: header.certainty,
      source: header.source,
    });
  }
  return claims;
}
