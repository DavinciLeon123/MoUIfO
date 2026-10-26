import type { UiKey } from './ui.en.ts';

/**
 * The Dutch counterpart of UI_EN (D-09, D-11). `satisfies Record<UiKey, string>` makes a missing or
 * an extra string a type error. Wording is a proposal for the owner's end-of-phase check (A2).
 */
export const UI_NL = {
  title: 'UIO-kennismodel',
  inputLabel: 'Identificatienummers, één per regel',
  privacy: 'Waarden worden alleen in uw browser verwerkt en nooit opgeslagen of verzonden.',
  explain: 'Uitleggen',

  normalisedHeading: 'Genormaliseerde invoer',
  recognitionHeading: 'Herkenning',
  derivationsHeading: 'Afleidingen',
  consistencyHeading: 'Consistentie',

  nothingToShow: 'Plak minstens één identificatienummer en kies Uitleggen.',
  omitted: '{count} regels na de eerste {max} zijn weggelaten.',
  valueHeading: 'Waarde {position}: {value}',
  noSchemeFormat: 'Geen schema in het model heeft dit formaat.',
  deriveNothing: 'De regels van het model leiden hieruit niets af.',
  derivedValue: 'Afgeleide waarde',
  needTwoValues: 'Er zijn minstens twee waarden nodig.',
  noPairs: 'Er zijn geen paren om te vergelijken.',
  pairLine: 'Waarden {a} en {b}',
  outcomeConsistent: 'consistent',
  outcomeInconsistent: 'inconsistent',
  outcomeNoRule: 'geen regel in het model verbindt deze twee waarden',

  warningsHeading: 'Opmerkingen van de engine',
  resultsReady: 'Resultaten klaar voor {count} waarden.',
  resultsReadyOne: 'Resultaten klaar voor 1 waarde.',

  ambiguityHeading: 'Mogelijk een persoonlijk identificatienummer',
  cannotTellApart: "Deze schema's zijn met de controlesom niet van elkaar te onderscheiden.",
  treatAs: 'Behandel als {scheme}',
  deriveGated:
    'Deze waarde kan een persoonlijk identificatienummer zijn. Kies hierboven Behandel als om eruit af te leiden.',
  treatedAs: 'Behandeld als {scheme}, uw keuze',

  stepsHeading: 'Stappen',
  stepKind: 'Soort',
  stepCondition: 'Voorwaarde',
  stepSource: 'Bron',
  sourceTitlesNote: 'Brontitels staan in het Engels, zoals het model ze geeft.',
  stepNoSource: 'Voor een aanname geldt geen bron.',
  howToVerify: 'Zo controleert u het',
  registerLink: '{label} ({host}), opent extern register',
  sourceLink: '{title} ({host}), opent externe site',
  noRegisterLink: 'Het model bevat geen bronvermelde registerlink voor {scheme}.',
  schemePage: 'Schemapagina voor {scheme}',
  noVerifyTarget: 'Deze conclusie noemt geen schema om te controleren.',

  certaintyCertain: 'Zeker',
  certaintyLikely: 'Waarschijnlijk',
  certaintyPossible: 'Mogelijk',

  stepKindFact: 'feit',
  stepKindRule: 'regel',
  stepKindPattern: 'patroon',
  stepKindChecksum: 'controlesom',
  stepKindAssumption: 'aanname',
  stepKindComponent: 'onderdeel',
  sourceTypeLaw: 'wet',
  sourceTypeStandard: 'norm',
  sourceTypeRegisterDoc: 'registerdocumentatie',
  sourceTypeExpert: 'expertbron',
  sourceTypeAnalysis: 'analyse',

  schemesHeading: "Schema's",
  schemesIntro:
    "De identificatieschema's van het model. Kies er een voor de beschrijving met bronnen.",
  schemeDescriptionHeading: 'Beschrijving',
  scopeLabel: 'Reikwijdte',
  notesLabel: 'Opmerkingen',
  trustHeading: 'Deelscores voor vertrouwen',
  trustLegalBasis: 'Wettelijke grondslag',
  trustRegistrationQuality: 'Kwaliteit van de registratie',
  trustVerifiability: 'Controleerbaarheid',
  trustCrosswalks: 'Koppelingen',
  trustLifecycle: 'Levenscyclus',
  notAssessed: 'niet beoordeeld',
  applicabilityHeading: 'Toepasselijkheid',
  applicabilityStated: 'vermeld',
  applicabilityInherited: 'overgeërfd van {from}',
  applicabilityNoData: 'geen gegevens in het model',
  notInModelTitle: 'Niet in het model',
  notInModelText: 'Het model heeft geen pagina op dit adres.',
  backToSchemes: "Terug naar de lijst met schema's",

  markerEn: 'EN',
  markerUntranslated: 'niet vertaald',
} as const satisfies Record<UiKey, string>;
