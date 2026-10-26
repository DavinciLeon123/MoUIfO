// WEB-08 and D-07: the accessibility and mobile gate over every view state in both languages, on
// the desktop and the mobile project. For each state axe (WCAG 2.0 and 2.1, A and AA) reports no
// violation in the light and the dark colour scheme, the page does not scroll sideways at a
// 320 by 800 viewport (WCAG 1.4.10 reflow), and after a route change focus sits on the new view's
// h1 (WCAG 2.4.3). Automated axe covers a subset of WCAG: the keyboard, screen-reader and Dutch
// wording check is the human check at the end of the phase. The only nine-digit run used is the
// public example RSIN of SPEC section 10.
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeViolations } from './support.ts';

const EORI_VALUE = 'NL001469630';
const VAT_VALUE = 'NL001469630B01';
const RSIN_VALUE = '001469630';

type Words = {
  lang: 'en' | 'nl';
  start: string;
  input: string;
  explain: string;
  schemeA: string;
  schemeB: string;
};

const WORDS: readonly Words[] = [
  {
    lang: 'en',
    start: './',
    input: 'Identifiers, one per line',
    explain: 'Explain',
    schemeA: 'Scheme A',
    schemeB: 'Scheme B',
  },
  {
    lang: 'nl',
    start: './?lang=nl',
    input: 'Identificatienummers, één per regel',
    explain: 'Uitleggen',
    schemeA: 'Schema A',
    schemeB: 'Schema B',
  },
];

/** The h1 of the current view has focus: the route change moved it there. */
async function expectFocusOnH1(page: Page): Promise<void> {
  await expect(page.locator('main h1')).toBeFocused();
}

/** Opens the first conclusion of each result section. */
async function openFirstConclusions(page: Page): Promise<void> {
  for (const section of ['recognition', 'derivations', 'consistency']) {
    const summary = page
      .locator(`section[aria-labelledby="${section}-heading"] .conclusion > details > summary`)
      .first();
    await summary.click();
    await expect(summary.locator('xpath=..')).toHaveAttribute('open', '');
  }
}

type State = {
  name: string;
  /** Brings the page to the state; a state reached by a route change checks the focus itself. */
  reach: (page: Page, words: Words) => Promise<void>;
};

const STATES: readonly State[] = [
  {
    name: 'the empty paste view',
    reach: async (page, words) => {
      await page.goto(words.start);
      await expect(page.locator('.guide-chips')).toBeVisible();
    },
  },
  {
    name: 'the paste view with the SPEC section 10 triple explained and the first conclusions opened',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page
        .getByRole('textbox', { name: words.input })
        .fill([EORI_VALUE, VAT_VALUE, RSIN_VALUE].join('\n'));
      await page.getByRole('button', { name: words.explain }).click();
      await expect(
        page.locator('section[aria-labelledby="consistency-heading"] [data-pair]'),
      ).toHaveCount(3);
      await openFirstConclusions(page);
    },
  },
  {
    name: 'the paste view with the ambiguous RSIN treated as rsin',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page.getByRole('textbox', { name: words.input }).fill(RSIN_VALUE);
      await page.getByRole('button', { name: words.explain }).click();
      const treatAs = page.getByRole('button', { name: /\(rsin\)$/ });
      await treatAs.click();
      await expect(treatAs).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.locator('section[aria-labelledby="derivations-heading"] [data-key]').first(),
      ).toBeVisible();
    },
  },
  {
    name: 'the scheme list',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page.locator('nav a[href$="#/schemes"]').click();
      await expect(page.locator('.scheme-list a')).not.toHaveCount(0);
      await expectFocusOnH1(page);
    },
  },
  {
    name: 'the eori scheme page',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page.locator('nav a[href$="#/schemes"]').click();
      await page.locator('.scheme-list a[href$="#/schemes/eori"]').click();
      await expect(page.locator('svg.graph')).toBeVisible();
      await expectFocusOnH1(page);
    },
  },
  {
    name: 'the relation view on rsin and eori with the chain opened',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page.locator('nav a[href$="#/relate"]').click();
      await expectFocusOnH1(page);
      await page.getByLabel(words.schemeA).selectOption('rsin');
      // A first choice is kept in the view until it is rendered; the second choice builds on it.
      await expect(page.getByLabel(words.schemeA)).toHaveValue('rsin');
      await page.getByLabel(words.schemeB).selectOption('eori');
      await expect(page).toHaveURL(/#\/relate\/rsin\/eori$/);
      await page.locator('.chain summary').first().click();
      await expect(page.locator('.chain .steps li').first()).toBeVisible();
    },
  },
  {
    name: 'the walkthrough open at step 2',
    reach: async (page, words) => {
      await page.goto(words.start);
      await page.locator('#walkthrough-open').click();
      await expect(page.locator('.walkthrough')).toBeVisible();
      await page.locator('#walkthrough-next').click();
      await expect(page.getByRole('textbox', { name: words.input })).toHaveValue(RSIN_VALUE);
      await expect(page.locator('#walkthrough-back')).toBeEnabled();
    },
  },
];

for (const words of WORDS) {
  for (const state of STATES) {
    test(`WEB-08: ${state.name}, ${words.lang === 'en' ? 'English' : 'Dutch'}`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await state.reach(page, words);
      await expect(page.locator('html')).toHaveAttribute('lang', words.lang);

      // axe in both colour schemes, at the size of the project's device.
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await expectNoAxeViolations(page, `${state.name}, ${words.lang}, ${scheme}`);
      }
      await page.emulateMedia({ colorScheme: 'light' });

      // WCAG 1.4.10 reflow: nothing scrolls sideways at 320 CSS pixels.
      await page.setViewportSize({ width: 320, height: 800 });
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(
        widths.scroll,
        `${state.name}, ${words.lang}: the page is ${widths.scroll}px wide at a ${widths.client}px viewport`,
      ).toBeLessThanOrEqual(320);
    });
  }
}
