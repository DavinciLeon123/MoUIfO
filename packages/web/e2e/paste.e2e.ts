// Tracer browser test of the guided website: D-02 (the engine runs on Explain only), D-05 (the
// privacy sentence directly under the input), WEB-01 (paste and recognition) and WEB-10 (CSP,
// same-origin requests). The only nine-digit run used is inside the public example value of
// SPEC section 10.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { UI_EN } from '../src/i18n/ui.en.ts';
import { UI_NL } from '../src/i18n/ui.nl.ts';
import { expectNoAxeViolations } from './support.ts';

type RuntimeModel = { schemes: Record<string, { format?: { examples_valid?: string[] } }> };
const MODEL = JSON.parse(
  readFileSync(new URL('../../../dist/model.json', import.meta.url), 'utf8'),
) as RuntimeModel;

function example(id: string): string {
  const value = MODEL.schemes[id]?.format?.examples_valid?.[0];
  if (value === undefined) throw new Error(`no examples_valid for ${id}`);
  return value;
}

// The model's public examples, read at runtime: no identifier digits are committed here (DEC-025).
const KVK_EXAMPLE = example('kvk-number');
const VAT_NL_EXAMPLE = example('vat-nl');

const VALUE = 'NL001469630B01';
const SENTENCE = 'Values are processed in your browser only and never stored or sent.';

test('a pasted value is recognised after Explain, with each certainty in words', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Identifiers, one per line' }).fill(VALUE);
  await page.getByRole('button', { name: 'Explain' }).click();
  const recognition = page.getByRole('region', { name: 'Recognition' });
  await expect(recognition.getByRole('listitem').filter({ hasText: '(eori)' })).toContainText(
    'Certain',
  );
  await expect(recognition.getByRole('listitem').filter({ hasText: '(vat-nl)' })).toContainText(
    'Likely',
  );
  await expect(recognition.getByRole('listitem').filter({ hasText: '(vat)' })).toContainText(
    'Likely',
  );
});

test('the privacy sentence is the description of the input and follows it directly', async ({
  page,
}) => {
  await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Identifiers, one per line' });
  const describedBy = await input.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  const description = page.locator(`[id="${describedBy}"]`);
  await expect(description).toHaveText(SENTENCE);
  await expect(input.locator('xpath=following-sibling::*[1]')).toHaveAttribute(
    'id',
    describedBy ?? '',
  );
});

const EORI_VALUE = 'NL001469630';
const RSIN_VALUE = '001469630';
const INPUT = 'Identifiers, one per line';

test('the EORI triple gives the four sections in order, the derived value and every pair', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByRole('textbox', { name: INPUT })
    .fill(`  ${EORI_VALUE}  \n\n${VALUE}\n${RSIN_VALUE}  `);
  await page.getByRole('button', { name: 'Explain' }).click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Normalised input',
    'Recognition',
    'Derivations',
    'Consistency',
  ]);

  const normalised = page.getByRole('region', { name: 'Normalised input' });
  const items = normalised.getByRole('listitem');
  await expect(items).toHaveText([EORI_VALUE, VALUE, RSIN_VALUE]);
  expect(await normalised.locator('ol').count()).toBe(1);

  const pairs = page.getByRole('region', { name: 'Consistency' }).locator('[data-pair]');
  await expect(pairs).toHaveCount(3);
  for (const pair of await pairs.all()) await expect(pair).toContainText('consistent');

  const derivations = page.getByRole('region', { name: 'Derivations' });
  const firstValue = derivations.locator('div').first();
  await expect(
    firstValue.locator('[data-key="derive.derivation"][data-scheme="rsin"]'),
  ).toContainText(RSIN_VALUE);
});

test('one value gives the reason that consistency needs two', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(VALUE);
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('region', { name: 'Consistency' })).toContainText(
    'Needs at least two values.',
  );
});

test('a lower-case value is shown and sent as typed, so no scheme matches it', async ({ page }) => {
  const lower = VALUE.toLowerCase();
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(lower);
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(
    page.getByRole('region', { name: 'Normalised input' }).getByRole('listitem'),
  ).toHaveText([lower]);
  await expect(page.getByRole('region', { name: 'Recognition' })).toContainText(
    'No scheme in the model has this format.',
  );
});

test('the CSP meta comes first, requests stay same-origin and the URL never holds the value', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const origins: string[] = [];
  page.on('request', (request) => origins.push(new URL(request.url()).origin));
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Identifiers, one per line' }).fill(VALUE);
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('region', { name: 'Recognition' })).toContainText('(eori)');
  const first = page.locator('head > *').first();
  await expect(first).toHaveAttribute('http-equiv', 'Content-Security-Policy');
  expect(await first.getAttribute('content')).toContain("connect-src 'none'");
  expect(origins.length).toBeGreaterThan(0);
  expect(origins.every((entry) => entry === origin)).toBe(true);
  expect(page.url()).not.toContain(VALUE);
});

