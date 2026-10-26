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

  markerEn: 'EN',
  markerUntranslated: 'not translated',
} as const;

export type UiKey = keyof typeof UI_EN;
export type Ui = Readonly<Record<UiKey, string>>;
