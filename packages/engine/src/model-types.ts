/**
 * The contract of `dist/model.json` (DEC-054): the one normalised model the engine, the MCP server
 * and the website read. The number changes only with a new DECISIONS.md row and a migration of
 * every consumer.
 */
export const MODEL_CONTRACT = 1;

/** One record of a table, as the build writes it. */
export type ModelRecord = Readonly<Record<string, unknown>>;

/** The normalised model: five tables keyed by id. */
export type Model = {
  contract: number;
  model_version: string;
  schemes: Record<string, ModelRecord>;
  authorities: Record<string, ModelRecord>;
  jurisdictions: Record<string, ModelRecord>;
  sources: Record<string, ModelRecord>;
  vocab: Record<string, ModelRecord>;
};
