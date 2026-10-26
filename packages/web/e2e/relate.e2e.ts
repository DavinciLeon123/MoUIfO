// Browser test of the relation view: WEB-03 and D-16 (two labelled selects, every shortest chain of
// the engine's relate with edge type, inverse marking, source and certainty, expandable like any
// conclusion). Task 1 covers #/relate/rsin/eori, the one chain of one inverse step; Task 2 adds the
// swap, the no-chain and same-scheme states, the instruction without ids, the nav link and axe.
import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './support.ts';

test('#/relate/rsin/eori shows the one chain, its inverse derived-from hop, source and certainty', async ({
  page,
}) => {
  await page.goto('./#/relate/rsin/eori');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Relation between two schemes');

  // Two labelled selects preset from the route.
  await expect(page.getByLabel('Scheme A')).toHaveValue('rsin');
  await expect(page.getByLabel('Scheme B')).toHaveValue('eori');

  // Exactly one chain, of one step: the model states eori derived-from rsin, walked inversely.
  const chains = page.locator('.chain');
  await expect(chains).toHaveCount(1);
  const chain = chains.first();
  await expect(chain.locator('summary .badge')).toContainText('Likely');
  const hops = chain.locator('.hop');
  await expect(hops).toHaveCount(1);
  const hop = hops.first();
  await expect(hop).toHaveAttribute('data-from', 'rsin');
  await expect(hop).toHaveAttribute('data-to', 'eori');
  await expect(hop).toHaveAttribute('data-inverse', 'true');
  await expect(hop).toContainText('rsin');
  await expect(hop).toContainText('eori');
  await expect(hop).toContainText('Derived from');
  await expect(hop).toContainText('(inverse)');
  // The hop's own certainty badge and source title; the parallel rules follow as "Also via".
  await expect(hop.locator(':scope > .badge')).toHaveCount(1);
  await expect(hop.locator(':scope > .first-source')).not.toBeEmpty();
  await expect(hop.locator('.also-via .steps li')).toHaveCount(2);

  // Expanding the chain shows its steps and ends with How to verify.
  await chain.locator('summary').click();
  await expect(chain.locator('.steps li').first()).toBeVisible();
  await expect(chain.locator('p.verify')).toContainText('How to verify');
});

