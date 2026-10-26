/**
 * Every visible string of the website that is not engine or model text (D-09, D-10). Components read
 * these through `useUi()`; none is written inline, so a second language is a second dictionary.
 * `{name}` marks a value that `fill` puts in.
 */
export const UI_EN = {
  title: 'UIO knowledge model',
  inputLabel: 'Identifiers, one per line',
  privacy: 'Values are processed in your browser only and never stored or sent.',
  explain: 'Explain',

  normalisedHeading: 'Normalised input',
  recognitionHeading: 'Recognition',
  derivationsHeading: 'Derivations',
  consistencyHeading: 'Consistency',

  nothingToShow: 'Paste at least one identifier and choose Explain.',
  omitted: '{count} lines beyond the first {max} were left out.',
  valueHeading: 'Value {position}: {value}',
  noSchemeFormat: 'No scheme in the model has this format.',
  deriveNothing: "The model's rules derive nothing from this value.",
  derivedValue: 'Derived value',
  needTwoValues: 'Needs at least two values.',
  noPairs: 'There are no pairs to compare.',
  pairLine: 'Values {a} and {b}',
  outcomeConsistent: 'consistent',
  outcomeInconsistent: 'inconsistent',
  outcomeNoRule: 'no rule in the model connects these two values',

  warningsHeading: 'Notes from the engine',
  resultsReady: 'Results ready for {count} values.',
  resultsReadyOne: 'Results ready for 1 value.',

  ambiguityHeading: 'Possible personal identifier',
  cannotTellApart: 'These schemes cannot be told apart by checksum.',
  treatAs: 'Treat as {scheme}',
  deriveGated: 'This value may be a personal identifier. Choose Treat as above to derive from it.',
  treatedAs: 'Treated as {scheme}, your choice',

  stepsHeading: 'Steps',
  stepKind: 'Kind',
  stepCondition: 'Condition',
  stepSource: 'Source',
  sourceTitlesNote: 'Source titles are shown in English, as the model gives them.',
  stepNoSource: 'No source applies to an assumption.',
  howToVerify: 'How to verify',
  registerLink: '{label} ({host}), opens external register',
  sourceLink: '{title} ({host}), opens external site',
  noRegisterLink: 'The model holds no sourced register link for {scheme}.',
  schemePage: 'Scheme page for {scheme}',
  noVerifyTarget: 'This conclusion names no scheme to verify.',

  certaintyCertain: 'Certain',
  certaintyLikely: 'Likely',
  certaintyPossible: 'Possible',

  stepKindFact: 'fact',
  stepKindRule: 'rule',
  stepKindPattern: 'pattern',
  stepKindChecksum: 'checksum',
  stepKindAssumption: 'assumption',
  stepKindComponent: 'component',
  sourceTypeLaw: 'law',
  sourceTypeStandard: 'standard',
  sourceTypeRegisterDoc: 'register documentation',
  sourceTypeExpert: 'expert source',
  sourceTypeAnalysis: 'analysis',

  schemesHeading: 'Schemes',
  schemesIntro: 'The identifier schemes of the model. Choose one to see its sourced description.',
  schemeDescriptionHeading: 'Description',
  scopeLabel: 'Scope',
  notesLabel: 'Notes',
  trustHeading: 'Trust sub-scores',
  trustLegalBasis: 'Legal basis',
  trustRegistrationQuality: 'Registration quality',
  trustVerifiability: 'Verifiability',
  trustCrosswalks: 'Crosswalks',
  trustLifecycle: 'Lifecycle',
  notAssessed: 'not assessed',
  applicabilityHeading: 'Applicability',
  applicabilityStated: 'stated',
  applicabilityInherited: 'inherited from {from}',
  applicabilityNoData: 'no data in the model',
  notInModelTitle: 'Not in the model',
  notInModelText: 'The model has no page at this address.',
  backToSchemes: 'Back to the list of schemes',

  navLabel: 'Main navigation',
  navPaste: 'Paste identifiers',
  navSchemes: 'Schemes',
  credit:
    'UID table v1.2 — Davinci Conclusion, as produced for the CoE-DSC. Licensed under CC BY 4.0.',
  licenceLead: 'Licence text:',

  relationsHeading: 'Relations',
  relationsGraphTitle: 'Relations of {scheme}',
  relationsNone:
    'The model holds no relations, rules or components that connect this scheme to another.',
  relationsLegend:
    'An arrow runs from the first to the second scheme of the model statement. A dashed arrow is inverse: the model states it from the other scheme to this one.',
  relationsListLabel: 'Relations as a list',
  edgeRule: 'rule {id}',
  edgeComponent: 'component {prefix}',
  edgeInverse: 'inverse',

  navRelate: 'Relation',
  relateHeading: 'Relation between two schemes',
  relateIntro:
    'Choose two schemes to see every shortest chain of sourced relations, rules and components that connects them.',
  relateA: 'Scheme A',
  relateB: 'Scheme B',
  relateSwap: 'Swap A and B',
  relateChoose: 'Choose two schemes.',
  relateChoosePlaceholder: 'Choose a scheme',
  relateNoChain: 'No sourced relation found between these schemes.',
  relateResultHeading: 'Chains',
  relateHopsLabel: 'Steps of this chain',
  relateAlsoVia: 'Also via',

  markerEn: 'EN',
  markerUntranslated: 'not translated',
} as const;

export type UiKey = keyof typeof UI_EN;
export type Ui = Readonly<Record<UiKey, string>>;
