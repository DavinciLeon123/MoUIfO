import type { Scheme } from '@uio/engine';
import { DataFactory, type Literal, type NamedNode } from 'n3';
import { ADMS, DCT, type Iris, RDFS, XSD } from './iris.ts';
import { jsonLiteral } from './literals.ts';

const { namedNode, literal } = DataFactory;

const integer = (value: number): Literal => literal(String(value), namedNode(`${XSD}integer`));

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

/** The fields of a claim that have a default: no qualifier, no extra, no condition. */
type ClaimFields = Pick<
  ClaimInstance,
  'claim' | 'predicate' | 'object' | 'payload' | 'certainty' | 'source'
> &
  Partial<ClaimInstance>;

/** A claim of one subject with the empty defaults filled in. */
function claimOf(subjectId: string, subjectIri: string, fields: ClaimFields): ClaimInstance {
  return {
    subjectId,
    subjectIri,
    qualifiers: {},
    qualifierTriples: [],
    extra: [],
    condition: null,
    ...fields,
  };
}

/** The pattern claims of a scheme: the regex is the object, the authored index an extra. */
function patternClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.format?.patterns ?? []).map((entry, index) =>
    claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'pattern',
      predicate: iris.def('formatPattern'),
      object: literal(entry.regex),
      payload: entry.regex,
      extra: [{ predicate: iris.def('position'), object: integer(index + 1) }],
      ...authored(entry),
    }),
  );
}

/** The fields every authored scheme statement carries. */
type Authored = { certainty: string; source: string; condition?: unknown; note?: string };

/** The common fields of a claim made from an authored entry. */
function authored(
  entry: Authored,
): Pick<ClaimInstance, 'certainty' | 'source' | 'condition' | 'note'> {
  return {
    certainty: entry.certainty,
    source: entry.source,
    condition: entry.condition ?? null,
    note: entry.note,
  };
}

/** Checksum claims: the algorithm member is the object, `over` is a JSON literal outside the hash. */
function checksumClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.format?.checksum ?? []).map((entry, index) => {
    const object = iris.member('checksum', entry.algorithm);
    const extra: Extra[] = [{ predicate: iris.def('position'), object: integer(index + 1) }];
    if (entry.over !== undefined)
      extra.push({ predicate: iris.def('over'), object: jsonLiteral(entry.over) });
    return claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'checksum',
      predicate: iris.def('checksum'),
      object: namedNode(object),
      payload: { algorithm: object, over: entry.over ?? null },
      extra,
      ...authored(entry),
    });
  });
}

/** A claim whose object is a member of a vocabulary. */
function memberClaim(
  scheme: Scheme,
  iris: Iris,
  claim: string,
  term: string,
  vocabulary: string,
  entry: Authored & { value: string },
): ClaimInstance {
  const object = iris.member(vocabulary, entry.value);
  return claimOf(scheme.id, iris.scheme(scheme.id), {
    claim,
    predicate: iris.def(term),
    object: namedNode(object),
    payload: object,
    ...authored(entry),
  });
}

/** Applicability: one claim per status of an entry, the status a hashed qualifier. */
function applicabilityClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.applicability ?? []).flatMap((entry) =>
    entry.status.map((status) => {
      const member = iris.member('applicability-status', status);
      const object = iris.jurisdiction(entry.jurisdiction);
      return claimOf(scheme.id, iris.scheme(scheme.id), {
        claim: 'applicability',
        predicate: iris.def('applicability'),
        object: namedNode(object),
        payload: object,
        qualifiers: { status: member },
        qualifierTriples: [{ predicate: iris.def('status'), object: namedNode(member) }],
        ...authored(entry),
      });
    }),
  );
}

function persistenceClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.persistence ?? []).map((entry) => {
    const member = iris.member('persistence-event', entry.event);
    return claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'persistence',
      predicate: iris.def('persistence'),
      object: literal(entry.behaviour),
      payload: entry.behaviour,
      qualifiers: { event: member },
      qualifierTriples: [{ predicate: iris.def('event'), object: namedNode(member) }],
      ...authored(entry),
    });
  });
}

function relationClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.relations ?? []).map((entry) => {
    const kind = iris.member('relation-kind', entry.kind);
    const object = iris.scheme(entry.target);
    return claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'relation',
      predicate: iris.def('relation'),
      object: namedNode(object),
      payload: object,
      qualifiers: { relationKind: kind },
      qualifierTriples: [{ predicate: iris.def('relationKind'), object: namedNode(kind) }],
      ...authored(entry),
    });
  });
}

