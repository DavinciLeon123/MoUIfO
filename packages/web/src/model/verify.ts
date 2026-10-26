import type { Certainty, Conclusion, Host, Model, SourceRef } from '../engine-host.ts';

/** A link the page may emit: the href as the URL parser wrote it and the host to show next to it. */
export type SafeLink = { href: string; host: string };

/**
 * D-14, T-07-05: an href only for an http or https URL that parses. Anything else (javascript:,
 * data:, ftp:, a relative or broken string) gives null, so model data can never become another
 * kind of link.
 */
export function safeHref(url: string | undefined): SafeLink | null {
  if (url === undefined) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { href: parsed.href, host: parsed.host };
  } catch {
    return null;
  }
}

/** The sourced register link of a scheme (its `validation_source` claim), as `describe` gives it. */
export type VerifyEntry = {
  label: string;
  url: string;
  certainty: Certainty;
  source: SourceRef;
};

/** Scheme id to its sourced register link, or null when the model holds none (D-13). */
export type VerifyIndex = ReadonlyMap<string, VerifyEntry | null>;

/**
 * D-13: the only register links the page knows are the `validation_source` claims of the model; a
 * register URL is never built from anything else and never from a pasted value.
 */
export function createVerifyIndex(host: Host): VerifyIndex {
  const index = new Map<string, VerifyEntry | null>();
  for (const id of Object.keys(host.model.schemes)) {
    const claim = host.engine.describe(id).data?.validation_source;
    index.set(
      id,
      claim === undefined
        ? null
        : {
            label: claim.value.label,
            url: claim.value.url,
            certainty: claim.certainty,
            source: claim.source,
          },
    );
  }
  return index;
}

/** Which params of a conclusion name the schemes it points to, by the conclusion key's family. */
function schemeParams(key: string): readonly string[] {
  const family = key.split('.')[0];
  switch (family) {
    case 'recognise':
    case 'derive':
    case 'applicability':
    case 'describe':
      return ['scheme'];
    case 'check':
      return ['from', 'to'];
    case 'relate':
      return key === 'relate.path' ? ['a', 'b'] : [];
    default:
      return [];
  }
}

/**
 * The scheme ids a conclusion points to, in order and without repeats. An id counts only when it
 * is an own key of the model's schemes, so `constructor` or `__proto__` never resolves.
 */
export function verifyTargets(conclusion: Conclusion, model: Model): string[] {
  const targets: string[] = [];
  for (const name of schemeParams(conclusion.key)) {
    const id = Object.hasOwn(conclusion.params, name) ? conclusion.params[name] : undefined;
    if (id === undefined || !Object.hasOwn(model.schemes, id)) continue;
    if (!targets.includes(id)) targets.push(id);
  }
  return targets;
}