const TRIPLE = `${EORI_VALUE}\n${VALUE}\n${RSIN_VALUE}`;

test('a conclusion opens by keyboard to its sourced steps and ends with How to verify', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(TRIPLE);
  await page.getByRole('button', { name: 'Explain' }).click();
  const conclusion = page
    .getByRole('region', { name: 'Consistency' })
    .locator('.conclusion')
    .first();
  const summary = conclusion.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(conclusion.locator('details')).toHaveAttribute('open', '');
  const steps = conclusion.locator('ol.steps > li');
  expect(await steps.count()).toBeGreaterThan(0);
  await expect(steps.filter({ hasText: 'Source:' }).first()).toBeVisible();
  const verify = conclusion.locator('p.verify');
  await expect(verify).toContainText('How to verify');
  expect(await verify.locator('a').count()).toBeGreaterThan(0);
});

test('external links are safe, show their host and never hold a pasted value', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(TRIPLE);
  await page.getByRole('button', { name: 'Explain' }).click();
  const links = await page.locator('a[target="_blank"]').evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      rel: anchor.getAttribute('rel') ?? '',
      text: anchor.textContent ?? '',
      href: (anchor as HTMLAnchorElement).href,
    })),
  );
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const url = new URL(link.href);
    expect(link.rel).toContain('noopener');
    expect(link.rel).toContain('noreferrer');
    expect(['http:', 'https:']).toContain(url.protocol);
    expect(link.text).toContain(url.host);
    expect(link.text.toLowerCase()).toMatch(/opens external (site|register)/);
    for (const pasted of [EORI_VALUE, VALUE, RSIN_VALUE]) expect(link.href).not.toContain(pasted);
  }
});

test('every certainty badge shows a word and a value derived as eori leads to its register', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(TRIPLE);
  await page.getByRole('button', { name: 'Explain' }).click();
  const badges = await page.locator('.badge').allTextContents();
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) expect(badge).toMatch(/\b(Certain|Likely|Possible)\b/);

  const verify = page
    .getByRole('region', { name: 'Derivations' })
    .locator('div')
    .first()
    .locator('[data-key="derive.verify-through"][data-scheme="eori"]')
    .locator('p.verify');
  const host = await verify
    .locator('a[target="_blank"]')
    .first()
    .evaluate((anchor) => new URL((anchor as HTMLAnchorElement).href).host);
  expect(host).toBe('ec.europa.eu');
});

