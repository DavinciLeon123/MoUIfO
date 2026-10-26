// Browser test of the scheme views: WEB-02 (the scheme page shows the sourced description and the
// applicability of every jurisdiction), WEB-06 and D-13 (How to verify is the sourced
// validation_source link or an honest sentence, never an invented register URL) and DEC-041 (a data
// gap reads "no data in the model" and is never turned into a claim). Task 1 covers the EORI page,
// the page of a scheme without a sourced register link and an id that is not in the model.
import { expect, test } from '@playwright/test';

const EORI_LABEL = 'Economic Operators Registration and Identification number';

test('#/schemes/eori shows the sourced description, How to verify and seven jurisdictions', async ({
  page,
}) => {
  await page.goto('./#/schemes/eori');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(EORI_LABEL);

  // The description is grouped by the engine's field labels, each line an expandable conclusion.
  await expect(page.locator('[data-key="describe.issuer"]').first()).toBeVisible();
  await expect(
    page.locator('[data-field="describe.issuer"] h3'),
    'the group label comes from the engine dictionary',
  ).toHaveText('Issuer');

  // D-13: the sourced register link with its host and the external notice.
  const verify = page.getByRole('region', { name: 'How to verify' });
  const link = verify.getByRole('link');
  await expect(link).toHaveCount(1);
  await expect(link).toContainText('ec.europa.eu');
  await expect(link).toContainText('opens external register');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  // DEC-032, DEC-041: one block per jurisdiction of the model.
  const blocks = page.locator('[data-jurisdiction]');
  await expect(blocks).toHaveCount(7);
  const ids = await blocks.evaluateAll((all) =>
    all.map((each) => each.getAttribute('data-jurisdiction')),
  );
  expect(ids).toEqual(['BE', 'EU', 'GB', 'GLOBAL', 'GR', 'NL', 'XI']);

  const nl = page.locator('[data-jurisdiction="NL"]');
  for (const status of ['recognised', 'verifiable']) {
    const line = nl.locator(`[data-status="${status}"]`);
    await expect(line).toHaveAttribute('data-basis', 'inherited');
    await expect(line).toContainText('inherited from European Union');
    await expect(line.locator('[data-key="applicability.inherited"]')).toHaveCount(1);
  }
});

test('the GLOBAL block states a gap as no data in the model and never as not applicable', async ({
  page,
}) => {
  await page.goto('./#/schemes/eori');
  const global = page.locator('[data-jurisdiction="GLOBAL"]');
  const lines = global.locator('[data-status]');
  await expect(lines).toHaveCount(4);
  for (const line of await lines.all()) {
    await expect(line).toHaveAttribute('data-basis', 'no-data');
    await expect(line).toContainText('no data in the model');
  }
  // No statement about applicability is made for a jurisdiction without data.
  await expect(global.locator('[data-key^="applicability."]')).toHaveCount(0);
  // The vocabulary member "Not applicable" is listed like the others, with the gap stated.
  await expect(global.locator('[data-status="not-applicable"]')).toHaveText(
    'Not applicable: no data in the model',
  );
});

test('a scheme without a sourced register link says so and shows no register link', async ({
  page,
}) => {
  await page.goto('./#/schemes/bsn');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const verify = page.getByRole('region', { name: 'How to verify' });
  await expect(verify).toContainText('The model holds no sourced register link for');
  await expect(verify.getByRole('link')).toHaveCount(0);
});

test('an id that is not in the model gives the not-in-the-model page and never echoes it', async ({
  page,
}) => {
  for (const id of ['__proto__', 'constructor', 'nope']) {
    await page.goto(`./#/schemes/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not in the model');
    expect(await page.locator('body').innerText()).not.toContain(id);
  }
});
