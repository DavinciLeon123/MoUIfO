import { byCodeUnit } from './certainty.ts';
import type { CompiledModel } from './compile.ts';
import { evaluateCondition, type Known } from './conditions.ts';
import {
  checksumStep,
  componentStep,
  conclusion,
  factStep,
  patternStep,
  ruleStep,
} from './explain.ts';
import type { Condition, Scheme } from './model-types.ts';
import type { Certainty, Conclusion, Result, SourceRef, Step, Warning } from './types.ts';

/** A value of a scheme together with the source and certainty the model gives it (ENG-03). */
export type SourcedClaim<T> = {
  value: T;
  certainty: Certainty;
  source: SourceRef;
  condition?: Condition;
  note?: string;
};

/** One authority an issuer resolves to: a per-country instance of an issuer class (DEC-031). */
export type IssuerInstance = {
  id: string;
  label: string;
  jurisdiction?: string;
  certainty: Certainty;
  source: SourceRef;
};

/**
 * The issuer claim (the authority id as its value) plus what the authority file says. A class
 * lists its per-country instances (DEC-031, DEC-045); an issuer that is an instance lists itself.
 */
export type IssuerDescription = SourcedClaim<string> & {
  label: string;
  authority_kind: 'class' | 'instance';
  instances: IssuerInstance[];
};

/** A rule as it touches the described scheme: its id and the two schemes it joins. */
export type RuleLink = { id: string; input: string; output: string };

type Text = { en: string; nl?: string };

export type SchemeDescription = {
  id: string;
  label: Text;
  scope?: Text;
  notes?: Text;
  kind: SourcedClaim<string>;
  issuer: IssuerDescription;
  jurisdiction: SourcedClaim<string>;
  abbreviation?: SourcedClaim<string>;
  availability?: SourcedClaim<string>;
  iso6523_icd?: SourcedClaim<string | null>;
  peppol_eas?: SourcedClaim<string | null>;
  legal_basis: SourcedClaim<{ title: string; eli?: string; url?: string }>[];
  validation_source?: SourcedClaim<{ label: string; url: string }>;
  mandatory?: SourcedClaim<string>;
  level: SourcedClaim<string>[];
  roles: SourcedClaim<string>[];
  applicability: SourcedClaim<{ jurisdiction: string; status: string[] }>[];
  persistence: SourcedClaim<{ behaviour: string; event: string }>[];
  trust?: SourcedClaim<{
    legal_basis: number | null;
    registration_quality: number | null;
    verifiability: number | null;
    crosswalks: number | null;
    lifecycle: number | null;
  }>;
  relations: SourcedClaim<{ target: string; kind: string }>[];
  format: {
    patterns: SourcedClaim<string>[];
    checksum: SourcedClaim<{ algorithm: string; over?: unknown[] }>[];
    examples_valid: string[];
    examples_invalid: string[];
  };
  components: SourcedClaim<{ scheme: string; prefix: string }>[];
  context_from?: SourcedClaim<{ map: string; capture: { regex: string; group: number } }>;
  rules_in: SourcedClaim<RuleLink>[];
  rules_out: SourcedClaim<RuleLink>[];
};

/** describe has no value context, so every condition key is unknown (DEC-069). */
const NOTHING: Known = new Map();

function copyText(text: Text): Text {
  return text.nl === undefined ? { en: text.en } : { en: text.en, nl: text.nl };
}

/** A deep copy of plain JSON data, so a returned description never aliases the model. */
function copyJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyJson);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, copyJson(each)]));
  }
  return value;
}

function claimOf<T>(
  step: Step,
  value: T,
  statement: { condition?: Condition; note?: string },
): SourcedClaim<T> {
  if (step.source === null) throw new Error(`the step ${step.ref} has no source`);
  const claim: SourcedClaim<T> = {
    value,
    certainty: step.certainty,
    source: { ...step.source },
  };
  if (statement.condition !== undefined) claim.condition = { ...statement.condition };
  if (statement.note !== undefined) claim.note = statement.note;
  return claim;
}

/**
 * Describe one scheme (SPEC §6.2, ENG-03). Every sourced claim comes with its resolved source and
 * its certainty, and yields one conclusion: the fact step of the claim plus one assumption step per
 * condition key (there is no value, so a condition is unknown and caps the conclusion at likely).
 * Unknown ids give null data and a warning that never echoes the id.
 */
