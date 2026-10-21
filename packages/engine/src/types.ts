import type { Condition, Source } from './model-types.ts';

/** The three certainty ids of SPEC §5.1; their rank comes from the certainty vocabulary. */
export type Certainty = 'certain' | 'likely' | 'possible';

/** A source as an explanation step cites it (DEC-070): the fields the model holds for it. */
export type SourceRef = {
  id: string;
  title: string;
  type: Source['type'];
  date: string;
  url?: string;
  eli?: string;
};

/** The optional context of derive, check and relate (DEC-069): the closed condition keys. */
export type Context = {
  issuing_country?: string;
  entity_form?: string;
  context?: string;
};

export type StepKind = 'fact' | 'rule' | 'pattern' | 'checksum' | 'assumption' | 'component';
export type EdgeKind = 'relation' | 'rule' | 'component';

/**
 * One link of an explanation chain (SPEC §6.1, DEC-070). `source` is null only for an assumption and
 * for a fact taken from the caller's context.
 */
export type Step = {
  kind: StepKind;
  ref: string;
  certainty: Certainty;
  condition?: Condition;
  source: SourceRef | null;
  edge?: EdgeKind;
  inverse?: boolean;
};

/** An English sentence built from model labels and ids only, with its i18n key and parameters. */
export type Conclusion = {
  key: string;
  params: Record<string, string>;
  statement: string;
  certainty: Certainty;
  explanation: Step[];
};

/** A warning never contains an input value. */
export type Warning = { code: string; message: string; ref?: string };

export type Result<T> = { data: T; conclusions: Conclusion[]; warnings: Warning[] };
