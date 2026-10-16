import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, REPO_ROOT } from 'uio-config';
import type { RawModel } from 'uio-validate';

export type BuildRootOptions = {
  /** The `npm_scope` written to the root's config.yaml; defaults to the real scope. */
  configScope?: string;
  /** The scope of the three package names; defaults to the real scope. */
  packageScope?: string;
  /** `'copy'` (default) copies the real `model/`; `'none'` leaves the root without a model. */
  model?: 'copy' | 'none';
};

const roots: string[] = [];

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Test helper: a temporary repository root for build CLI tests. config.yaml is the real one with
 * only its `npm_scope` replaced; the three package manifests carry `packageScope`; `model/`,
 * `ontology/`, `shapes/` and `docs/gaps.md` are copied from the real repository when they exist.
 * The namespace is never written as a literal here: it comes from the real config.yaml text.
 */
export function makeBuildRoot(options: BuildRootOptions = {}): string {
  const real = loadConfig(REPO_ROOT);
  const configScope = options.configScope ?? real.npm_scope;
  const packageScope = options.packageScope ?? real.npm_scope;
  const root = mkdtempSync(join(tmpdir(), 'uio-build-'));
  roots.push(root);

  const configText = readFileSync(join(REPO_ROOT, 'config.yaml'), 'utf8');
  write(
    root,
    'config.yaml',
    configText.replace(/^npm_scope:.*$/m, () => `npm_scope: "${configScope}"`),
  );

  const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  write(
    root,
    'package.json',
    `${JSON.stringify({ name: rootPackage.name, version: rootPackage.version, workspaces: ['packages/*'] })}\n`,
  );
  for (const [dir, suffix] of [
    ['engine', 'engine'],
    ['mcp', 'mcp-server'],
    ['web', 'web'],
  ] as const) {
    write(
      root,
      `packages/${dir}/package.json`,
      `${JSON.stringify({ name: `${packageScope}/${suffix}`, version: '0.0.0' }, null, 2)}\n`,
    );
  }

  const copy = (rel: string): void => {
    if (existsSync(join(REPO_ROOT, rel))) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      cpSync(join(REPO_ROOT, rel), join(root, rel), { recursive: true });
    }
  };
  if ((options.model ?? 'copy') === 'copy') copy('model');
  copy('ontology');
  copy('shapes');
  copy('docs/gaps.md');
  return root;
}

/** Test helper: remove every root made by `makeBuildRoot` (call from `afterEach` or `afterAll`). */
export function cleanupBuildRoots(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** A small RFC 4180 reader: quoted cells with doubled quotes, LF or CRLF records. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(cell);
      cell = '';
    } else if (c === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else cell += c;
  }
  return records;
}

/** The namespace of the synthetic mini-model; never the project namespace. */
export const MINI_NAMESPACE = 'https://example.org/ns/';

const MINI_SOURCE = 'mini-analysis';

/** A statement's own source and certainty. */
const cited = (certainty: 'certain' | 'likely' | 'possible') => ({
  source: MINI_SOURCE,
  certainty,
});

const miniMember = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: { en: label },
  definition: { en: `${label}, a synthetic member for the golden files.` },
  ...extra,
});

const miniVocab = (id: string, label: string, values: unknown[]) => ({
  id,
  label: { en: label },
  values,
});

/**
 * Test helper: a synthetic raw model written in code for the golden files (BLD-05). Every value is
 * made up: namespace-free, no real data, no run of nine digits. It uses a bare and a long-form
 * header field, a pattern with a condition, a checksum with `over`, level, role, an applicability
 * entry with two statuses, persistence, a relation, a legal basis with a url, a validation source,
 * a mandatory text, trust with one null sub-score, `context_from` and a rule with one example.
 */
