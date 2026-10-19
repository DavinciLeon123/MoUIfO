import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Model } from '@uio/engine';
import { REPO_ROOT } from 'uio-config';
import { parseAllowlist, scanText } from 'uio-guards';
import { loadValidatedModel } from 'uio-validate';
import { beforeAll, describe, expect, test } from 'vitest';
import { mdSpan } from '../markdown.ts';
import { normalise } from '../model/normalise.ts';
import { gapLinksFor, gapSections, slug } from './gaps-anchors.ts';
import { renderModelMd } from './model-md.ts';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

let model: Model;
let gaps: string;
let render: string;

beforeAll(() => {
  const loaded = loadValidatedModel(REPO_ROOT);
  if (!loaded.ok) throw new Error('the real model does not validate; run npm run validate');
  const version = (JSON.parse(read('package.json')) as { version: string }).version;
  model = normalise(loaded.model, version);
  gaps = read('docs/gaps.md');
  render = renderModelMd(model, gaps);
});

/** The text of one `## <id>` section of a render. */
function sectionOf(text: string, id: string): string {
  const start = text.indexOf(`\n## ${id}\n`);
  if (start < 0) throw new Error(`no section for ${id}`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** A deep copy of the real model that a test may change. */
const clone = (): Model => structuredClone(model);

describe('docs/model.md freshness (T-04-23)', () => {
  test('the committed file equals a fresh render of the real model', () => {
    const committed = read('docs/model.md');
    expect(committed === render, 'docs/model.md is out of date; run npm run build:docs').toBe(true);
  });

  test('the render is deterministic', () => {
    expect(renderModelMd(model, gaps)).toBe(render);
  });
});

describe('structure', () => {
  test('starts with the title and the generated-file notice, with no timestamp', () => {
    const head = render.split('\n').slice(0, 3).join('\n');
    expect(head.startsWith('# Model documentation\n')).toBe(true);
    expect(head).toContain('npm run build:docs');
    expect(head).toContain(`contract ${model.contract}`);
    expect(head).toContain(model.model_version);
    expect(head).toContain('CC-BY-4.0');
    expect(head).toContain('LICENSE-model');
    expect(render).not.toMatch(/\b20[0-9]{2}-[0-9]{2}-[0-9]{2}T/);
  });

  test('the sections are the schemes in codepoint order of the id, and every `##` is a scheme', () => {
    const ids = Object.keys(model.schemes).sort(compare);
    const headings = [...render.matchAll(/^## (.*)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(ids);
  });

  test('the table of contents links every scheme section and has no heading of its own', () => {
    const ids = Object.keys(model.schemes).sort(compare);
    const before = render.slice(0, render.indexOf('\n## '));
    for (const id of ids) expect(before).toContain(`[${id}](#${slug(id)})`);
    expect(before.match(/^#+ /gm)).toEqual(['# ']);
  });
});

describe('eori section', () => {
  test('lists the header claims, patterns, rule, persistence and mandatory with certainty and source', () => {
    const text = sectionOf(render, 'eori');
    const scheme = model.schemes.eori;
    if (scheme === undefined) throw new Error('no eori scheme');
    expect(text).toContain('Economic Operators Registration and Identification number');
    expect(text).toContain('EORI-nummer');
    expect(text).toContain('national-customs-authority');
    expect(text).toContain('identifier');
    expect(text).toContain('public-restricted-details');
    expect(text).toContain('eori-nl-from-rsin');
    expect(text).toContain(mdSpan(JSON.stringify(scheme.rules?.[0]?.transform)));
    expect(text).toContain(`${mdSpan('001469630')} → ${mdSpan('NL001469630')}`);
    expect(text).toContain('derived-from');
    expect(text).toContain('economic-operator');
    expect(text).toContain('yes, for cross-border trading involving EU customs');
    for (const event of scheme.persistence ?? []) expect(text).toContain(event.event);
    expect(scheme.persistence).toHaveLength(6);
    expect(text).toContain('Regulation (EU) No 952/2013');
    expect(text).toContain('certainty: likely');
    expect(text).toContain('certainty: certain');
    expect(text).toContain('source: [commission-eori](https://');
    expect(text).toContain('Open questions in docs/gaps.md:');
  });

  test('the three format patterns are code spans in authored order, each with a condition where it has one', () => {
    const text = sectionOf(render, 'eori');
    const regexes = (model.schemes.eori?.format?.patterns ?? []).map((entry) => entry.regex);
    expect(regexes).toHaveLength(3);
    const positions = regexes.map((regex) => text.indexOf(mdSpan(regex)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain(mdSpan('entity_form sole-proprietorship'));
    expect(text).toContain(mdSpan('issuing_country NL'));
  });

  test('links the EORI level claims entry of docs/gaps.md', () => {
    expect(sectionOf(render, 'eori')).toContain(
      '[EORI level claims of SPEC §10 (DEC-050)](gaps.md#eori-level-claims-of-spec-10-dec-050)',
    );
  });
});

describe('other sections', () => {
  test('vat-nl checksum entries show their `over` as a code span', () => {
    const text = sectionOf(render, 'vat-nl');
    const checksum = model.schemes['vat-nl']?.format?.checksum ?? [];
    expect(checksum.length).toBeGreaterThan(0);
    for (const entry of checksum) {
      expect(text).toContain(mdSpan(entry.algorithm));
      expect(text).toContain(mdSpan(JSON.stringify(entry.over)));
    }
  });

  test('bsn trust sub-scores are written as null, not 0', () => {
    const text = sectionOf(render, 'bsn');
    const trust = text.split('\n').find((line) => line.includes('Trust'));
    expect(trust).toBeDefined();
    expect(trust).toContain('legal_basis null');
    expect(trust).toContain('verifiability null');
    expect(trust).not.toMatch(/ 0\b/);
  });

  test('a scheme with no gap entry says none', () => {
    const quiet = Object.keys(model.schemes).filter(
      (id) => gapLinksFor(gapSections(gaps), id).length === 0,
    );
    for (const id of quiet)
      expect(sectionOf(render, id)).toContain('Open questions in docs/gaps.md: none');
  });

  test('every scheme section ends with its open-questions line', () => {
    for (const id of Object.keys(model.schemes)) {
      expect(sectionOf(render, id).trimEnd().split('\n').at(-1)).toMatch(
        /^Open questions in docs\/gaps\.md: /,
      );
    }
  });
});

describe('gap anchors', () => {
  const headings = [...gapsHeadings(readFileSync(join(REPO_ROOT, 'docs', 'gaps.md'), 'utf8'))];

  function gapsHeadings(text: string): string[] {
    return text.split('\n').flatMap((line) => (line.startsWith('## ') ? [line.slice(3)] : []));
  }

  test('every gaps.md link in the render resolves to the slug of a `##` heading', () => {
    const seen = new Map<string, number>();
    const slugs = new Set<string>();
    for (const heading of headings) {
      const base = slug(heading);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      slugs.add(count === 0 ? base : `${base}-${count}`);
    }
    const anchors = [...render.matchAll(/\(gaps\.md#([^)\s]+)\)/g)].map((match) => match[1] ?? '');
    expect(anchors.length).toBeGreaterThanOrEqual(Object.keys(model.schemes).length);
    for (const anchor of anchors) expect(slugs.has(anchor), anchor).toBe(true);
  });

  test('the Appendix B and human-check sections are never linked', () => {
    expect(render).not.toContain('gaps.md#appendix-b-verification');
    expect(render).not.toContain('gaps.md#end-of-phase-human-check');
  });

  test('docs/gaps.md has no duplicate heading slug', () => {
    const slugs = gapSections(gaps).map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('slug follows the GitHub rule', () => {
    expect(slug('ADMS domain and range of the issuer predicate (DEC-059)')).toBe(
      'adms-domain-and-range-of-the-issuer-predicate-dec-059',
    );
    expect(slug('Snake_case and `code` §10')).toBe('snake_case-and-code-10');
  });

  test('a repeated heading is numbered -1, -2 and the procedure sections are skipped', () => {
    const text = [
      '# Gaps',
      '## Appendix B verification (DEC-049)',
      'procedure about `eori`',
      '## End-of-phase human check',
      'procedure about `eori`',
      '## Same heading',
      'one `a`',
      '## Same heading',
      'two `a`',
      '```',
      '## Not a heading',
      '```',
      '### Sub-heading of the second',
      'more `b`',
      '## Same heading',
      'three',
    ].join('\n');
    const sections = gapSections(text);
    expect(sections.map((section) => section.slug)).toEqual([
      'same-heading',
      'same-heading-1',
      'same-heading-2',
    ]);
    expect(gapLinksFor(sections, 'eori')).toEqual([]);
    expect(gapLinksFor(sections, 'a').map((section) => section.slug)).toEqual([
      'same-heading',
      'same-heading-1',
    ]);
    expect(gapLinksFor(sections, 'b').map((section) => section.slug)).toEqual(['same-heading-1']);
  });

  test('a heading that names the id in backticks is linked too', () => {
    const sections = gapSections('## About `x`\nbody\n## Other\nbody');
    expect(gapLinksFor(sections, 'x').map((section) => section.slug)).toEqual(['about-x']);
  });
});

describe('personal-number guard (T-04-22)', () => {
  test('scanText finds no un-allow-listed nine-digit value in the render', () => {
    const allow = parseAllowlist(read('tools/guards/personal-number-allowlist.txt'));
    expect(scanText(render, allow)).toEqual([]);
  });
});

describe('escaping (T-04-21)', () => {
  test('free text cannot inject HTML, a link or a table break', () => {
    const changed = clone();
    const eori = changed.schemes.eori;
    if (eori?.mandatory === undefined) throw new Error('no eori mandatory');
    eori.mandatory = { ...eori.mandatory, text: 'x', note: '<b>bold</b> [x](y) | a * b _c_' };
    eori.label = { en: '<script>alert(1)</script>', nl: '[x](javascript:alert(1))' };
    const text = renderModelMd(changed, gaps);
    expect(text).not.toContain('<b>');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('[x](y)');
    expect(text).not.toContain('[x](javascript:');
    expect(text).toContain('\\<b\\>bold\\</b\\> \\[x\\](y)');
  });

  test('a regex with | or * stays inside one code span', () => {
    const changed = clone();
    const entry = changed.schemes.eori?.format?.patterns?.[0];
    if (entry === undefined) throw new Error('no eori pattern');
    const regex = '^(a|b)*[`x]+$';
    Object.assign(entry, { regex });
    const text = renderModelMd(changed, gaps);
    expect(text).toContain(mdSpan(regex));
    expect(mdSpan(regex)).toBe('``^(a|b)*[`x]+$``');
  });

  test('a source link is written only for an http(s) url or eli', () => {
    const changed = clone();
    const source = changed.sources['commission-eori'];
    const other = changed.sources['douane-eori-nl'];
    if (source === undefined || other === undefined) throw new Error('missing sources');
    source.url = 'javascript:alert(1)';
    delete source.eli;
    delete other.eli;
    other.url = 'https://example.org/a(b) c';
    const text = renderModelMd(changed, gaps);
    expect(text).not.toContain('](javascript:');
    expect(text).toContain('source: `commission-eori`');
    expect(text).toContain('[douane-eori-nl](https://example.org/a%28b%29%20c)');
  });

  test('a source id that is not in the model is a code span, not a link', () => {
    const changed = clone();
    const eori = changed.schemes.eori;
    if (eori?.mandatory === undefined) throw new Error('no eori mandatory');
    eori.mandatory = { ...eori.mandatory, source: 'no-such-source' };
    expect(renderModelMd(changed, gaps)).toContain('source: `no-such-source`');
  });
});