test('D-03 and D-17: a bare nine-digit value shows its candidates, and Treat as derives only after the choice', async ({
  page,
}) => {
  await page.goto('./');
  const input = page.getByRole('textbox', { name: INPUT });
  await input.fill(RSIN_VALUE);
  await page.getByRole('button', { name: 'Explain' }).click();

  const recognition = page.getByRole('region', { name: 'Recognition' });
  await expect(
    recognition.getByRole('heading', { name: 'Possible personal identifier' }),
  ).toBeVisible();
  await expect(recognition).toContainText('cannot be told apart by checksum');
  const buttons = recognition.getByRole('button', { name: /^Treat as / });
  await expect(buttons).toHaveCount(4);
  const names = await buttons.evaluateAll((all) =>
    all.map((each) => (each.textContent ?? '').replace(/^.*\((.*)\)$/, '$1')),
  );
  expect(names).toEqual(['bsn', 'duns', 'fi-number', 'rsin']);
  for (const button of await buttons.all())
    await expect(button).toHaveAttribute('aria-pressed', 'false');

  const derivations = page.getByRole('region', { name: 'Derivations' });
  await expect(derivations).toContainText(
    'This value may be a personal identifier. Choose Treat as above to derive from it.',
  );
  await expect(derivations.locator('[data-key="derive.derivation"]')).toHaveCount(0);

  const rsin = recognition.getByRole('button', { name: /\(rsin\)$/ });
  await rsin.click();
  await expect(rsin).toHaveAttribute('aria-pressed', 'true');
  await expect(
    derivations.locator('[data-key="derive.derivation"][data-scheme="eori"]'),
  ).toBeVisible();
  await expect(
    derivations.locator('[data-key="derive.derivation"][data-scheme="oin"]'),
  ).toBeVisible();
  await expect(derivations).toContainText('your choice');
  await expect(
    recognition.getByRole('heading', { name: 'Possible personal identifier' }),
  ).toBeVisible();

  await expect(input).toHaveValue(RSIN_VALUE);
  expect(page.url()).not.toContain(RSIN_VALUE);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`WEB-08: axe on the paste view, ${scheme} colour scheme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('empty', async ({ page }) => {
      await page.goto('./');
      await expect(page.getByRole('button', { name: 'Explain' })).toBeVisible();
      await expectNoAxeViolations(page, 'the empty paste view');
    });

    test('the EORI triple explained with one conclusion expanded', async ({ page }) => {
      await page.goto('./');
      await page.getByRole('textbox', { name: INPUT }).fill(TRIPLE);
      await page.getByRole('button', { name: 'Explain' }).click();
      const first = page
        .getByRole('region', { name: 'Consistency' })
        .locator('.conclusion')
        .first();
      await first.locator('summary').click();
      await expect(first.locator('details')).toHaveAttribute('open', '');
      await expectNoAxeViolations(page, 'the explained EORI triple');
    });

    test('the ambiguity set, before and after Treat as', async ({ page }) => {
      await page.goto('./');
      await page.getByRole('textbox', { name: INPUT }).fill(RSIN_VALUE);
      await page.getByRole('button', { name: 'Explain' }).click();
      await expect(
        page.getByRole('heading', { name: 'Possible personal identifier' }),
      ).toBeVisible();
      await expectNoAxeViolations(page, 'the ambiguity set');
      await page.getByRole('button', { name: /\(rsin\)$/ }).click();
      await expect(
        page.locator('[data-key="derive.derivation"][data-scheme="eori"]'),
      ).toBeVisible();
      await expectNoAxeViolations(page, 'the ambiguity set after Treat as rsin');
    });
  });
}

test('D-02: one polite live region that speaks once per run and never while typing', async ({
  page,
}) => {
  await page.goto('./');
  const status = page.locator('[role="status"]');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[role="alert"], [aria-live="assertive"]')).toHaveCount(0);
  const input = page.getByRole('textbox', { name: INPUT });
  await input.fill(TRIPLE);
  await input.pressSequentially(' more');
  await expect(status).toHaveText('');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(status).toHaveText('Results ready for 3 values.');
  await input.pressSequentially('x');
  await input.pressSequentially('y');
  await page.waitForTimeout(300);
  await expect(status).toHaveText('Results ready for 3 values.');
});

const NO_RULE_CASES = [
  {
    lang: 'en',
    start: './',
    input: 'Identifiers, one per line',
    button: 'Explain',
    ui: UI_EN,
    prefix: 'Relation between',
    a: 'Scheme A',
    b: 'Scheme B',
  },
  {
    lang: 'nl',
    start: './?lang=nl',
    input: 'Identificatienummers, één per regel',
    button: 'Uitleggen',
    ui: UI_NL,
    prefix: 'Relatie tussen',
    a: 'Schema A',
    b: 'Schema B',
  },
] as const;

for (const item of NO_RULE_CASES) {
  test(`a no-rule pair says only rules decide and links to the relation view with scheme ids only (${item.lang})`, async ({
    page,
  }) => {
    await page.goto(item.start);
    await page.getByRole('textbox', { name: item.input }).fill(`${KVK_EXAMPLE}\n${VAT_NL_EXAMPLE}`);
    await page.getByRole('button', { name: item.button }).click();

    const pair = page.locator('section[aria-labelledby="consistency-heading"] [data-pair="1-2"]');
    await expect(pair).toContainText(item.ui.outcomeNoRule);
    await expect(pair).toContainText(item.ui.noRuleRelateLead);

    const links = pair.locator('a');
    await expect(links).toHaveCount(3);
    const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs).toEqual([
      '#/relate/kvk-number/eori',
      '#/relate/kvk-number/vat',
      '#/relate/kvk-number/vat-nl',
    ]);
    const digitRuns = [KVK_EXAMPLE, VAT_NL_EXAMPLE].flatMap(
      (value) => value.match(/\d{8,}/g) ?? [],
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^#\/relate\/[a-z0-9-]+\/[a-z0-9-]+$/);
      for (const id of href.split('/').slice(2))
        expect(Object.hasOwn(MODEL.schemes, id)).toBe(true);
      const lower = href.toLowerCase();
      for (const value of [KVK_EXAMPLE, VAT_NL_EXAMPLE])
        expect(lower).not.toContain(value.toLowerCase());
      for (const run of digitRuns) expect(lower).not.toContain(run);
    }
    expect(((await links.nth(2).textContent()) ?? '').startsWith(item.prefix)).toBe(true);

    const status = await page.locator('[role="status"]').textContent();
    for (const value of [KVK_EXAMPLE, VAT_NL_EXAMPLE]) expect(status ?? '').not.toContain(value);

    await expectNoAxeViolations(page, `the no-rule pair (${item.lang})`);

    await links.nth(2).click();
    await expect(page.getByLabel(item.a)).toHaveValue('kvk-number');
    await expect(page.getByLabel(item.b)).toHaveValue('vat-nl');
    expect(new URL(page.url()).hash).toBe('#/relate/kvk-number/vat-nl');
    for (const value of [KVK_EXAMPLE, VAT_NL_EXAMPLE])
      expect(page.url().toLowerCase()).not.toContain(value.toLowerCase());
  });
}
