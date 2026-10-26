// Browser tests of the guide on the empty paste view: WEB-04 (example chips), WEB-05 (the EORI
// walkthrough), D-02 (a chip fills the box and runs at once), D-06 (five mixed chips worded as
// questions), D-07 (a stepped panel, no modal), D-08 (narration is copy, facts are engine output)
// and D-17 (chip 2 passes rsin and promises no VAT number). Every value is a public value of
// SPEC section 10; the only nine-digit run is the allow-listed example RSIN.
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeViolations } from './support.ts';

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

const CONTRAST_VALUE = 'DE123456789012345';
const MODAL = '[role="dialog"], [role="alertdialog"], dialog, [aria-modal]';

/** Tab from the top of the page until the control with this accessible name has focus. */
async function tabTo(page: Page, name: string) {
  const target = page.getByRole('button', { name });
  for (let presses = 0; presses < 40; presses += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test('WEB-05 and D-07: the walkthrough steps through the SPEC section 10 case by keyboard and can be skipped', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Take the EORI walkthrough' })).toBeVisible();
  await tabTo(page, 'Take the EORI walkthrough');
  await page.keyboard.press('Enter');

  const panel = page.getByRole('region', { name: 'EORI walkthrough' });
  const box = page.getByRole('textbox', { name: INPUT_NAME });
  const recognition = page.getByRole('region', { name: 'Recognition' });
  const derivations = page.getByRole('region', { name: 'Derivations' });
  const consistency = page.getByRole('region', { name: 'Consistency' });

  // Step 1: one value, Recognition marked and in view; focus is on the panel, not lost.
  await expect(panel).toContainText('Step 1 of 4');
  await expect(page.getByRole('heading', { name: 'EORI walkthrough' })).toBeFocused();
  await expect(box).toHaveValue(EORI_VALUE);
  await expect(recognition).toHaveClass(/walkthrough-target/);
  await expect(recognition).toContainText('Walkthrough step 1');
  await expect(recognition.locator('[data-scheme="eori"]').first()).toBeVisible();
  await expect(recognition.getByRole('heading', { name: 'Recognition' })).toBeInViewport();
  await expect(page.locator(MODAL)).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Back' })).toBeDisabled();

  // Step 2: the RSIN treated as an RSIN, Derivations marked, an eori derivation line.
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Next' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Step 2 of 4');
  await expect(box).toHaveValue(RSIN_VALUE);
  await expect(derivations).toHaveClass(/walkthrough-target/);
  await expect(recognition).not.toHaveClass(/walkthrough-target/);
  await expect(
    derivations.locator('[data-key="derive.derivation"][data-scheme="eori"]'),
  ).toBeVisible();
  await expect(recognition.getByRole('button', { name: /\(rsin\)$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator(MODAL)).toHaveCount(0);

  // Back returns to step 1; Back is then disabled, so focus goes to Next instead of being lost.
  await page.keyboard.press('Shift+Tab');
  await expect(panel.getByRole('button', { name: 'Back' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Step 1 of 4');
  await expect(box).toHaveValue(EORI_VALUE);
  await expect(panel.getByRole('button', { name: 'Next' })).toBeFocused();

  // Next twice: step 3 is the contrast, with no rsin and no vat-nl derivation line.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Step 3 of 4');
  await expect(box).toHaveValue(CONTRAST_VALUE);
  await expect(derivations).toHaveClass(/walkthrough-target/);
  await expect(derivations.locator('[data-key="derive.derivation"]')).toHaveCount(0);
  await expect(derivations.locator('[data-scheme="rsin"], [data-scheme="vat-nl"]')).toHaveCount(0);
  await expect(page.locator(MODAL)).toHaveCount(0);

  // Step 4: all three together, three consistent pairs, and Next now reads Finish.
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Step 4 of 4');
  await expect(box).toHaveValue(`${EORI_VALUE}\n${VAT_VALUE}\n${RSIN_VALUE}`);
  await expect(consistency).toHaveClass(/walkthrough-target/);
  const pairs = consistency.locator('[data-pair]');
  await expect(pairs).toHaveCount(3);
  for (const pair of await pairs.all()) await expect(pair).toContainText('consistent');
  await expect(panel.getByRole('button', { name: 'Finish' })).toBeFocused();
  await expect(page.locator(MODAL)).toHaveCount(0);

  // Skip closes the panel and puts focus back on the opener; the results and the box stay.
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Skip' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Take the EORI walkthrough' })).toBeFocused();
  await expect(consistency).not.toHaveClass(/walkthrough-target/);
  await expect(box).toHaveValue(`${EORI_VALUE}\n${VAT_VALUE}\n${RSIN_VALUE}`);
  for (const value of [EORI_VALUE, VAT_VALUE, RSIN_VALUE, CONTRAST_VALUE]) {
    expect(page.url()).not.toContain(value);
  }
});

test('D-07: Skip on the first step and Finish on the last both close the panel and return focus to the opener', async ({
  page,
}) => {
  await page.goto('./');
  const opener = page.getByRole('button', { name: 'Take the EORI walkthrough' });
  await opener.click();
  const panel = page.getByRole('region', { name: 'EORI walkthrough' });
  await panel.getByRole('button', { name: 'Skip' }).click();
  await expect(panel).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  for (let next = 0; next < 3; next += 1) await panel.getByRole('button', { name: 'Next' }).click();
  await panel.getByRole('button', { name: 'Finish' }).click();
  await expect(panel).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('D-02: a walkthrough step announces itself and its results once, in the one live region', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Take the EORI walkthrough' }).click();
  const status = page.locator('[role="status"]');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText('Step 1 of 4: One value. Results ready for 1 value.');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(status).toHaveText(
    'Step 2 of 4: An RSIN treated as an RSIN. Results ready for 1 value.',
  );
  await expect(page.locator('[aria-live]')).toHaveCount(1);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`WEB-08: axe with the walkthrough open, ${scheme} colour scheme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('English, every step', async ({ page }) => {
      await page.goto('./');
      await expectNoAxeViolations(page, 'the empty state with chips and the walkthrough opener');
      await page.getByRole('button', { name: 'Take the EORI walkthrough' }).click();
      const panel = page.getByRole('region', { name: 'EORI walkthrough' });
      for (let step = 1; step <= 4; step += 1) {
        await expect(panel).toContainText(`Step ${step} of 4`);
        await expectNoAxeViolations(page, `the English walkthrough, step ${step}`);
        if (step < 4) await panel.getByRole('button', { name: 'Next' }).click();
      }
    });

    test('Dutch, every step', async ({ page }) => {
      await page.goto('./?lang=nl');
      await page.getByRole('button', { name: 'Volg de EORI-rondleiding' }).click();
      const panel = page.getByRole('region', { name: 'EORI-rondleiding' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
      for (let step = 1; step <= 4; step += 1) {
        await expect(panel).toContainText(`Stap ${step} van 4`);
        await expectNoAxeViolations(page, `the Dutch walkthrough, step ${step}`);
        if (step < 4) await panel.getByRole('button', { name: 'Volgende' }).click();
      }
    });
  });
}

test('the Dutch empty state shows the five questions in Dutch', async ({ page }) => {
  await page.goto('./?lang=nl');
  await expect(
    page.getByRole('list', { name: 'Voorbeeldvragen' }).getByRole('listitem'),
  ).toHaveText([
    'Wat is dit nummer?',
    'Welk EORI-nummer hoort bij dit RSIN?',
    'Horen deze nummers bij elkaar?',
    'Wie geeft een EORI-nummer uit en waar controleer ik het?',
    'Hoe hangen een RSIN en een EORI-nummer samen?',
  ]);
  await expectNoAxeViolations(page, 'the Dutch empty state');
});
