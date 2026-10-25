// Tracer browser test of the guided website: D-02 (the engine runs on Explain only), D-05 (the
// privacy sentence directly under the input), WEB-01 (paste and recognition) and WEB-10 (CSP,
// same-origin requests). The only nine-digit run used is inside the public example value of
// SPEC section 10.
import { expect, test } from '@playwright/test';

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
