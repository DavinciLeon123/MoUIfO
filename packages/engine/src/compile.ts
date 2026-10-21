import { byCodeUnit, type RankMap } from './certainty.ts';
import { compileFormat, type FormatResult } from './format.ts';
import {
  type Authority,
  assertModelContract,
  type ContextFrom,
  type Model,
  type Rule,
  type Scheme,
  type VocabularyMember,
} from './model-types.ts';
import { compilePattern, compileTransform } from './transform.ts';
import type { Certainty, SourceRef } from './types.ts';

/** The capture of a scheme's `context_from.issuing_country`, compiled once. */
export type CompiledCapture = {
  /** The captured prefix, or null when the regex does not match or the group did not take part. */
  run(value: string): string | null;
  statement: NonNullable<ContextFrom['issuing_country']>;
};

export type CompiledScheme = {
  id: string;
  scheme: Scheme;
  /** The kernel check, or null when the scheme declares no pattern (it can never be a candidate). */
  check: ((value: string) => FormatResult) | null;
  capture: CompiledCapture | null;
};

export type CompiledRule = {
  rule: Rule;
  /** The scheme that holds the rule. */
  owner: string;
  /** The transformed value, or null when a step gives no result (no conclusion). */
  run(value: string): string | null;
};

/** One `part_of` ancestor: its distance and the hops that reach it, nearest first. */
export type Ancestor = {
  jurisdiction: string;
  depth: number;
  /** Each hop is `jurisdictions/<jurisdiction>/part_of/<index>`. */
  chain: { jurisdiction: string; index: number }[];
};

export type PrefixEntry = {
  prefix: string;
  jurisdiction: string;
  certainty: string;
  source: string;
  member: VocabularyMember;
};

export type StatusEntry = { id: string; inherits_down: boolean };

export type CompiledModel = {
  model: Model;
  schemeIds: string[];
  schemes: Map<string, CompiledScheme>;
  rules: Map<string, CompiledRule>;
  /** Rule ids by input scheme, each list sorted. */
  rulesByInput: Map<string, string[]>;
  rank: RankMap;
  sources: Map<string, SourceRef>;
  jurisdictionIds: string[];
  jurisdictions: Set<string>;
  ancestors: Map<string, Ancestor[]>;
  prefixes: Map<string, PrefixEntry>;
  statuses: StatusEntry[];
  entityForms: Set<string>;
  contextTags: Set<string>;
  authorities: Map<string, Authority>;
  instancesByClass: Map<string, string[]>;
};

const CERTAINTY_IDS: readonly Certainty[] = ['certain', 'likely', 'possible'];

function ownKeys(table: object | undefined): string[] {
  return table === undefined ? [] : Object.keys(table).sort(byCodeUnit);
}

function members(model: Model, vocabularyId: string, problems: string[]): VocabularyMember[] {
  if (!Object.hasOwn(model.vocab, vocabularyId)) {
    problems.push(`vocab/${vocabularyId}: the vocabulary is missing`);
    return [];
  }
  return [...(model.vocab[vocabularyId]?.values ?? [])];
}

function compileRank(model: Model, problems: string[]): RankMap {
  const rank = new Map<Certainty, number>();
  const found: string[] = [];
  for (const member of members(model, 'certainty', problems)) {
    if (typeof member.id !== 'string' || typeof member.rank !== 'number') {
      problems.push('vocab/certainty: every member needs an id and a rank');
      continue;
    }
    found.push(member.id);
    if (CERTAINTY_IDS.includes(member.id as Certainty))
      rank.set(member.id as Certainty, member.rank);
  }
  const expected = [...CERTAINTY_IDS].sort(byCodeUnit).join(', ');
  if (
    [...found].sort(byCodeUnit).join(', ') !== expected &&
    Object.hasOwn(model.vocab, 'certainty')
  ) {
    problems.push(`vocab/certainty: the members must be exactly ${expected}`);
  }
  return rank;
}

function compileScheme(id: string, scheme: Scheme, problems: string[]): CompiledScheme {
  let check: CompiledScheme['check'] = null;
  const format = scheme.format;
  if (format !== undefined) {
    const compiled = compileFormat(format);
    if (compiled.ok) {
      if ((format.patterns ?? []).length > 0) check = (value) => compiled.check(value);
    } else {
      for (const error of compiled.errors) {
        problems.push(`schemes/${id}/format${error.path}: ${error.message}`);
      }
    }
  }

  let capture: CompiledCapture | null = null;
  const statement = scheme.context_from?.issuing_country;
  if (statement !== undefined) {
    const pattern = compilePattern(statement.capture.regex);
    const path = `schemes/${id}/context_from/issuing_country/capture`;
    if (!pattern.ok) {
      problems.push(`${path}: ${pattern.message}`);
    } else if (statement.capture.group > pattern.groups) {
      problems.push(`${path}: group ${statement.capture.group} does not exist in the regex`);
    } else {
      const { regex } = pattern;
      const { group } = statement.capture;
      capture = {
        run(value) {
          const match = regex.exec(value);
          return match?.[group] ?? null;
        },
        statement,
      };
    }
  }
  return { id, scheme, check, capture };
}

