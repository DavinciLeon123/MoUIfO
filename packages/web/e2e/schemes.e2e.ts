// Browser test of the scheme views: WEB-02 (the scheme page shows the sourced description and the
// applicability of every jurisdiction), WEB-06 and D-13 (How to verify is the sourced
// validation_source link or an honest sentence, never an invented register URL) and DEC-041 (a data
// gap reads "no data in the model" and is never turned into a claim). Task 1 covers the EORI page,
// the page of a scheme without a sourced register link and an id that is not in the model. Task 2
// covers the scheme list, the header navigation, focus and title on every route, the DEC-024
// credit line and axe (WEB-08) on the list and a scheme page in both languages. Task 3 covers the
// relation graph (D-15): an SVG with a title, a visible text list with the same edges, node links
// and the page of a scheme without relations.
import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './support.ts';

const EORI_LABEL = 'Economic Operators Registration and Identification number';
const CREDIT =
  'UID table v1.2 — Davinci Conclusion, as produced for the CoE-DSC. Licensed under CC BY 4.0.';

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

test('#/schemes lists the 16 schemes and following the eori link focuses its h1 and sets the title', async ({
  page,
}) => {
  await page.goto('./#/schemes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schemes');
  await expect(page).toHaveTitle('Schemes | UIO knowledge model');
  const links = page.locator('.scheme-list a');
  await expect(links).toHaveCount(16);
  const hrefs = await links.evaluateAll((all) =>
    all.map((each) => each.getAttribute('href')?.replace(/^.*#/, '#')),
  );
  expect(new Set(hrefs).size).toBe(16);
  for (const href of hrefs) expect(href).toMatch(/^#\/schemes\/[a-z0-9-]+$/);

  await page.locator('.scheme-list a[href$="#/schemes/eori"]').click();
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText(EORI_LABEL);
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(`${EORI_LABEL} | UIO knowledge model`);

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schemes');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.locator('.scheme-list a')).toHaveCount(16);
});

test('the title of a view never holds an unknown id and the paste view keeps the site name', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page).toHaveTitle('UIO knowledge model');
  await page.goto('./#/schemes/__proto__');
  await expect(page).toHaveTitle('Not in the model | UIO knowledge model');
});

test('the header navigation reaches both views and marks the current one', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const paste = nav.getByRole('link', { name: 'Paste identifiers' });
  const schemes = nav.getByRole('link', { name: 'Schemes' });
  await expect(paste).toHaveAttribute('aria-current', 'page');
  await expect(schemes).not.toHaveAttribute('aria-current', /.+/);

  await schemes.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schemes');
  await expect(schemes).toHaveAttribute('aria-current', 'page');
  await expect(paste).not.toHaveAttribute('aria-current', /.+/);

  await page.locator('.scheme-list a[href$="#/schemes/eori"]').click();
  await expect(schemes).toHaveAttribute('aria-current', 'true');

  await paste.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UIO knowledge model');
  await expect(paste).toHaveAttribute('aria-current', 'page');
});

test('what was pasted survives a visit to the scheme pages, and the URL holds no value', async ({
  page,
}) => {
  const typed = 'KEEP ME';
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Identifiers, one per line' }).fill(typed);
  await page.getByRole('navigation').getByRole('link', { name: 'Schemes' }).click();
  await page.locator('.scheme-list a[href$="#/schemes/eori"]').click();
  expect(page.url()).not.toContain('KEEP');
  await page.getByRole('navigation').getByRole('link', { name: 'Paste identifiers' }).click();
  await expect(page.getByRole('textbox', { name: 'Identifiers, one per line' })).toHaveValue(typed);
});

test('the DEC-024 credit line is in the footer of the paste view and of a scheme page', async ({
  page,
}) => {
  for (const address of ['./', './#/schemes/eori']) {
    await page.goto(address);
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(CREDIT);
    const licence = footer.getByRole('link', { name: 'CC BY 4.0' });
    await expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await expect(licence).toHaveAttribute('target', '_blank');
    await expect(licence).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(licence).toContainText('creativecommons.org');
    await expect(licence).toContainText('opens external site');
  }
  // The credit is a fixed English wording, so it is tagged as English in the Dutch page too.
  await page.goto('./?lang=nl#/schemes/eori');
  await expect(page.getByRole('contentinfo')).toContainText(CREDIT);
  await expect(page.getByRole('contentinfo').locator('[lang="en"]')).toContainText(CREDIT);
  await expect(page.getByRole('contentinfo').getByRole('link')).toContainText('opent externe site');
});

