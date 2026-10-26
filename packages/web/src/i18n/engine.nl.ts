import type {
  Conclusion,
  ConsistencyFinding,
  RelationHop,
  RelationPath,
  Rule,
  Warning,
} from '../engine-host.ts';
import type { EngineContext, EngineDictionary } from './engine-keys.ts';

/*
 * The Dutch dictionary (D-09). Every sentence is built only from the conclusion's `params`, the data
 * of the call that produced it and the model, through the context's `label`, which prefers the
 * model's Dutch and records when it had to use English (D-10). No renderer adds a fact about an
 * identifier that those three do not carry (D-08), and none translates model text by machine.
 * A vocabulary member without Dutch is shown with its English label and marks the sentence `en`;
 * a code the model has no label for (an availability value) is shown as the code, the way the
 * engine's English shows it. Wording is for the owner to confirm at the end-of-phase check.
 */

type Own<T> = Readonly<Record<string, T>>;

/** A table lookup that never resolves `constructor` or `__proto__`. */
function own<T>(record: Own<T>, id: string): T | undefined {
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/** A conclusion parameter; an empty string when the engine did not give it. */
const param = (conclusion: Conclusion, name: string): string => conclusion.params[name] ?? '';

/** The scheme's label (Dutch when the model has it) followed by its id, as the engine writes it. */
function schemeName(ctx: EngineContext, id: string): string {
  const scheme = own(ctx.host.model.schemes, id);
  return scheme === undefined ? id : `${ctx.label(scheme.label)} (${id})`;
}

function jurisdictionName(ctx: EngineContext, id: string): string {
  const jurisdiction = own(ctx.host.model.jurisdictions, id);
  return jurisdiction === undefined ? id : ctx.label(jurisdiction.label);
}

function authorityName(ctx: EngineContext, id: string): string {
  const authority = own(ctx.host.model.authorities, id);
  return authority === undefined ? id : `${ctx.label(authority.label)} (${id})`;
}

/**
 * A vocabulary member as a word: its label through `label` (Dutch when the model has it, else its
 * English label, which marks the sentence `en`), or the code itself when the vocabulary has no such
 * member.
 */
function vocabWord(ctx: EngineContext, vocabulary: string, id: string): string {
  const member = own(ctx.host.model.vocab, vocabulary)?.values.find((each) => each.id === id);
  return member?.label === undefined ? id : ctx.label(member.label);
}

/** The rule with this id, from whichever scheme declares it. */
function ruleOf(ctx: EngineContext, id: string): Rule | undefined {
  for (const scheme of Object.values(ctx.host.model.schemes)) {
    const rule = scheme.rules?.find((each) => each.id === id);
    if (rule !== undefined) return rule;
  }
  return undefined;
}

/** The comma-joined rule ids of a conclusion parameter, as "a, daarna b". */
const rulesText = (joined: string): string =>
  joined
    .split(',')
    .filter((each) => each !== '')
    .join(', daarna ');

const scoreText = (score: number | null): string =>
  score === null ? 'niet beoordeeld' : String(score);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The finding for two 0-based positions, from check's data (the list or one finding). */
function findingOf(data: unknown, a: number, b: number): ConsistencyFinding | null {
  const list: unknown[] = Array.isArray(data) ? data : [data];
  for (const each of list) {
    if (isRecord(each) && each.a === a && each.b === b && typeof each.direction !== 'undefined') {
      return each as ConsistencyFinding;
    }
  }
  return null;
}

function isPath(data: unknown): data is RelationPath {
  return isRecord(data) && Array.isArray(data.hops);
}

/** One hop in the direction the model stores its edge, with the way the chain read it. */
function hopText(ctx: EngineContext, hop: RelationHop): string {
  const inverse = hop.step.inverse === true;
  const from = inverse ? hop.to : hop.from;
  const to = inverse ? hop.from : hop.to;
  const how = inverse ? ', omgekeerd gelezen' : '';
  if (hop.step.edge === 'rule') {
    const rule = ruleOf(ctx, hop.step.ref);
    return `${rule?.input ?? from} → ${rule?.output ?? to} (regel ${hop.step.ref}${how})`;
  }
  if (hop.step.edge === 'component') {
    const prefix = hop.step.ref.split('/components/')[1] ?? '';
    const where = prefix === '' ? '' : `, voorvoegsel ${prefix}`;
    return `${from} → ${to} (onderdeel${where}${how})`;
  }
  const index = Number(hop.step.ref.split('/relations/')[1]);
  const kind = own(ctx.host.model.schemes, from)?.relations?.[index]?.kind;
  const named = kind === undefined ? '' : `: ${vocabWord(ctx, 'relation-kind', kind)}`;
  return `${from} → ${to} (relatie${named}${how})`;
}

/** The position a warning ref names (`values/<index>`, 0-based) as "waarde N", else null. */
function valueRef(warning: Warning): string | null {
  const match = /^values\/(\d+)$/.exec(warning.ref ?? '');
  return match?.[1] === undefined ? null : `waarde ${Number(match[1]) + 1}`;
}

const sentenceStart = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A sentence about "the value" or, when the warning's ref names a position, about that value
 * ("waarde 3"). The two texts start in lower case; the result starts with a capital.
 */
function aboutValue(warning: Warning, whole: string, withRef: (value: string) => string): string {
  const named = valueRef(warning);
  return sentenceStart(named === null ? whole : withRef(named));
}

export const ENGINE_NL = {
  conclusions: {
    'applicability.stated': {
      label: 'Toepasselijkheid (vermeld)',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} is ${vocabWord(ctx, 'applicability-status', param(c, 'status'))} in ${jurisdictionName(ctx, param(c, 'jurisdiction'))} (vermeld).`,
    },
    'applicability.inherited': {
      label: 'Toepasselijkheid (overgenomen)',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} is ${vocabWord(ctx, 'applicability-status', param(c, 'status'))} in ${jurisdictionName(ctx, param(c, 'jurisdiction'))}, overgenomen van ${jurisdictionName(ctx, param(c, 'from'))} (${param(c, 'from')}).`,
    },
    'check.consistent': {
      label: 'Consistent',
      render: (c, ctx) => {
        const a = Number(param(c, 'a'));
        const b = Number(param(c, 'b'));
        const pair = `Waarden ${a + 1} en ${b + 1}`;
        const from = schemeName(ctx, param(c, 'from'));
        const to = schemeName(ctx, param(c, 'to'));
        const finding = findingOf(ctx.data, a, b);
        if (finding === null || finding.direction === null) {
          return `${pair} zijn consistent: de regels ${rulesText(param(c, 'rules'))} verbinden ${from} en ${to}.`;
        }
        const source = finding.direction === 'a-to-b' ? a : b;
        const target = finding.direction === 'a-to-b' ? b : a;
        return `${pair} zijn consistent: waarde ${source + 1} als ${from} geeft waarde ${target + 1} als ${to} via ${rulesText(param(c, 'rules'))}.`;
      },
    },
    'check.inconsistent': {
      label: 'Inconsistent',
      render: (c, ctx) => {
        const a = Number(param(c, 'a'));
        const b = Number(param(c, 'b'));
        const pair = `Waarden ${a + 1} en ${b + 1}`;
        const from = schemeName(ctx, param(c, 'from'));
        const to = schemeName(ctx, param(c, 'to'));
        const finding = findingOf(ctx.data, a, b);
        if (finding === null || finding.direction === null) {
          return `${pair} zijn inconsistent: een afleiding van ${from} naar ${to} geeft een waarde die afwijkt van de andere waarde.`;
        }
        const source = finding.direction === 'a-to-b' ? a : b;
        const target = finding.direction === 'a-to-b' ? b : a;
        return `${pair} zijn inconsistent: waarde ${source + 1} als ${from} geeft een ${to} die afwijkt van waarde ${target + 1}.`;
      },
    },
    'derive.derivation': {
      label: 'Afleiding',
      render: (c, ctx) =>
        `Als ${schemeName(ctx, param(c, 'from'))} leidt de waarde een ${schemeName(ctx, param(c, 'scheme'))} af via ${rulesText(param(c, 'rules'))}.`,
    },
    'derive.issued-by': {
      label: 'Uitgegeven door',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} wordt uitgegeven door ${authorityName(ctx, param(c, 'authority'))}.`,
    },
    'derive.verify-through': {
      label: 'Controleren via',
      render: (c, ctx) => {
        const register = own(ctx.host.model.schemes, param(c, 'scheme'))?.validation_source?.label;
        return `Een waarde als ${schemeName(ctx, param(c, 'scheme'))} kan worden gecontroleerd via ${register ?? param(c, 'source')}.`;
      },
    },
    'derive.look-up-through': {
      label: 'Opzoeken via',
      render: (c, ctx) => {
        const register = own(ctx.host.model.schemes, param(c, 'scheme'))?.validation_source?.label;
        return `De afgeleide waarde als ${schemeName(ctx, param(c, 'scheme'))} kan worden opgezocht via ${register ?? param(c, 'source')}; dit is een verwijzing, geen opzoeking.`;
      },
    },
    'recognise.candidate': {
      label: 'Herkend als',
      render: (c, ctx) => `De waarde heeft het formaat van ${schemeName(ctx, param(c, 'scheme'))}.`,
    },
    'recognise.checksum-failed': {
      label: 'Controlesom onjuist',
      render: (c, ctx) =>
        `De waarde heeft het patroon van ${schemeName(ctx, param(c, 'scheme'))}, maar voldoet niet aan de controlesom.`,
    },
    'recognise.component-not-accepted': {
      label: 'Onderdeel niet geaccepteerd',
      render: (c, ctx) =>
        `De waarde heeft het formaat van ${schemeName(ctx, param(c, 'scheme'))}, maar de waarde van het onderdeel wordt niet geaccepteerd door ${schemeName(ctx, param(c, 'component'))}.`,
    },
    'relate.path': {
      label: 'Verbinding',
      render: (c, ctx) => {
        const count = Number(param(c, 'steps'));
        const steps = `${count} ${count === 1 ? 'stap' : 'stappen'}`;
        const head = `${schemeName(ctx, param(c, 'a'))} en ${schemeName(ctx, param(c, 'b'))} zijn verbonden in ${steps}`;
        if (!isPath(ctx.data)) return `${head}.`;
        return `${head}: ${ctx.data.hops.map((hop) => hopText(ctx, hop)).join('; ')}.`;
      },
    },
    'describe.issuer-instance': {
      label: 'Uitgevende instantie',
      render: (c, ctx) => {
        const authority = authorityName(ctx, param(c, 'authority'));
        const where = param(c, 'jurisdiction');
        return where === ''
          ? `De uitgevende instantie is ${authority}.`
          : `In ${jurisdictionName(ctx, where)} is de uitgever ${authority}.`;
      },
    },
    'describe.kind': {
      label: 'Soort',
      render: (c, ctx) => {
        const kind = param(c, 'kind');
        const word =
          kind === 'identifier'
            ? 'identificatienummer'
            : kind === 'register'
              ? 'register'
              : kind === 'composite'
                ? 'samengesteld identificatienummer'
                : kind;
        return `Het soort van ${schemeName(ctx, param(c, 'scheme'))} is ${word}.`;
      },
    },
    'describe.issuer': {
      label: 'Uitgever',
      render: (c, ctx) =>
        `De uitgever van ${schemeName(ctx, param(c, 'scheme'))} is ${authorityName(ctx, param(c, 'authority'))} (${param(c, 'authority_kind') === 'class' ? 'een klasse' : 'een instantie'}).`,
    },
    'describe.jurisdiction': {
      label: 'Rechtsgebied',
      render: (c, ctx) =>
        `Het rechtsgebied van ${schemeName(ctx, param(c, 'scheme'))} is ${jurisdictionName(ctx, param(c, 'jurisdiction'))} (${param(c, 'jurisdiction')}).`,
    },
    'describe.abbreviation': {
      label: 'Afkorting',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} wordt afgekort als ${param(c, 'abbreviation')}.`,
    },
    'describe.availability': {
      label: 'Beschikbaarheid',
      render: (c, ctx) =>
        `De beschikbaarheid van ${schemeName(ctx, param(c, 'scheme'))} is ${param(c, 'availability')}.`,
    },
    'describe.iso6523-icd': {
      label: 'ISO 6523 ICD',
      render: (c, ctx) =>
        param(c, 'icd') === ''
          ? `${schemeName(ctx, param(c, 'scheme'))} heeft geen ISO 6523 ICD-code.`
          : `De ISO 6523 ICD-code van ${schemeName(ctx, param(c, 'scheme'))} is ${param(c, 'icd')}.`,
    },
    'describe.peppol-eas': {
      label: 'Peppol EAS',
      render: (c, ctx) =>
        param(c, 'eas') === ''
          ? `${schemeName(ctx, param(c, 'scheme'))} heeft geen Peppol EAS-code.`
          : `De Peppol EAS-code van ${schemeName(ctx, param(c, 'scheme'))} is ${param(c, 'eas')}.`,
    },
    'describe.legal-basis': {
      label: 'Wettelijke grondslag',
      render: (c, ctx) => {
        const title = own(ctx.host.model.schemes, param(c, 'scheme'))?.legal_basis?.[
          Number(param(c, 'index'))
        ]?.title;
        const name = schemeName(ctx, param(c, 'scheme'));
        return title === undefined
          ? `Er is een wettelijke grondslag voor ${name}.`
          : `De wettelijke grondslag van ${name} omvat ${ctx.label({ en: title })}.`;
      },
    },
    'describe.validation-source': {
      label: 'Validatiebron',
      render: (c, ctx) => {
        const register = own(ctx.host.model.schemes, param(c, 'scheme'))?.validation_source?.label;
        const name = schemeName(ctx, param(c, 'scheme'));
        return register === undefined
          ? `${name} heeft een validatiebron.`
          : `${name} kan worden gevalideerd via ${register}.`;
      },
    },
    'describe.mandatory': {
      label: 'Verplicht gebruik',
      render: (c, ctx) => {
        const text = own(ctx.host.model.schemes, param(c, 'scheme'))?.mandatory?.text;
        const name = schemeName(ctx, param(c, 'scheme'));
        return text === undefined
          ? `Voor ${name} geldt een verplicht gebruik.`
          : `Verplicht gebruik van ${name}: ${ctx.label({ en: text })}.`;
      },
    },
    'describe.level': {
      label: 'Niveau',
      render: (c, ctx) =>
        `Het niveau van ${schemeName(ctx, param(c, 'scheme'))} is ${vocabWord(ctx, 'level', param(c, 'level'))}.`,
    },
    'describe.role': {
      label: 'Rol',
      render: (c, ctx) =>
        `De rol van ${schemeName(ctx, param(c, 'scheme'))} is ${vocabWord(ctx, 'role', param(c, 'role'))}.`,
    },
    'describe.applicability': {
      label: 'Toepasselijkheid',
      render: (c, ctx) => {
        const entry = own(ctx.host.model.schemes, param(c, 'scheme'))?.applicability?.[
          Number(param(c, 'index'))
        ];
        const name = schemeName(ctx, param(c, 'scheme'));
        const where = jurisdictionName(ctx, param(c, 'jurisdiction'));
        if (entry === undefined) return `${name} heeft een toepasselijkheid in ${where}.`;
        const statuses = entry.status
          .map((status) => vocabWord(ctx, 'applicability-status', status))
          .join(', ');
        return `${name} is ${statuses} in ${where}.`;
      },
    },
    'describe.persistence': {
      label: 'Persistentie',
      render: (c, ctx) => {
        const entry = own(ctx.host.model.schemes, param(c, 'scheme'))?.persistence?.[
          Number(param(c, 'index'))
        ];
        const name = schemeName(ctx, param(c, 'scheme'));
        const event = vocabWord(ctx, 'persistence-event', param(c, 'event'));
        return entry === undefined
          ? `Bij de gebeurtenis ${event} geldt een persistentieregel voor ${name}.`
          : `Bij de gebeurtenis ${event} geldt voor ${name}: ${ctx.label({ en: entry.behaviour })}.`;
      },
    },
    'describe.trust': {
      label: 'Vertrouwensscores',
      render: (c, ctx) => {
        const name = schemeName(ctx, param(c, 'scheme'));
        const trust = own(ctx.host.model.schemes, param(c, 'scheme'))?.trust;
        if (trust === undefined) return `${name} heeft vertrouwensscores.`;
        return `De vertrouwensscores van ${name} zijn rechtsgrondslag ${scoreText(trust.legal_basis)}, registratiekwaliteit ${scoreText(trust.registration_quality)}, verifieerbaarheid ${scoreText(trust.verifiability)}, koppelingen ${scoreText(trust.crosswalks)} en levenscyclus ${scoreText(trust.lifecycle)}.`;
      },
    },
    'describe.relation': {
      label: 'Relatie',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} heeft de relatie ${vocabWord(ctx, 'relation-kind', param(c, 'kind'))} met ${schemeName(ctx, param(c, 'target'))}.`,
    },
    'describe.pattern': {
      label: 'Patroon',
      render: (c, ctx) => {
        const pattern = own(ctx.host.model.schemes, param(c, 'scheme'))?.format?.patterns?.[
          Number(param(c, 'index'))
        ];
        const name = schemeName(ctx, param(c, 'scheme'));
        return pattern === undefined
          ? `${name} accepteert waarden die overeenkomen met patroon ${param(c, 'index')}.`
          : `${name} accepteert waarden die overeenkomen met het patroon ${pattern.regex} (patroon ${param(c, 'index')}).`;
      },
    },
    'describe.checksum': {
      label: 'Controlesom',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} wordt gecontroleerd met de controlesom ${vocabWord(ctx, 'checksum', param(c, 'algorithm'))} (onderdeel ${param(c, 'index')}).`,
    },
    'describe.component': {
      label: 'Onderdeel',
      render: (c, ctx) =>
        `${schemeName(ctx, param(c, 'scheme'))} heeft het onderdeel ${schemeName(ctx, param(c, 'component'))} onder het voorvoegsel ${param(c, 'prefix')}.`,
    },
    'describe.context-from': {
      label: 'Context uit de waarde',
      render: (c, ctx) => {
        const vocabulary = own(ctx.host.model.vocab, param(c, 'map'));
        const name = vocabulary === undefined ? param(c, 'map') : ctx.label(vocabulary.label);
        return `Het land van uitgifte van ${schemeName(ctx, param(c, 'scheme'))} wordt uit de waarde afgelezen via het vocabulaire ${name}.`;
      },
    },
    'describe.rule': {
      label: 'Regel',
      render: (c, ctx) =>
        param(c, 'direction') === 'in'
          ? `${schemeName(ctx, param(c, 'input'))} wordt ${schemeName(ctx, param(c, 'scheme'))} via de regel ${param(c, 'rule')}.`
          : `${schemeName(ctx, param(c, 'scheme'))} wordt ${schemeName(ctx, param(c, 'output'))} via de regel ${param(c, 'rule')}.`,
    },
  },
  warnings: {
    'component-not-accepted': {
      label: 'Onderdeel niet geaccepteerd',
      render: (w, ctx) => {
        const [owner = '', prefix = ''] = (w.ref ?? '').split('/components/');
        const component = own(ctx.host.model.schemes, owner)?.components?.find(
          (each) => each.prefix === prefix,
        )?.scheme;
        return component === undefined
          ? 'De waarde van het onderdeel wordt niet geaccepteerd.'
          : `De waarde van het onderdeel wordt niet geaccepteerd door ${schemeName(ctx, component)}.`;
      },
    },
    'context-conflict': {
      label: 'Contextconflict',
      render: () =>
        'De opgegeven context wijkt af van de context die de waarde zelf draagt; die van de waarde wordt gebruikt.',
    },
    'duplicate-value': {
      label: 'Dubbele waarde',
      render: (w) =>
        aboutValue(
          w,
          'een waarde herhaalt een eerdere waarde; ze wordt één keer vergeleken.',
          (value) => `${value} herhaalt een eerdere waarde; ze wordt één keer vergeleken.`,
        ),
    },
    'empty-input': {
      label: 'Lege invoer',
      render: (w) => aboutValue(w, 'de waarde is leeg.', (value) => `${value} is leeg.`),
    },
    'input-too-long': {
      label: 'Invoer te lang',
      render: (w) =>
        aboutValue(
          w,
          'de waarde is langer dan de toegestane lengte.',
          (value) => `${value} is langer dan de toegestane lengte.`,
        ),
    },
    'invalid-context': {
      label: 'Ongeldige context',
      render: () => 'De context moet een object zijn.',
    },
    'invalid-input': {
      label: 'Ongeldige invoer',
      render: (w) =>
        aboutValue(
          w,
          'de invoer heeft niet het verwachte type.',
          (value) => `${value} heeft niet het verwachte type.`,
        ),
    },
    'no-applicable-checksum': {
      label: 'Geen toepasselijke controlesom',
      render: (w, ctx) => {
        const name = w.ref === undefined ? 'het schema' : schemeName(ctx, w.ref);
        return `Geen controlesomregel van ${name} is van toepassing in de gegeven context; de waarde wordt alleen op formaat geaccepteerd.`;
      },
    },
    'no-chain': {
      label: 'Geen keten',
      render: () => "Geen keten van hoogstens vier stappen verbindt de twee schema's.",
    },
    'output-failed-validation': {
      label: 'Uitvoer niet geaccepteerd',
      render: (w, ctx) => {
        const rule = w.ref === undefined ? undefined : ruleOf(ctx, w.ref);
        return rule === undefined
          ? 'Een regel gaf een uitvoer die het uitvoerschema niet accepteert.'
          : `Regel ${rule.id} gaf een uitvoer die ${schemeName(ctx, rule.output)} niet accepteert.`;
      },
    },
    'possible-personal-identifier': {
      label: 'Mogelijk persoonlijk identificatienummer',
      render: (_w, ctx) => {
        const list: unknown[] = Array.isArray(ctx.data) ? ctx.data : [];
        const ids = list.flatMap((each) =>
          isRecord(each) && each.accepted === true && typeof each.scheme === 'string'
            ? [each.scheme]
            : [],
        );
        const candidates = ids.length === 0 ? '' : ` (kandidaat-schema's: ${ids.join(', ')})`;
        return `De waarde kan een persoonlijk identificatienummer zijn${candidates}; ze wordt alleen verder gebruikt als haar schema wordt genoemd of een andere opgegeven waarde haar afleidt.`;
      },
    },
    'same-scheme': {
      label: 'Hetzelfde schema',
      render: () => "De twee schema-id's horen bij hetzelfde schema.",
    },
    'too-many-results': {
      label: 'Te veel resultaten',
      render: (w) =>
        aboutValue(
          w,
          'de afleidingen hebben de limiet bereikt; het resultaat is onvolledig of beperkt tot de eerste resultaten.',
          (value) =>
            `voor ${value} bestaan meer afleidingen dan de limiet toestaat; alleen de eerste worden gebruikt.`,
        ),
    },
    'too-many-values': {
      label: 'Te veel waarden',
      render: () => 'Er zijn meer waarden opgegeven dan de vergelijking toestaat.',
    },
    'unknown-component-prefix': {
      label: 'Onbekend voorvoegsel',
      render: (w, ctx) => {
        const name = w.ref === undefined ? 'het schema' : schemeName(ctx, w.ref);
        return `De waarde heeft een voorvoegsel voor een onderdeel dat ${name} niet declareert, dus wordt het niet doorgegeven.`;
      },
    },
    'unknown-context-key': {
      label: 'Onbekende contextsleutel',
      render: () =>
        'De context bevat een sleutel die geen voorwaardesleutel is; die wordt genegeerd.',
    },
    'unknown-context-value': {
      label: 'Onbekende contextwaarde',
      render: () =>
        'De waarde van een contextsleutel is niet bekend in het model; die wordt genegeerd.',
    },
    'unknown-country-hint': {
      label: 'Onbekende landaanwijzing',
      render: () => 'De landaanwijzing wordt niet begrepen.',
    },
    'unknown-jurisdiction': {
      label: 'Onbekend rechtsgebied',
      render: () => 'Er bestaat geen rechtsgebied met deze id in het model.',
    },
    'unknown-scheme': {
      label: 'Onbekend schema',
      render: () => 'Er bestaat geen schema met deze id in het model.',
    },
    'value-not-accepted': {
      label: 'Waarde niet geaccepteerd',
      render: () => 'De waarde wordt niet geaccepteerd door het opgegeven schema.',
    },
  },
} as const satisfies EngineDictionary;