function compileAncestors(model: Model, ids: string[]): Map<string, Ancestor[]> {
  const result = new Map<string, Ancestor[]>();
  for (const start of ids) {
    const found: Ancestor[] = [];
    const seen = new Set<string>([start]);
    let frontier: Ancestor[] = [{ jurisdiction: start, depth: 0, chain: [] }];
    while (frontier.length > 0) {
      const next: Ancestor[] = [];
      for (const node of [...frontier].sort((a, b) => byCodeUnit(a.jurisdiction, b.jurisdiction))) {
        const parents = Object.hasOwn(model.jurisdictions, node.jurisdiction)
          ? (model.jurisdictions[node.jurisdiction]?.part_of ?? [])
          : [];
        parents.forEach((parent, index) => {
          if (seen.has(parent.jurisdiction)) return;
          seen.add(parent.jurisdiction);
          next.push({
            jurisdiction: parent.jurisdiction,
            depth: node.depth + 1,
            chain: [...node.chain, { jurisdiction: node.jurisdiction, index }],
          });
        });
      }
      next.sort((a, b) => byCodeUnit(a.jurisdiction, b.jurisdiction));
      found.push(...next);
      frontier = next;
    }
    result.set(start, found);
  }
  return result;
}

/**
 * Compile the model once (SPEC §6.1): every format, capture and rule transform, plus the lookup
 * tables the six functions share. Every id list is sorted by code unit and every table is read
 * through its own keys, so the result does not depend on the order of the model's tables. Throws
 * one Error that lists every problem as `<model path>: <message>`; it never mutates the model.
 */
export function compileModel(model: Model): CompiledModel {
  assertModelContract(model);
  const problems: string[] = [];

  const rank = compileRank(model, problems);

  const schemeIds = ownKeys(model.schemes);
  const schemes = new Map<string, CompiledScheme>();
  const rules = new Map<string, CompiledRule>();
  const rulesByInput = new Map<string, string[]>();
  for (const id of schemeIds) {
    const scheme = model.schemes[id];
    if (scheme === undefined) continue;
    schemes.set(id, compileScheme(id, scheme, problems));
    for (const rule of scheme.rules ?? []) {
      if (rules.has(rule.id)) {
        problems.push(`rules/${rule.id}: the rule id is used twice`);
        continue;
      }
      const transform = compileTransform(rule.transform);
      if (!transform.ok) {
        for (const error of transform.errors) {
          problems.push(`rules/${rule.id}/transform/${error.step}: ${error.message}`);
        }
        continue;
      }
      rules.set(rule.id, { rule, owner: id, run: (value) => transform.run(value) });
      const list = rulesByInput.get(rule.input) ?? [];
      list.push(rule.id);
      rulesByInput.set(rule.input, list);
    }
  }
  for (const list of rulesByInput.values()) list.sort(byCodeUnit);

  const sources = new Map<string, SourceRef>();
  for (const id of ownKeys(model.sources)) {
    const source = model.sources[id];
    if (source === undefined) continue;
    const ref: SourceRef = { id, title: source.title, type: source.type, date: source.date };
    if (source.url !== undefined) ref.url = source.url;
    if (source.eli !== undefined) ref.eli = source.eli;
    sources.set(id, ref);
  }

  const jurisdictionIds = ownKeys(model.jurisdictions);
  const ancestors = compileAncestors(model, jurisdictionIds);

  const prefixes = new Map<string, PrefixEntry>();
  for (const member of members(model, 'country-prefix', problems)) {
    const { prefix, jurisdiction, certainty, source } = member;
    if (
      typeof prefix !== 'string' ||
      typeof jurisdiction !== 'string' ||
      typeof certainty !== 'string' ||
      typeof source !== 'string'
    ) {
      problems.push(
        'vocab/country-prefix: every member needs a prefix, jurisdiction, certainty and source',
      );
      continue;
    }
    prefixes.set(prefix, { prefix, jurisdiction, certainty, source, member });
  }

  const statuses: StatusEntry[] = [];
  for (const member of members(model, 'applicability-status', problems)) {
    if (typeof member.id === 'string') {
      statuses.push({ id: member.id, inherits_down: member.inherits_down === true });
    }
  }

  const ids = (vocabularyId: string): Set<string> => {
    const result = new Set<string>();
    for (const member of members(model, vocabularyId, problems)) {
      if (typeof member.id === 'string') result.add(member.id);
    }
    return result;
  };

  const entityForms = ids('entity-form');
  const contextTags = ids('condition-context');

  const authorities = new Map<string, Authority>();
  const instancesByClass = new Map<string, string[]>();
  for (const id of ownKeys(model.authorities)) {
    const authority = model.authorities[id];
    if (authority === undefined) continue;
    authorities.set(id, authority);
    if (authority.kind === 'instance' && authority.instance_of !== undefined) {
      const list = instancesByClass.get(authority.instance_of) ?? [];
      list.push(id);
      instancesByClass.set(authority.instance_of, list);
    }
  }
  for (const list of instancesByClass.values()) list.sort(byCodeUnit);

  if (problems.length > 0) throw new Error(`invalid model:\n${problems.join('\n')}`);

  return {
    model,
    schemeIds,
    schemes,
    rules,
    rulesByInput,
    rank,
    sources,
    jurisdictionIds,
    jurisdictions: new Set(jurisdictionIds),
    ancestors,
    prefixes,
    statuses,
    entityForms,
    contextTags,
    authorities,
    instancesByClass,
  };
}
