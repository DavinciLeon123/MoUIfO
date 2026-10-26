// Browser test of the relation view: WEB-03 and D-16 (two labelled selects, every shortest chain of
// the engine's relate with edge type, inverse marking, source and certainty, expandable like any
// conclusion). Task 1 covers #/relate/rsin/eori, the one chain of one inverse step; Task 2 adds the
// swap, the no-chain and same-scheme states, the instruction without ids, the nav link and axe.
import { expect, test } from '@playwright/test';

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