/** The legal basis is the ELI, else the url; the title is hashed, the other IRI is a seeAlso. */
function legalBasisClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const claims: ClaimInstance[] = [];
  for (const entry of scheme.legal_basis ?? []) {
    const object = entry.eli ?? entry.url;
    if (object === undefined) continue;
    const extra: Extra[] = [];
    if (entry.eli !== undefined && entry.url !== undefined) {
      extra.push({ predicate: `${RDFS}seeAlso`, object: namedNode(entry.url) });
    }
    claims.push(
      claimOf(scheme.id, iris.scheme(scheme.id), {
        claim: 'legal-basis',
        predicate: iris.def('legalBasis'),
        object: namedNode(object),
        payload: object,
        qualifiers: { title: entry.title },
        qualifierTriples: [{ predicate: `${DCT}title`, object: literal(entry.title) }],
        extra,
        ...authored(entry),
      }),
    );
  }
  return claims;
}

function validationSourceClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const entry = scheme.validation_source;
  if (entry === undefined) return [];
  return [
    claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'validation-source',
      predicate: iris.def('validationSource'),
      object: namedNode(entry.url),
      payload: entry.url,
      qualifiers: { title: entry.label },
      qualifierTriples: [{ predicate: `${DCT}title`, object: literal(entry.label) }],
      ...authored(entry),
    }),
  ];
}

function mandatoryClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const entry = scheme.mandatory;
  if (entry === undefined) return [];
  return [
    claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'mandatory',
      predicate: iris.def('mandatory'),
      object: literal(entry.text),
      payload: entry.text,
      ...authored(entry),
    }),
  ];
}

const TRUST: readonly {
  field: 'legal_basis' | 'registration_quality' | 'verifiability' | 'crosswalks' | 'lifecycle';
  claim: string;
  term: string;
}[] = [
  { field: 'legal_basis', claim: 'trust-legal-basis', term: 'trustLegalBasis' },
  {
    field: 'registration_quality',
    claim: 'trust-registration-quality',
    term: 'trustRegistrationQuality',
  },
  { field: 'verifiability', claim: 'trust-verifiability', term: 'trustVerifiability' },
  { field: 'crosswalks', claim: 'trust-crosswalks', term: 'trustCrosswalks' },
  { field: 'lifecycle', claim: 'trust-lifecycle', term: 'trustLifecycle' },
];

/** One claim per non-null trust sub-score, at the certainty and source of the trust record. */
function trustClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const trust = scheme.trust;
  if (trust === undefined) return [];
  const claims: ClaimInstance[] = [];
  for (const kind of TRUST) {
    const score = trust[kind.field];
    if (score === null || score === undefined) continue;
    claims.push(
      claimOf(scheme.id, iris.scheme(scheme.id), {
        claim: kind.claim,
        predicate: iris.def(kind.term),
        object: integer(score),
        payload: score,
        ...authored(trust),
      }),
    );
  }
  return claims;
}

function componentClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.components ?? []).map((entry) => {
    const object = iris.scheme(entry.scheme);
    return claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'component',
      predicate: iris.def('component'),
      object: namedNode(object),
      payload: object,
      qualifiers: { prefix: entry.prefix },
      qualifierTriples: [{ predicate: iris.def('prefix'), object: literal(entry.prefix) }],
      ...authored(entry),
    });
  });
}

/** The issuing-country capture: the map vocabulary is the object, the capture an extra triple. */
function issuingCountryContextClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  const entry = scheme.context_from?.issuing_country;
  if (entry === undefined) return [];
  const object = iris.vocab(entry.map);
  return [
    claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'issuing-country-context',
      predicate: iris.def('issuingCountryContext'),
      object: namedNode(object),
      payload: { capture: entry.capture, map: object },
      extra: [{ predicate: iris.def('capture'), object: jsonLiteral(entry.capture) }],
      ...authored(entry),
    }),
  ];
}

/** A rule is a Statement that points to its Rule node; its condition is the rule's. */
function ruleClaims(scheme: Scheme, iris: Iris): ClaimInstance[] {
  return (scheme.rules ?? []).map((entry) => {
    const object = iris.rule(entry.id);
    return claimOf(scheme.id, iris.scheme(scheme.id), {
      claim: 'rule',
      predicate: iris.def('rule'),
      object: namedNode(object),
      payload: object,
      ...authored(entry),
    });
  });
}

/** The claims of one scheme, in table order. */
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
  claims.push(
    ...patternClaims(scheme, iris),
    ...checksumClaims(scheme, iris),
    ...(scheme.level ?? []).map((entry) =>
      memberClaim(scheme, iris, 'level', 'level', 'level', entry),
    ),
    ...(scheme.roles ?? []).map((entry) =>
      memberClaim(scheme, iris, 'role', 'role', 'role', entry),
    ),
    ...applicabilityClaims(scheme, iris),
    ...persistenceClaims(scheme, iris),
    ...relationClaims(scheme, iris),
    ...legalBasisClaims(scheme, iris),
    ...validationSourceClaims(scheme, iris),
    ...mandatoryClaims(scheme, iris),
    ...trustClaims(scheme, iris),
    ...componentClaims(scheme, iris),
    ...issuingCountryContextClaims(scheme, iris),
    ...ruleClaims(scheme, iris),
  );
  return claims;
}