test('swap exchanges A and B, the route follows and the hop is read as the model states it', async ({
  page,
}) => {
  await page.goto('./#/relate/rsin/eori');
  const swap = page.getByRole('button', { name: 'Swap A and B' });
  await swap.click();
  await expect(page).toHaveURL(/#\/relate\/eori\/rsin$/);
  await expect(page.getByLabel('Scheme A')).toHaveValue('eori');
  await expect(page.getByLabel('Scheme B')).toHaveValue('rsin');
  const hop = page.locator('.chain .hop');
  await expect(hop).toHaveCount(1);
  await expect(hop).toHaveAttribute('data-from', 'eori');
  await expect(hop).toHaveAttribute('data-inverse', 'false');
  await expect(hop).not.toContainText('(inverse)');
  // The keyboard user stays where they were (WCAG 2.4.3): no jump to the heading.
  await expect(swap).toBeFocused();

  await swap.click();
  await expect(page).toHaveURL(/#\/relate\/rsin\/eori$/);
  await expect(page.locator('.chain .hop')).toHaveAttribute('data-inverse', 'true');
});

test('changing a select updates the route and the chains; the route holds scheme ids only', async ({
  page,
}) => {
  await page.goto('./#/relate/rsin/eori');
  await page.getByLabel('Scheme A').selectOption('vat-nl');
  await expect(page).toHaveURL(/#\/relate\/vat-nl\/eori$/);
  const chain = page.locator('.chain');
  await expect(chain).toHaveCount(1);
  await expect(chain.locator('.hop')).toHaveCount(2);
  await expect(chain.locator('.hop').first()).toHaveAttribute('data-inverse', 'false');
  await expect(chain.locator('.hop').nth(1)).toHaveAttribute('data-inverse', 'true');

  await page.getByLabel('Scheme B').selectOption('kvk-number');
  await expect(page).toHaveURL(/#\/relate\/vat-nl\/kvk-number$/);
  expect(new URL(page.url()).hash).toMatch(/^#\/relate\/[a-z0-9-]+\/[a-z0-9-]+$/);
});

test('a pair without a chain says no sourced relation found and never that they are unrelated', async ({
  page,
}) => {
  await page.goto('./#/relate/rsin/eori');
  await page.getByLabel('Scheme A').selectOption('bsn');
  await expect(page).toHaveURL(/#\/relate\/bsn\/eori$/);
  await expect(page.getByText('No sourced relation found between these schemes.')).toBeVisible();
  await expect(page.locator('.chain')).toHaveCount(0);
  // The engine's warning follows in words.
  await expect(page.locator('.warnings')).toContainText(
    'No chain of at most four steps connects the two schemes.',
  );
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(
    /not related|unrelated/,
  );
});

test('the same scheme twice shows the engine warning in words and no chain', async ({ page }) => {
  await page.goto('./#/relate/rsin/eori');
  await page.getByLabel('Scheme A').selectOption('eori');
  await expect(page).toHaveURL(/#\/relate\/eori\/eori$/);
  await expect(page.locator('.warnings')).toContainText('The two scheme ids are the same scheme.');
  await expect(page.locator('.chain')).toHaveCount(0);
  await expect(page.getByText('No sourced relation found')).toHaveCount(0);
});

test('#/relate shows both selects unset with an instruction and keeps a first choice', async ({
  page,
}) => {
  await page.goto('./#/relate');
  await expect(page.getByLabel('Scheme A')).toHaveValue('');
  await expect(page.getByLabel('Scheme B')).toHaveValue('');
  await expect(page.getByText('Choose two schemes.')).toBeVisible();
  await expect(page.locator('.chain')).toHaveCount(0);

  // One choice alone cannot be an address; it stays in the select until the second one completes it.
  await page.getByLabel('Scheme A').selectOption('rsin');
  await expect(page.getByLabel('Scheme A')).toHaveValue('rsin');
  await expect(page.getByText('Choose two schemes.')).toBeVisible();
  await expect(page).toHaveURL(/#\/relate$/);
  await page.getByLabel('Scheme B').selectOption('eori');
  await expect(page).toHaveURL(/#\/relate\/rsin\/eori$/);
  await expect(page.locator('.chain')).toHaveCount(1);
});

test('the header has a Relation link; ids that are not schemes give the not-in-the-model page', async ({
  page,
}) => {
  await page.goto('./#/');
  const link = page.getByRole('navigation').getByRole('link', { name: 'Relation' });
  await link.click();
  await expect(page).toHaveURL(/#\/relate$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Relation between two schemes | UIO knowledge model');

  for (const hash of ['#/relate/rsin/__proto__', '#/relate/constructor/eori', '#/relate/rsin']) {
    await page.goto(`./${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not in the model');
  }
});

test('the Dutch view names the chain in Dutch and keeps the model labels marked', async ({
  page,
}) => {
  await page.goto('./?lang=nl#/relate/rsin/eori');
  await expect(page.getByLabel('Schema A')).toHaveValue('rsin');
  await expect(page.getByRole('button', { name: 'A en B omwisselen' })).toBeVisible();
  await expect(page.locator('.chain .statement')).toContainText('zijn verbonden in 1 stap');
  await page.getByLabel('Schema A').selectOption('bsn');
  await expect(
    page.getByText("Geen relatie met bron gevonden tussen deze schema's."),
  ).toBeVisible();
});

test.describe('WEB-08: axe on the relation view', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} colour scheme`, () => {
      test.use({ colorScheme: scheme });

      test('with a chain opened, without a chain and unset, in English and Dutch', async ({
        page,
      }) => {
        for (const [address, label, open] of [
          ['./#/relate/rsin/eori', 'the English chain, opened', true],
          ['./?lang=nl#/relate/rsin/eori', 'the Dutch chain, opened', true],
          ['./#/relate/vat-nl/eori', 'the English two-step chain, opened', true],
          [
            './?lang=nl#/relate/peppol-id/kvk-number',
            'the Dutch chain with parallel edges, opened',
            true,
          ],
          ['./#/relate/bsn/eori', 'the English pair without a chain', false],
          ['./?lang=nl#/relate/eori/eori', 'the Dutch same-scheme state', false],
          ['./#/relate', 'the English unset view', false],
          ['./?lang=nl#/relate', 'the Dutch unset view', false],
        ] as const) {
          await page.goto(address);
          await page.reload();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          if (open) {
            await page.locator('.chain summary').first().click();
            await expect(page.locator('.chain .steps li').first()).toBeVisible();
          }
          await expectNoAxeViolations(page, `${label}, ${scheme}`);
        }
      });
    });
  }
});
