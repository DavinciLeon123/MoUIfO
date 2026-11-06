import type { Conclusion, Warning } from '../engine-host.ts';
import type { EngineContext, EngineDictionary } from './engine-keys.ts';

/*
 * English is the engine's own text: a sentence is shown exactly as the engine wrote it (D-09), except
 * describe.kind and describe.role, which the web words itself (handover test findings, owner
 * 2026-11-06) while the engine source stays unchanged.
 */
type Own<T> = Readonly<Record<string, T>>;

/** A table lookup that never resolves `constructor` or `__proto__`. */
function own<T>(record: Own<T>, id: string): T | undefined {
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/** The scheme's English label followed by its id, as the engine writes it; the id when unknown. */
function schemeName(ctx: EngineContext, id: string): string {
  const scheme = own(ctx.host.model.schemes, id);
  return scheme === undefined ? id : `${ctx.label(scheme.label)} (${id})`;
}

/** The role vocabulary member as a lower-case word; the code when the member is missing. */
function roleWord(ctx: EngineContext, role: string): string {
  const member = own(ctx.host.model.vocab, 'role')?.values.find((each) => each.id === role);
  const word = member?.label === undefined ? role : ctx.label(member.label);
  return word.charAt(0).toLowerCase() + word.slice(1);
}

const KIND_WORD: Readonly<Record<string, string>> = {
  identifier: 'identifier',
  register: 'register',
  composite: 'composite identifier',
};

const kindSentence = (conclusion: Conclusion, ctx: EngineContext): string => {
  const kind = conclusion.params.kind ?? '';
  const word = own(KIND_WORD, kind) ?? kind;
  return `The type of ${schemeName(ctx, conclusion.params.scheme ?? '')} is ${word}.`;
};

const roleSentence = (conclusion: Conclusion, ctx: EngineContext): string => {
  const word = roleWord(ctx, conclusion.params.role ?? '');
  const article = /^[aeiou]/.test(word) ? 'an' : 'a';
  return `${schemeName(ctx, conclusion.params.scheme ?? '')} identifies ${article} ${word}.`;
};

const statement = (conclusion: Conclusion): string => conclusion.statement;
const message = (warning: Warning): string => warning.message;

/**
 * The English dictionary. `label` is the short field label (a row heading); `render` returns the
 * engine's `statement` or `message` unchanged, so English never drifts from the engine, except the
 * two keys the web words itself.
 */
export const ENGINE_EN = {
  conclusions: {
    'applicability.stated': { label: 'Applicability (stated)', render: statement },
    'applicability.inherited': { label: 'Applicability (inherited)', render: statement },
    'check.consistent': { label: 'Consistent', render: statement },
    'check.inconsistent': { label: 'Inconsistent', render: statement },
    'derive.derivation': { label: 'Derivation', render: statement },
    'derive.issued-by': { label: 'Issued by', render: statement },
    'derive.verify-through': { label: 'Verify through', render: statement },
    'derive.look-up-through': { label: 'Look up through', render: statement },
    'recognise.candidate': { label: 'Recognised as', render: statement },
    'recognise.checksum-failed': { label: 'Checksum failed', render: statement },
    'recognise.component-not-accepted': { label: 'Component not accepted', render: statement },
    'relate.path': { label: 'Connection', render: statement },
    'describe.issuer-instance': { label: 'Issuer instance', render: statement },
    'describe.kind': { label: 'Type', render: kindSentence },
    'describe.issuer': { label: 'Issuer', render: statement },
    'describe.jurisdiction': { label: 'Jurisdiction', render: statement },
    'describe.abbreviation': { label: 'Abbreviation', render: statement },
    'describe.availability': { label: 'Availability', render: statement },
    'describe.iso6523-icd': { label: 'ISO 6523 ICD', render: statement },
    'describe.peppol-eas': { label: 'Peppol EAS', render: statement },
    'describe.legal-basis': { label: 'Legal basis', render: statement },
    'describe.validation-source': { label: 'Validation source', render: statement },
    'describe.mandatory': { label: 'Mandatory use', render: statement },
    'describe.level': { label: 'Level', render: statement },
    'describe.role': { label: 'Identifies', render: roleSentence },
    'describe.applicability': { label: 'Applicability', render: statement },
    'describe.persistence': { label: 'Persistence', render: statement },
    'describe.trust': { label: 'Trust scores', render: statement },
    'describe.relation': { label: 'Relation', render: statement },
    'describe.pattern': { label: 'Pattern', render: statement },
    'describe.checksum': { label: 'Checksum', render: statement },
    'describe.component': { label: 'Component', render: statement },
    'describe.context-from': { label: 'Context from the value', render: statement },
    'describe.rule': { label: 'Rule', render: statement },
  },
  warnings: {
    'component-not-accepted': { label: 'Component not accepted', render: message },
    'context-conflict': { label: 'Context conflict', render: message },
    'duplicate-value': { label: 'Duplicate value', render: message },
    'empty-input': { label: 'Empty input', render: message },
    'input-too-long': { label: 'Input too long', render: message },
    'invalid-context': { label: 'Invalid context', render: message },
    'invalid-input': { label: 'Invalid input', render: message },
    'no-applicable-checksum': { label: 'No applicable checksum', render: message },
    'no-chain': { label: 'No chain', render: message },
    'output-failed-validation': { label: 'Output failed validation', render: message },
    'possible-personal-identifier': { label: 'Possible personal identifier', render: message },
    'same-scheme': { label: 'Same scheme', render: message },
    'too-many-results': { label: 'Too many results', render: message },
    'too-many-values': { label: 'Too many values', render: message },
    'unknown-component-prefix': { label: 'Unknown component prefix', render: message },
    'unknown-context-key': { label: 'Unknown context key', render: message },
    'unknown-context-value': { label: 'Unknown context value', render: message },
    'unknown-country-hint': { label: 'Unknown country hint', render: message },
    'unknown-jurisdiction': { label: 'Unknown jurisdiction', render: message },
    'unknown-scheme': { label: 'Unknown scheme', render: message },
    'value-not-accepted': { label: 'Value not accepted', render: message },
  },
} as const satisfies EngineDictionary;
