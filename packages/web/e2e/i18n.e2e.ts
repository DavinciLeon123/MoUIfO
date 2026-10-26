// Browser test of the bilingual site: D-05 and WEB-10 (the privacy sentence in both languages),
// D-09 (a Dutch engine line without a dictionary entry falls back visibly), D-11 (language from
// ?lang= or the browser, a toggle without reload, nothing stored, only lang in the URL) and WEB-09.
// The only nine-digit run used is inside the public example value of SPEC section 10.
import { expect, test } from '@playwright/test';

const EORI_VALUE = 'NL001469630';
const EORI_FULL = 'NL001469630B01';
const RSIN_VALUE = '001469630';
const TRIPLE = `${EORI_VALUE}\n${EORI_FULL}\n${RSIN_VALUE}`;

const EN_INPUT = 'Identifiers, one per line';
const NL_INPUT = 'Identificatienummers, één per regel';
const NL_SENTENCE =
  'Waarden worden alleen in uw browser verwerkt en nooit opgeslagen of verzonden.';
const NL_HEADINGS = ['Genormaliseerde invoer', 'Herkenning', 'Afleidingen', 'Consistentie'];

test('?lang=nl gives the Dutch page, the Dutch privacy sentence, html lang and title', async ({
  page,
}) => {
  await page.goto('./?lang=nl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UIO-kennismodel');
  const input = page.getByRole('textbox', { name: NL_INPUT });
  const describedBy = await input.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(NL_SENTENCE);
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page).toHaveTitle('UIO-kennismodel');
});

test.describe('a Dutch browser', () => {
  test.use({ locale: 'nl-NL' });

  test('without a parameter the page is Dutch, and ?lang=en still gives English', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('UIO-kennismodel');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await page.goto('./?lang=en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('UIO knowledge model');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('UIO knowledge model');
  });
});

test('an unknown ?lang= value gives English and is never echoed', async ({ page }) => {
  await page.goto('./?lang=xx');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UIO knowledge model');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.locator('body').innerText()).not.toContain('xx');
  expect(await page.title()).not.toContain('xx');
});

test('the toggle switches language in place and keeps the text and the results, storing nothing', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: EN_INPUT }).fill(TRIPLE);
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);

  // A marker on the window survives only if the page is not reloaded.
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });

  await page.getByRole('button', { name: 'Nederlands' }).click();
  expect(await page.evaluate(() => location.search)).toBe('?lang=nl');
  await expect(page.getByRole('textbox', { name: NL_INPUT })).toHaveValue(TRIPLE);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(NL_HEADINGS);
  await expect(page.getByRole('region', { name: 'Herkenning' })).toContainText('(eori)');
  await expect(
    page.getByRole('region', { name: 'Consistentie' }).locator('[data-pair]'),
  ).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);

  const stored = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    url: location.href,
  }));
  expect(stored.local).toBe(0);
  expect(stored.session).toBe(0);
  expect(stored.cookie).toBe('');
  for (const value of [EORI_VALUE, EORI_FULL, RSIN_VALUE]) expect(stored.url).not.toContain(value);

  await page.getByRole('button', { name: 'English' }).click();
  expect(await page.evaluate(() => location.search)).toBe('?lang=en');
  await expect(page.getByRole('textbox', { name: EN_INPUT })).toHaveValue(TRIPLE);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Normalised input',
    'Recognition',
    'Derivations',
    'Consistency',
  ]);
});

test('a Dutch engine line without a dictionary entry shows the English text and says so', async ({
  page,
}) => {
  await page.goto('./?lang=nl');
  await page.getByRole('textbox', { name: NL_INPUT }).fill(EORI_FULL);
  await page.getByRole('button', { name: 'Uitleggen' }).click();
  const line = page
    .getByRole('region', { name: 'Herkenning' })
    .locator('[data-key="recognise.candidate"][data-scheme="eori"]');
  await expect(line.locator('.statement')).toContainText('niet vertaald');
  await expect(line.locator('.statement [lang="en"]')).toContainText('The value has the format of');
});