export function describe(
  compiled: CompiledModel,
  schemeId: unknown,
): Result<SchemeDescription | null> {
  if (typeof schemeId !== 'string') {
    const warning: Warning = { code: 'invalid-input', message: 'The scheme id must be a string.' };
    return { data: null, conclusions: [], warnings: [warning] };
  }
  const compiledScheme = compiled.schemes.get(schemeId);
  if (compiledScheme === undefined) {
    const warning: Warning = {
      code: 'unknown-scheme',
      message: 'No scheme with this id exists in the model.',
    };
    return { data: null, conclusions: [], warnings: [warning] };
  }
  const scheme: Scheme = compiledScheme.scheme;
  const id = scheme.id;
  const conclusions: Conclusion[] = [];

  const nameOf = (other: string): string => {
    const label = compiled.schemes.get(other)?.scheme.label.en;
    return label === undefined ? other : `${label} (${other})`;
  };
  const self = nameOf(id);

  /** One claim: build its conclusion (fact step plus condition steps) and return the claim. */
  function take<T>(
    step: Step,
    statement: { condition?: Condition; note?: string },
    value: T,
    key: string,
    params: Record<string, string>,
    text: string,
  ): SourcedClaim<T> {
    const steps = [step, ...evaluateCondition(statement.condition, NOTHING, step.ref).steps];
    conclusions.push(
      conclusion(compiled, `describe.${key}`, { scheme: id, ...params }, text, steps),
    );
    return claimOf(step, value, statement);
  }

  /** A header field in the DEC-029 long form. */
  function header<T>(
    field: string,
    key: string,
    claim: { value: T; source: string; certainty: string },
    text: (value: T) => string,
    params: (value: T) => Record<string, string>,
  ): SourcedClaim<T> {
    const step = factStep(compiled, `${id}/${field}`, claim);
    return take(step, {}, claim.value, key, params(claim.value), text(claim.value));
  }

  const kind = header(
    'kind',
    'kind',
    scheme.kind,
    (value) => `The kind of ${self} is ${value}.`,
    (value) => ({ kind: value }),
  );

  // The issuer and, for a class, its per-country instances (DEC-031, DEC-045).
  const authority = compiled.authorities.get(scheme.issuer.value);
  const issuerLabel = authority?.label.en ?? scheme.issuer.value;
  const authorityKind = authority?.kind ?? 'class';
  const issuerStep = factStep(compiled, `${id}/issuer`, scheme.issuer);
  const issuerText = `The issuer of ${self} is ${issuerLabel} (${
    authorityKind === 'class' ? 'a class' : 'an instance'
  }).`;
  const issuerClaim = take(
    issuerStep,
    {},
    scheme.issuer.value,
    'issuer',
    { authority: scheme.issuer.value, authority_kind: authorityKind },
    issuerText,
  );
  const instanceIds =
    authority === undefined
      ? []
      : authority.kind === 'class'
        ? (compiled.instancesByClass.get(authority.id) ?? [])
        : [authority.id];
  const instances: IssuerInstance[] = [];
  for (const instanceId of instanceIds) {
    const instance = compiled.authorities.get(instanceId);
    if (
      instance === undefined ||
      instance.certainty === undefined ||
      instance.source === undefined
    ) {
      continue;
    }
    const step = factStep(compiled, `authorities/${instanceId}`, {
      certainty: instance.certainty,
      source: instance.source,
    });
    const claim = claimOf(step, instanceId, {});
    const entry: IssuerInstance = {
      id: instanceId,
      label: instance.label.en,
      certainty: claim.certainty,
      source: claim.source,
    };
    if (instance.jurisdiction !== undefined) entry.jurisdiction = instance.jurisdiction;
    instances.push(entry);
    const where =
      instance.jurisdiction === undefined
        ? 'The issuer instance'
        : `In ${instance.jurisdiction} the issuer`;
    conclusions.push(
      conclusion(
        compiled,
        'describe.issuer-instance',
        {
          scheme: id,
          authority: instanceId,
          class: scheme.issuer.value,
          jurisdiction: instance.jurisdiction ?? '',
        },
        `${where} is ${instance.label.en} (${instanceId}).`,
        [issuerStep, step],
      ),
    );
  }
  const issuer: IssuerDescription = {
    ...issuerClaim,
    label: issuerLabel,
    authority_kind: authorityKind,
    instances,
  };

  const jurisdiction = header(
    'jurisdiction',
    'jurisdiction',
    scheme.jurisdiction,
    (value) => `The jurisdiction of ${self} is ${value}.`,
    (value) => ({ jurisdiction: value }),
  );

  const abbreviation =
    scheme.abbreviation === undefined
      ? undefined
      : header(
          'abbreviation',
          'abbreviation',
          scheme.abbreviation,
          (value) => `${self} is abbreviated ${value}.`,
          (value) => ({ abbreviation: value }),
        );
  const availability =
    scheme.availability === undefined
      ? undefined
      : header(
          'availability',
          'availability',
          scheme.availability,
          (value) => `The availability of ${self} is ${value}.`,
          (value) => ({ availability: value }),
        );
  const iso6523Icd =
    scheme.iso6523_icd === undefined
      ? undefined
      : header(
          'iso6523_icd',
          'iso6523-icd',
          scheme.iso6523_icd,
          (value) =>
            value === null
              ? `${self} has no ISO 6523 ICD code.`
              : `The ISO 6523 ICD code of ${self} is ${value}.`,
          (value) => ({ icd: value ?? '' }),
        );
  const peppolEas =
    scheme.peppol_eas === undefined
      ? undefined
      : header(
          'peppol_eas',
          'peppol-eas',
          scheme.peppol_eas,
          (value) =>
            value === null
              ? `${self} has no Peppol EAS code.`
              : `The Peppol EAS code of ${self} is ${value}.`,
          (value) => ({ eas: value ?? '' }),
        );

  const legalBasis = (scheme.legal_basis ?? []).map((entry, index) => {
    const value: { title: string; eli?: string; url?: string } = { title: entry.title };
    if (entry.eli !== undefined) value.eli = entry.eli;
    if (entry.url !== undefined) value.url = entry.url;
    return take(
      factStep(compiled, `${id}/legal_basis/${index}`, entry),
      entry,
      value,
      'legal-basis',
      { index: String(index) },
      `The legal basis of ${self} includes ${entry.title}.`,
    );
  });

  const validationSource =
    scheme.validation_source === undefined
      ? undefined
      : take(
          factStep(compiled, `${id}/validation_source`, scheme.validation_source),
          scheme.validation_source,
          { label: scheme.validation_source.label, url: scheme.validation_source.url },
          'validation-source',
          {},
          `${self} can be validated through ${scheme.validation_source.label}.`,
        );

  const mandatory =
    scheme.mandatory === undefined
      ? undefined
      : take(
          factStep(compiled, `${id}/mandatory`, scheme.mandatory),
          scheme.mandatory,
          scheme.mandatory.text,
          'mandatory',
          {},
          `Mandatory use of ${self}: ${scheme.mandatory.text}.`,
        );

  const level = (scheme.level ?? []).map((entry, index) =>
    take(
      factStep(compiled, `${id}/level/${index}`, entry),
      entry,
      entry.value,
      'level',
      { index: String(index), level: entry.value },
      `The level of ${self} is ${entry.value}.`,
    ),
  );
  const roles = (scheme.roles ?? []).map((entry, index) =>
    take(
      factStep(compiled, `${id}/roles/${index}`, entry),
      entry,
      entry.value,
      'role',
      { index: String(index), role: entry.value },
      `The role of ${self} is ${entry.value}.`,
    ),
  );
  const applicability = (scheme.applicability ?? []).map((entry, index) =>
    take(
      factStep(compiled, `${id}/applicability/${index}`, entry),
      entry,
      { jurisdiction: entry.jurisdiction, status: [...entry.status] },
      'applicability',
      { index: String(index), jurisdiction: entry.jurisdiction },
      `${self} is ${entry.status.join(', ')} in ${entry.jurisdiction}.`,
    ),
  );
  const persistence = (scheme.persistence ?? []).map((entry, index) =>
    take(
      factStep(compiled, `${id}/persistence/${index}`, entry),
      entry,
      { behaviour: entry.behaviour, event: entry.event },
      'persistence',
      { index: String(index), event: entry.event },
      `On the event ${entry.event}, ${self}: ${entry.behaviour}.`,
    ),
  );

  let trust: SchemeDescription['trust'];
  if (scheme.trust !== undefined) {
    const t = scheme.trust;
    const score = (n: number | null): string => (n === null ? 'not assessed' : String(n));
    trust = take(
      factStep(compiled, `${id}/trust`, t),
      t,
      {
        legal_basis: t.legal_basis,
        registration_quality: t.registration_quality,
        verifiability: t.verifiability,
        crosswalks: t.crosswalks,
        lifecycle: t.lifecycle,
      },
      'trust',
      {},
      `The trust scores of ${self} are legal basis ${score(t.legal_basis)}, registration quality ${score(
        t.registration_quality,
      )}, verifiability ${score(t.verifiability)}, crosswalks ${score(t.crosswalks)} and lifecycle ${score(
        t.lifecycle,
      )}.`,
    );
  }

  const relations = (scheme.relations ?? []).map((entry, index) =>
    take(
      factStep(compiled, `${id}/relations/${index}`, entry),
      entry,
      { target: entry.target, kind: entry.kind },
      'relation',
      { index: String(index), target: entry.target, kind: entry.kind },
      `${self} has the relation ${entry.kind} with ${nameOf(entry.target)}.`,
    ),
  );

  const patterns = (scheme.format?.patterns ?? []).map((entry, index) =>
    take(
      patternStep(compiled, id, index, entry),
      entry,
      entry.regex,
      'pattern',
      { index: String(index) },
      `${self} accepts values that match the pattern ${entry.regex} (pattern ${index}).`,
    ),
  );
  const checksum = (scheme.format?.checksum ?? []).map((entry, index) => {
    const value: { algorithm: string; over?: unknown[] } = { algorithm: entry.algorithm };
    if (entry.over !== undefined) value.over = copyJson(entry.over) as unknown[];
    return take(
      checksumStep(compiled, id, index, entry),
      entry,
      value,
      'checksum',
      { index: String(index), algorithm: entry.algorithm },
      `${self} is checked with the ${entry.algorithm} checksum (entry ${index}).`,
    );
  });

  const components = (scheme.components ?? []).map((entry) =>
    take(
      componentStep(compiled, id, entry),
      entry,
      { scheme: entry.scheme, prefix: entry.prefix },
      'component',
      { component: entry.scheme, prefix: entry.prefix },
      `${self} has the component ${nameOf(entry.scheme)} under the prefix ${entry.prefix}.`,
    ),
  );

  let contextFrom: SchemeDescription['context_from'];
  const contextStatement = scheme.context_from?.issuing_country;
  if (contextStatement !== undefined) {
    contextFrom = take(
      factStep(compiled, `${id}/context_from/issuing_country`, contextStatement),
      contextStatement,
      {
        map: contextStatement.map,
        capture: {
          regex: contextStatement.capture.regex,
          group: contextStatement.capture.group,
        },
      },
      'context-from',
      { map: contextStatement.map },
      `The issuing country of ${self} is read from its value through the ${contextStatement.map} vocabulary.`,
    );
  }

  // The rules that produce this scheme (output) and those that start from it (input).
  const ruleClaim = (
    ruleId: string,
    direction: 'in' | 'out',
  ): SourcedClaim<RuleLink> | undefined => {
    const compiledRule = compiled.rules.get(ruleId);
    if (compiledRule === undefined) return undefined;
    const rule = compiledRule.rule;
    return take(
      ruleStep(compiled, rule),
      rule,
      { id: rule.id, input: rule.input, output: rule.output },
      'rule',
      { rule: rule.id, input: rule.input, output: rule.output, direction },
      direction === 'in'
        ? `${nameOf(rule.input)} becomes ${self} through the rule ${rule.id}.`
        : `${self} becomes ${nameOf(rule.output)} through the rule ${rule.id}.`,
    );
  };
  const rulesIn: SourcedClaim<RuleLink>[] = [];
  for (const ruleId of [...compiled.rules.keys()].sort(byCodeUnit)) {
    if (compiled.rules.get(ruleId)?.rule.output !== id) continue;
    const claim = ruleClaim(ruleId, 'in');
    if (claim !== undefined) rulesIn.push(claim);
  }
  const rulesOut: SourcedClaim<RuleLink>[] = [];
  for (const ruleId of compiled.rulesByInput.get(id) ?? []) {
    const claim = ruleClaim(ruleId, 'out');
    if (claim !== undefined) rulesOut.push(claim);
  }

  const data: SchemeDescription = {
    id,
    label: copyText(scheme.label),
    kind,
    issuer,
    jurisdiction,
    legal_basis: legalBasis,
    level,
    roles,
    applicability,
    persistence,
    relations,
    format: {
      patterns,
      checksum,
      examples_valid: [...(scheme.format?.examples_valid ?? [])],
      examples_invalid: [...(scheme.format?.examples_invalid ?? [])],
    },
    components,
    rules_in: rulesIn,
    rules_out: rulesOut,
  };
  if (scheme.scope !== undefined) data.scope = copyText(scheme.scope);
  if (scheme.notes !== undefined) data.notes = copyText(scheme.notes);
  if (abbreviation !== undefined) data.abbreviation = abbreviation;
  if (availability !== undefined) data.availability = availability;
  if (iso6523Icd !== undefined) data.iso6523_icd = iso6523Icd;
  if (peppolEas !== undefined) data.peppol_eas = peppolEas;
  if (validationSource !== undefined) data.validation_source = validationSource;
  if (mandatory !== undefined) data.mandatory = mandatory;
  if (trust !== undefined) data.trust = trust;
  if (contextFrom !== undefined) data.context_from = contextFrom;
  return { data, conclusions, warnings: [] };
}
