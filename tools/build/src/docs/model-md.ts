import type { Condition, Model, Scheme, Statement } from '@uio/engine';
import { mdSpan, mdText } from '../markdown.ts';
import { type GapSection, gapLinksFor, gapSections, slug } from './gaps-anchors.ts';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A link destination is written only for an `http://` or `https://` address. */
const WEB = /^https?:\/\//i;

/** Characters that would end or break an inline link destination, as percent escapes. */
const UNSAFE_IN_DESTINATION = /[\s\p{Cc}()<>[\]`\\"]/gu;

function destination(url: string): string {
  return url.replace(
    UNSAFE_IN_DESTINATION,
    (character) =>
      `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/** `[text](url)` for an http(s) url; `undefined` for anything else. `text` is already escaped. */
function link(text: string, url: string | undefined): string | undefined {
  return url !== undefined && WEB.test(url) ? `[${text}](${destination(url)})` : undefined;
}

/** A source id: linked to the eli or url of its source when that is http(s), else a code span. */
function sourceRef(model: Model, id: string): string {
  const source = model.sources[id];
  return link(mdText(id), source?.eli) ?? link(mdText(id), source?.url) ?? mdSpan(id);
}

/** A condition as `key value` code spans, keys in codepoint order. */
function conditionText(condition: Condition): string {
  return Object.entries(condition)
    .sort(([a], [b]) => compare(a, b))
    .map(([key, value]) => mdSpan(`${key} ${String(value)}`))
    .join(', ');
}

/** The end of every claim line: its certainty and its source id (D-12). */
function tail(model: Model, claim: { certainty: string; source: string }): string {
  return `(certainty: ${mdText(claim.certainty)}, source: ${sourceRef(model, claim.source)})`;
}

/** A claim line: the text, the condition and note when it has them, then certainty and source. */
function claim(model: Model, text: string, statement: Statement): string {
  const parts = [text];
  if (statement.condition !== undefined) {
    parts.push(`condition: ${conditionText(statement.condition)}`);
  }
  if (statement.note !== undefined) parts.push(`note: ${mdText(statement.note)}`);
  return `${parts.join('; ')} ${tail(model, statement)}`;
}

const list = (label: string, items: readonly string[]): string[] =>
  items.length === 0 ? [] : [`- ${label}:`, ...items.map((item) => `  - ${item}`)];

const spans = (values: readonly string[]): string => values.map(mdSpan).join(', ');

/** `Label (`id`)` when the table knows the id, else the id as a code span. */
function named(label: string | undefined, id: string): string {
  return label === undefined ? mdSpan(id) : `${mdText(label)} (${mdSpan(id)})`;
}

function headerLines(model: Model, scheme: Scheme): string[] {
  const lines: string[] = [];
  const header = (
    label: string,
    entry: { value: string | null; certainty: string; source: string } | undefined,
    show: (value: string) => string = mdSpan,
  ): void => {
    if (entry === undefined) return;
    const text = entry.value === null ? 'none' : show(entry.value);
    lines.push(`- ${label}: ${text} ${tail(model, entry)}`);
  };
  header('Issuer', scheme.issuer, (id) => named(model.authorities[id]?.label.en, id));
  header('Jurisdiction', scheme.jurisdiction, (id) => named(model.jurisdictions[id]?.label.en, id));
  header('Kind', scheme.kind);
  header('Abbreviation', scheme.abbreviation, mdText);
  header('Availability', scheme.availability);
  header('ISO 6523 ICD', scheme.iso6523_icd);
  header('Peppol EAS', scheme.peppol_eas);
  return lines;
}

function formatLines(model: Model, scheme: Scheme): string[] {
  const format = scheme.format;
  if (format === undefined) return [];
  return [
    ...list(
      'Format patterns',
      (format.patterns ?? []).map((entry) => claim(model, mdSpan(entry.regex), entry)),
    ),
    ...list(
      'Checksums',
      (format.checksum ?? []).map((entry) =>
        claim(
          model,
          entry.over === undefined
            ? mdSpan(entry.algorithm)
            : `${mdSpan(entry.algorithm)} over ${mdSpan(JSON.stringify(entry.over))}`,
          entry,
        ),
      ),
    ),
    ...(format.examples_valid === undefined || format.examples_valid.length === 0
      ? []
      : [`- Valid examples: ${spans(format.examples_valid)}`]),
    ...(format.examples_invalid === undefined || format.examples_invalid.length === 0
      ? []
      : [`- Invalid examples: ${spans(format.examples_invalid)}`]),
  ];
}

function ruleLines(model: Model, scheme: Scheme): string[] {
  const lines: string[] = [];
  for (const rule of scheme.rules ?? []) {
    const text = `${mdSpan(rule.id)}: ${mdSpan(rule.input)} to ${mdSpan(rule.output)}, transform ${mdSpan(JSON.stringify(rule.transform))}`;
    lines.push(`  - ${claim(model, text, rule)}`);
    for (const example of rule.examples ?? []) {
      lines.push(`    - Example: ${mdSpan(example.in)} → ${mdSpan(example.out)}`);
    }
  }
  return lines.length === 0 ? [] : ['- Rules:', ...lines];
}

function trustLine(model: Model, scheme: Scheme): string[] {
  const trust = scheme.trust;
  if (trust === undefined) return [];
  const scores = (
    ['legal_basis', 'registration_quality', 'verifiability', 'crosswalks', 'lifecycle'] as const
  )
    .map((key) => mdSpan(`${key} ${trust[key] === null ? 'null' : String(trust[key])}`))
    .join(', ');
  return [`- Trust: ${claim(model, scores, trust)}`];
}

function textLines(label: string, text: { en: string; nl?: string } | undefined): string[] {
  if (text === undefined) return [];
  return [
    `- ${label} (en): ${mdText(text.en)}`,
    ...(text.nl === undefined ? [] : [`- ${label} (nl): ${mdText(text.nl)}`]),
  ];
}

function gapLine(sections: readonly GapSection[], schemeId: string): string {
  const links = gapLinksFor(sections, schemeId).map(
    (section) => `[${mdText(section.heading)}](gaps.md#${section.slug})`,
  );
  return `Open questions in docs/gaps.md: ${links.length === 0 ? 'none' : links.join('; ')}`;
}

function schemeLines(model: Model, scheme: Scheme, sections: readonly GapSection[]): string[] {
  return [
    `- English label: ${mdText(scheme.label.en)}`,
    ...(scheme.label.nl === undefined ? [] : [`- Dutch label: ${mdText(scheme.label.nl)}`]),
    ...headerLines(model, scheme),
    ...formatLines(model, scheme),
    ...list(
      'Level',
      (scheme.level ?? []).map((entry) => claim(model, mdSpan(entry.value), entry)),
    ),
    ...list(
      'Roles',
      (scheme.roles ?? []).map((entry) => claim(model, mdSpan(entry.value), entry)),
    ),
    ...list(
      'Applicability',
      (scheme.applicability ?? []).map((entry) =>
        claim(model, `${mdSpan(entry.jurisdiction)}: ${spans(entry.status)}`, entry),
      ),
    ),
    ...list(
      'Relations',
      (scheme.relations ?? []).map((entry) =>
        claim(model, `${mdSpan(entry.kind)}: ${mdSpan(entry.target)}`, entry),
      ),
    ),
    ...list(
      'Components',
      (scheme.components ?? []).map((entry) =>
        claim(model, `prefix ${mdSpan(entry.prefix)}, scheme ${mdSpan(entry.scheme)}`, entry),
      ),
    ),
    ...list(
      'Issuing-country context',
      scheme.context_from?.issuing_country === undefined
        ? []
        : [
            claim(
              model,
              `capture ${mdSpan(scheme.context_from.issuing_country.capture.regex)} group ${scheme.context_from.issuing_country.capture.group}, map ${mdSpan(scheme.context_from.issuing_country.map)}`,
              scheme.context_from.issuing_country,
            ),
          ],
    ),
    ...ruleLines(model, scheme),
    ...list(
      'Legal basis',
      (scheme.legal_basis ?? []).map((entry) => {
        const title = mdText(entry.title);
        return claim(model, link(title, entry.eli) ?? link(title, entry.url) ?? title, entry);
      }),
    ),
    ...(scheme.validation_source === undefined
      ? []
      : [
          `- Validation source: ${claim(
            model,
            link(mdText(scheme.validation_source.label), scheme.validation_source.url) ??
              `${mdText(scheme.validation_source.label)} ${mdSpan(scheme.validation_source.url)}`,
            scheme.validation_source,
          )}`,
        ]),
    ...(scheme.mandatory === undefined
      ? []
      : [`- Mandatory: ${claim(model, mdText(scheme.mandatory.text), scheme.mandatory)}`]),
    ...trustLine(model, scheme),
    ...list(
      'Persistence',
      (scheme.persistence ?? []).map((entry) =>
        claim(model, `${mdSpan(entry.event)}: ${mdText(entry.behaviour)}`, entry),
      ),
    ),
    ...textLines('Scope', scheme.scope),
    ...textLines('Notes', scheme.notes),
    '',
    gapLine(sections, scheme.id),
  ];
}

/**
 * docs/model.md (D-12): human-readable documentation of every scheme, generated from the
 * normalised model, one `##` section per scheme in id order. `gapsText` is the text of
 * docs/gaps.md, which each section links into. Free text is escaped, regexes and JSON are code
 * spans, and a link is written only for the http(s) url or eli of a source.
 */
export function renderModelMd(model: Model, gapsText: string): string {
  const ids = Object.keys(model.schemes).sort(compare);
  const sections = gapSections(gapsText);
  const lines = [
    '# Model documentation',
    '',
    `This file is generated by \`npm run build:docs\` from the model (contract ${model.contract}, model version ${mdText(model.model_version)}); do not edit it by hand. CI fails when it is stale. It is published under CC-BY-4.0 (\`LICENSE-model\`).`,
    '',
    ...ids.map(
      (id) => `- [${mdText(id)}](#${slug(id)}): ${mdText(model.schemes[id]?.label.en ?? id)}`,
    ),
  ];
  for (const id of ids) {
    const scheme = model.schemes[id];
    if (scheme === undefined) continue;
    lines.push('', `## ${id}`, '', ...schemeLines(model, scheme, sections));
  }
  return `${lines.join('\n')}\n`;
}