export function miniRawModel(): RawModel {
  return {
    vocab: {
      certainty: miniVocab('certainty', 'Certainty', [
        miniMember('certain', 'Certain', { rank: 3 }),
        miniMember('likely', 'Likely', { rank: 2 }),
        miniMember('possible', 'Possible', { rank: 1 }),
      ]),
      'applicability-status': miniVocab('applicability-status', 'Applicability status', [
        miniMember('issued', 'Issued', { inherits_down: false }),
        miniMember('recognised', 'Recognised', { inherits_down: true }),
      ]),
      checksum: miniVocab('checksum', 'Checksum algorithm', [
        miniMember('mini-check', 'Mini check'),
      ]),
      'condition-context': miniVocab('condition-context', 'Condition context', []),
      'country-prefix': miniVocab('country-prefix', 'Country prefix', [
        { prefix: 'AA', jurisdiction: 'AA', ...cited('likely') },
      ]),
      'entity-form': miniVocab('entity-form', 'Entity form', [
        miniMember('company', 'Company'),
        miniMember('person', 'Person'),
      ]),
      level: miniVocab('level', 'Level', [miniMember('legal-entity', 'Legal entity')]),
      'persistence-event': miniVocab('persistence-event', 'Persistence event', [
        miniMember('merger', 'Merger'),
      ]),
      'relation-kind': miniVocab('relation-kind', 'Relation kind', [
        miniMember('derived-from', 'Derived from'),
      ]),
      role: miniVocab('role', 'Role', [miniMember('taxpayer', 'Taxpayer')]),
    },
    jurisdictions: {
      AA: { id: 'AA', label: { en: 'Aaland' } },
      BB: {
        id: 'BB',
        label: { en: 'Bbland' },
        part_of: [{ jurisdiction: 'AA', ...cited('certain') }],
      },
    },
    sources: {
      [MINI_SOURCE]: {
        id: MINI_SOURCE,
        title: 'Mini analysis for the golden files',
        type: 'analysis',
        date: '2026-01-01',
        method: 'Written by hand for the golden files; it describes no real identifier.',
        url: 'https://example.org/mini',
      },
    },
    authorities: {
      'mini-authority': {
        id: 'mini-authority',
        kind: 'class',
        label: { en: 'Mini authority' },
        definition: { en: 'An authority that exists only in the golden files.' },
      },
      'mini-authority-aa': {
        id: 'mini-authority-aa',
        kind: 'instance',
        label: { en: 'Mini authority AA' },
        instance_of: 'mini-authority',
        jurisdiction: 'AA',
        ...cited('likely'),
      },
    },
    schemes: {
      alpha: {
        id: 'alpha',
        label: { en: 'Alpha identifier', nl: 'Alfa-nummer' },
        kind: 'identifier',
        issuer: { value: 'mini-authority', ...cited('likely') },
        jurisdiction: 'AA',
        abbreviation: 'ALP',
        availability: 'public',
        peppol_eas: null,
        sources: { default: MINI_SOURCE },
        scope: { en: 'Used only in the golden files.' },
        notes: { en: 'A synthetic scheme.' },
        format: {
          patterns: [
            { regex: '^[A-Z]{2}[0-9]{4}$', ...cited('certain') },
            {
              regex: '^[A-Z]{2}[0-9]{5}$',
              condition: { issuing_country: 'AA', entity_form: 'company' },
              note: 'A longer form for companies.',
              ...cited('likely'),
            },
          ],
          checksum: [
            {
              algorithm: 'mini-check',
              over: [{ capture: { regex: '^[A-Z]{2}([0-9]{4})$', group: 1 } }],
              ...cited('possible'),
            },
          ],
          examples_valid: ['AB1234'],
          examples_invalid: ['1234AB'],
        },
        level: [{ value: 'legal-entity', ...cited('certain') }],
        roles: [{ value: 'taxpayer', ...cited('certain') }],
        applicability: [
          { jurisdiction: 'AA', status: ['issued', 'recognised'], ...cited('certain') },
        ],
        persistence: [{ event: 'merger', behaviour: 'Unchanged', ...cited('likely') }],
        relations: [{ kind: 'derived-from', target: 'beta', ...cited('certain') }],
        legal_basis: [
          {
            title: 'Mini act, article 1',
            url: 'https://example.org/mini/act',
            ...cited('certain'),
          },
        ],
        validation_source: {
          label: 'Mini register lookup',
          url: 'https://example.org/mini/lookup',
          ...cited('certain'),
        },
        mandatory: { text: 'Only in the golden files.', ...cited('likely') },
        trust: {
          legal_basis: 1,
          registration_quality: null,
          verifiability: 0,
          crosswalks: 1,
          lifecycle: 1,
          ...cited('likely'),
        },
        context_from: {
          issuing_country: {
            capture: { regex: '^([A-Z]{2})', group: 1 },
            map: 'country-prefix',
            ...cited('certain'),
          },
        },
      },
      beta: {
        id: 'beta',
        label: { en: 'Beta identifier' },
        kind: 'identifier',
        issuer: 'mini-authority',
        jurisdiction: 'BB',
        abbreviation: 'BET',
        availability: 'public',
        peppol_eas: null,
        sources: { default: MINI_SOURCE },
        format: {
          patterns: [{ regex: '^ZZ[A-Z]{2}[0-9]{4}$', ...cited('certain') }],
          examples_valid: ['ZZAB1234'],
        },
        rules: [
          {
            id: 'beta-from-alpha',
            input: 'alpha',
            output: 'beta',
            transform: [{ add_prefix: 'ZZ' }],
            condition: { entity_form: 'company' },
            examples: [{ in: 'AB1234', out: 'ZZAB1234' }],
            ...cited('certain'),
          },
        ],
      },
    },
  };
}
