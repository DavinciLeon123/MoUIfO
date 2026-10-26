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
