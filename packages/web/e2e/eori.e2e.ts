// The SPEC section 10 EORI case at web level (WEB-11, success criterion 5). Only the sourced
// expectations are asserted (DEC-050): the EORI is issued by Netherlands Customs and verified
// through the EU EORI validation, the associated RSIN follows (Likely) and is looked up through the
// business register (Certain), the three pairs of the triple are consistent (Likely), the bare RSIN
// is flagged as a possible personal identifier, and no VAT number is derived. The EORI levels and
// the associated VAT number have no source, so nothing here claims either. A foreign EORI
// (DE123456789012345) derives neither an RSIN nor a Dutch VAT number (DEC-071).
//
// Elements are found by `data-key`, `data-scheme` and the value heading, never by position, and
// only `page.goto('./')` is used, so the file runs unchanged against a live PLAYWRIGHT_BASE_URL
// (plan 07-09). The only nine-digit run used is the public example RSIN of SPEC section 10.
import { expect, type Locator, type Page, test } from '@playwright/test';

const INPUT = 'Identifiers, one per line';
const EORI_VALUE = 'NL001469630';
const VAT_VALUE = 'NL001469630B01';
const RSIN_VALUE = '001469630';
const CONTRAST_VALUE = 'DE123456789012345';

async function explain(page: Page, lines: readonly string[]): Promise<void> {
  await page.goto('./');
  await page.getByRole('textbox', { name: INPUT }).fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('region', { name: 'Recognition' })).toBeVisible();
}

/** The block of one value in a section: the div that holds its "Value N: value" heading. */
function valueBlock(section: Locator, position: number, value: string): Locator {
  return section.locator(`div:has(> h3:text-is("Value ${position}: ${value}"))`);
}

/** The line of a conclusion in a block: its key, the scheme it names and the badge of its summary. */
function line(block: Locator, key: string, scheme: string): Locator {
  return block.locator(`.conclusion[data-key="${key}"][data-scheme="${scheme}"]`);
}

test('SPEC section 10 (WEB-11): the Dutch EORI is issued, verified and looked up with the stated certainty', async ({
  page,
}) => {
  await explain(page, [EORI_VALUE, VAT_VALUE, RSIN_VALUE]);
  const derivations = page.getByRole('region', { name: 'Derivations' });
  const first = valueBlock(derivations, 1, EORI_VALUE);

  const issuedBy = line(first, 'derive.issued-by', 'eori');
  await expect(issuedBy).toHaveCount(1);
  await expect(issuedBy.locator('summary .statement')).toContainText('douane-nl');
  await expect(issuedBy.locator('summary .badge')).toContainText('Certain');

  const verifyThrough = line(first, 'derive.verify-through', 'eori');
  await expect(verifyThrough).toHaveCount(1);
  await expect(verifyThrough.locator('summary .statement')).toContainText(
    'EU EORI number validation',
  );
  await expect(verifyThrough.locator('summary .badge')).toContainText('Certain');

  const rsin = line(first, 'derive.derivation', 'rsin');
  await expect(rsin).toHaveCount(1);
  await expect(rsin.locator(':scope > p code')).toHaveText(RSIN_VALUE);
  await expect(rsin.locator('summary .badge')).toContainText('Likely');

  const lookUp = line(first, 'derive.look-up-through', 'rsin');
  await expect(lookUp).toHaveCount(1);
  await expect(lookUp.locator('summary .statement')).toContainText('Business Register');
  await expect(lookUp.locator('summary .badge')).toContainText('Certain');

  // DEC-050: the associated VAT number has no source, so no vat-nl derivation is shown for the
  // EORI (value 2 is itself a VAT number, so its own lines name vat-nl). The EORI level has no
  // source either, so no conclusion of the run is about a level.
  await expect(first.locator('[data-scheme="vat-nl"]')).toHaveCount(0);
  await expect(page.locator('[data-key*="level"]')).toHaveCount(0);
});

test('SPEC section 10 (WEB-11): the three values are pairwise consistent, each pair Likely', async ({
  page,
}) => {
  await explain(page, [EORI_VALUE, VAT_VALUE, RSIN_VALUE]);
  const pairs = page.getByRole('region', { name: 'Consistency' }).locator('[data-pair]');
  await expect(pairs).toHaveCount(3);
  for (const pair of await pairs.all()) {
    await expect(pair.locator(':scope > p')).toHaveText(/: consistent$/);
    const conclusion = pair.locator('.conclusion[data-key="check.consistent"]');
    await expect(conclusion).toHaveCount(1);
    await expect(conclusion.locator('summary .badge')).toContainText('Likely');
  }
});

test('SPEC section 10 (WEB-11): the bare RSIN is flagged as a possible personal identifier', async ({
  page,
}) => {
  await explain(page, [EORI_VALUE, VAT_VALUE, RSIN_VALUE]);
  const recognition = page.getByRole('region', { name: 'Recognition' });
  const third = valueBlock(recognition, 3, RSIN_VALUE);
  await expect(third.locator('.banner')).toBeVisible();
  await expect(third.locator('.banner h4')).toHaveText('Possible personal identifier');
  // The flag is only a warning with a choice: the engine derives nothing from the value until the
  // user says what it is, so nothing is derived for value 3 here.
  const derivations = page.getByRole('region', { name: 'Derivations' });
  await expect(valueBlock(derivations, 3, RSIN_VALUE).locator('[data-key]')).toHaveCount(0);
});

test('DEC-071: a foreign EORI is recognised as an EORI and derives no RSIN and no Dutch VAT number', async ({
  page,
}) => {
  await explain(page, [CONTRAST_VALUE]);
  const recognition = page.getByRole('region', { name: 'Recognition' });
  await expect(recognition.locator('[data-scheme="eori"]').first()).toBeVisible();
  const derivations = page.getByRole('region', { name: 'Derivations' });
  await expect(derivations.locator('[data-scheme="rsin"]')).toHaveCount(0);
  await expect(derivations.locator('[data-scheme="vat-nl"]')).toHaveCount(0);
  await expect(derivations.locator('[data-key="derive.derivation"]')).toHaveCount(0);
});