test.describe('WEB-08: axe on the scheme views', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} colour scheme`, () => {
      test.use({ colorScheme: scheme });

      test('the list and the EORI page in English and Dutch', async ({ page }) => {
        for (const [address, label] of [
          ['./#/schemes', 'the English scheme list'],
          ['./#/schemes/eori', 'the English EORI page'],
          ['./?lang=nl#/schemes', 'the Dutch scheme list'],
          ['./?lang=nl#/schemes/eori', 'the Dutch EORI page'],
          ['./#/schemes/kvk-number', 'the English kvk-number page (many neighbours)'],
          ['./?lang=nl#/schemes/peppol-id', 'the Dutch peppol-id page (parallel edges)'],
        ] as const) {
          await page.goto(address);
          await page.reload();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expectNoAxeViolations(page, `${label}, ${scheme}`);
        }
      });
    });
  }
});

test('D-15: the EORI graph is an SVG with a title and the same edges as a visible text list', async ({
  page,
}) => {
  await page.goto('./#/schemes/eori');
  const relations = page.getByRole('region', { name: 'Relations' });
  const svg = relations.locator('svg.graph');
  await expect(svg).toBeVisible();
  await expect(svg.locator('title')).toHaveText(/^Relations of .*\(eori\)$/);
  await expect(svg).toHaveAttribute('aria-labelledby', 'relation-graph-title');

  const items = relations.locator('.relation-list > li');
  const edges = svg.locator('path.edge');
  await expect(items).toHaveCount(3);
  await expect(edges).toHaveCount(await items.count());

  // The text alternative names the neighbour and the relation kind, and marks the inverse edge.
  const text = await items.allInnerTexts();
  expect(text.some((each) => each.includes('(rsin)') && each.includes('Derived from'))).toBe(true);
  const inverse = relations.locator('.relation-list > li[data-inverse="true"]');
  await expect(inverse).toHaveCount(1);
  await expect(inverse).toContainText('rule eori-nl-from-rsin');
  await expect(inverse).toContainText('(inverse)');
  await expect(svg.locator('path.edge-inverse')).toHaveCount(1);
  await expect(svg.locator('[data-node="eori"]')).toHaveCount(1);

  // The edges of the SVG are exactly those of the list.
  const drawn = await edges.evaluateAll((all) => all.map((each) => each.getAttribute('data-edge')));
  const listed = await items.evaluateAll((all) =>
    all.map((each) => each.getAttribute('data-edge')),
  );
  expect(drawn).toEqual(listed);

  // A neighbour node links to its scheme page.
  await svg.locator('a[data-node="rsin"]').click();
  await expect(page).toHaveURL(/#\/schemes\/rsin$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Legal Entities and Partnerships Information Number',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('D-15: a scheme without relations says so in the Relations section and draws no graph', async ({
  page,
}) => {
  await page.goto('./#/schemes/bsn');
  const relations = page.getByRole('region', { name: 'Relations' });
  await expect(relations).toContainText('The model holds no relations, rules or components');
  await expect(relations.locator('svg')).toHaveCount(0);
  await expect(relations.locator('.relation-list')).toHaveCount(0);
});

test('D-15: for every scheme the SVG edges and the list items are the same, and the page does not scroll sideways', async ({
  page,
}) => {
  await page.goto('./#/schemes');
  const hrefs = await page
    .locator('.scheme-list a')
    .evaluateAll((all) => all.map((each) => each.getAttribute('href')));
  expect(hrefs.length).toBe(16);
  for (const href of hrefs) {
    await page.goto(`./${href}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const items = await page.locator('.relation-list > li').count();
    await expect(page.locator('svg.graph path.edge'), String(href)).toHaveCount(items);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${href} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test('D-15, D-10: in Dutch the graph labels use the model and rule or component words are Dutch', async ({
  page,
}) => {
  await page.goto('./?lang=nl#/schemes/peppol-id');
  const relations = page.getByRole('region', { name: 'Relaties' });
  await expect(relations.locator('svg.graph title')).toHaveText(/^Relaties van /);
  await expect(relations.locator('.relation-list')).toContainText('onderdeel 0106');
  await expect(relations.locator('.relation-list')).not.toContainText('component 0106');
});
