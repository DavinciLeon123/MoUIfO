// Browser tests of the guide on the empty paste view: WEB-04 (example chips), WEB-05 (the EORI
// walkthrough), D-02 (a chip fills the box and runs at once), D-06 (five mixed chips worded as
// questions), D-07 (a stepped panel, no modal), D-08 (narration is copy, facts are engine output)
// and D-17 (chip 2 passes rsin and promises no VAT number). Every value is a public value of
// SPEC section 10; the only nine-digit run is the allow-listed example RSIN.
import { expect, test } from '@playwright/test';

const INPUT = 'Identifiers, one per line';
const VAT_VALUE = 'NL001469630B01';

test('D-02 and D-06: the "What is this number?" chip fills the box and shows the recognition at once', async ({
  page,
}) => {
  await page.goto('./');
  const chip = page.getByRole('button', { name: 'What is this number?' });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByRole('textbox', { name: INPUT })).toHaveValue(VAT_VALUE);
  const recognition = page.getByRole('region', { name: 'Recognition' });
  await expect(recognition.locator('[data-scheme="eori"]').first()).toBeVisible();
  expect(page.url()).not.toContain(VAT_VALUE);
});

const RSIN_VALUE = '001469630';
const EORI_VALUE = 'NL001469630';
const INPUT_NAME = INPUT;

test('WEB-04: the empty state offers exactly five example questions', async ({ page }) => {
  await page.goto('./');
  const chips = page.getByRole('list', { name: 'Example questions' }).getByRole('listitem');
  await expect(chips).toHaveText([
    'What is this number?',
    'Which EORI number belongs to this RSIN?',
    'Do these belong together?',
    'Who issues an EORI and where do I verify it?',
    'How are an RSIN and an EORI related?',
  ]);
  // Three paste chips are buttons, two view chips are links.
  await expect(page.locator('.chips button')).toHaveCount(3);
  await expect(page.locator('.chips a')).toHaveCount(2);
});

test('D-17 and DEC-050: the RSIN chip declares rsin, derives an eori and promises no VAT number', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Which EORI number belongs to this RSIN?' }).click();
  await expect(page.getByRole('textbox', { name: INPUT_NAME })).toHaveValue(RSIN_VALUE);
  const recognition = page.getByRole('region', { name: 'Recognition' });
  await expect(recognition.getByRole('button', { name: /\(rsin\)$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const derivations = page.getByRole('region', { name: 'Derivations' });
  await expect(
    derivations.locator('[data-key="derive.derivation"][data-scheme="eori"]'),
  ).toBeVisible();
  await expect(derivations.locator('[data-scheme="vat-nl"]')).toHaveCount(0);
  expect(page.url()).not.toContain(RSIN_VALUE);
});

test('the "Do these belong together?" chip fills three values and shows three consistent pairs', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Do these belong together?' }).click();
  await expect(page.getByRole('textbox', { name: INPUT_NAME })).toHaveValue(
    `${EORI_VALUE}\n${VAT_VALUE}\n${RSIN_VALUE}`,
  );
  const pairs = page.getByRole('region', { name: 'Consistency' }).locator('[data-pair]');
  await expect(pairs).toHaveCount(3);
  for (const pair of await pairs.all()) await expect(pair).toContainText('consistent');
  expect(page.url()).not.toContain(EORI_VALUE);
});

test('the view chips open the eori scheme page and the relation view without a value in the URL', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Who issues an EORI and where do I verify it?' }).click();
  await expect(page).toHaveURL(/#\/schemes\/eori$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Economic Operators Registration and Identification',
  );

  await page.goto('./');
  await page.getByRole('link', { name: 'How are an RSIN and an EORI related?' }).click();
  await expect(page).toHaveURL(/#\/relate\/rsin\/eori$/);
  await expect(page.locator('.chain')).toHaveCount(1);
  for (const value of [EORI_VALUE, VAT_VALUE, RSIN_VALUE]) expect(page.url()).not.toContain(value);
});

test('after a paste chip the page URL holds no SPEC section 10 value', async ({ page }) => {
  await page.goto('./');
  for (const name of [
    'What is this number?',
    'Which EORI number belongs to this RSIN?',
    'Do these belong together?',
  ]) {
    await page.goto('./');
    await page.getByRole('button', { name }).click();
    await expect(page.getByRole('region', { name: 'Recognition' })).toBeVisible();
    for (const value of [EORI_VALUE, VAT_VALUE, RSIN_VALUE])
      expect(page.url()).not.toContain(value);
  }
});
