// The WEB-10 privacy suite (D-11: values never in the URL, nothing stored; D-14: no value appended
// to a link). One long walk per language over every view and action with a random canary token
// and the public values of SPEC section 10, then the evidence: no cross-origin request was
// attempted, every request stayed under the site base, nothing was stored, and neither the canary
// nor a pasted value sits in the URL, history state, title, any href or any request URL.
//
// A test that passes on a dead page proves nothing (Phase 6 quick task 261023-snf: the MCP privacy
// tests "fail on a dead server and carry a positive control"). So results are asserted to be
// rendered before any absence is checked, and the walk ends with two positive controls: the CSP
// meta is the first element of head, and the CSP is enforced (a same-origin fetch is blocked and a
// connect-src violation event is seen). The suite takes `baseURL` from the Playwright config, so
// it runs unchanged against a live PLAYWRIGHT_BASE_URL. The only nine-digit run used is the public
// example RSIN of SPEC section 10.
import { expect, type Page, test } from '@playwright/test';
import {
  canaryForms,
  cspViolations,
  makeCanary,
  recordTraffic,
  storageSnapshot,
} from './support.ts';

const EORI_VALUE = 'NL001469630';
const VAT_VALUE = 'NL001469630B01';
const RSIN_VALUE = '001469630';
const CONTRAST_VALUE = 'DE123456789012345';
const PASTED = [EORI_VALUE, VAT_VALUE, RSIN_VALUE, CONTRAST_VALUE];

type Words = {
  lang: 'en' | 'nl';
  start: string;
  input: string;
  sentence: string;
  explain: string;
  schemeA: string;
  schemeB: string;
  swap: string;
};

const WORDS: readonly Words[] = [
  {
    lang: 'en',
    start: './',
    input: 'Identifiers, one per line',
    sentence: 'Values are processed in your browser only and never stored or sent.',
    explain: 'Explain',
    schemeA: 'Scheme A',
    schemeB: 'Scheme B',
    swap: 'Swap A and B',
  },
  {
    lang: 'nl',
    start: './?lang=nl',
    input: 'Identificatienummers, één per regel',
    sentence: 'Waarden worden alleen in uw browser verwerkt en nooit opgeslagen of verzonden.',
    explain: 'Uitleggen',
    schemeA: 'Schema A',
    schemeB: 'Schema B',
    swap: 'A en B omwisselen',
  },
];

/** The spellings under which a pasted value or the canary must never appear outside the box. */
function forbiddenTexts(canary: string): string[] {
  return [...canaryForms(canary), ...PASTED.map((value) => value.toLowerCase())];
}

/**
 * Looks for every forbidden text in the sinks a value could leak into on the current page: the
 * address, history state, title and every href. The text of the box itself is not a sink.
 */
async function expectNoValueInSinks(page: Page, canary: string, label: string): Promise<void> {
  const sinks = await page.evaluate(() => ({
    url: location.href,
    state: JSON.stringify(history.state),
    title: document.title,
    hrefs: [...document.querySelectorAll('a[href]')].map(
      (anchor) => (anchor as HTMLAnchorElement).href,
    ),
  }));
  const haystack = [sinks.url, sinks.state, sinks.title, ...sinks.hrefs].join('\n').toLowerCase();
  for (const text of forbiddenTexts(canary)) {
    expect(
      haystack,
      `${label}: "${text}" found in the url, history state, title or an href`,
    ).not.toContain(text);
  }
  expect(['', '?lang=en', '?lang=nl'], `${label}: unexpected query string`).toContain(
    new URL(sinks.url).search,
  );
}

/** Empties the box and presses Explain, which returns the paste view to its empty state (D-06). */
async function backToEmptyState(page: Page, words: Words): Promise<void> {
  await page.getByRole('textbox', { name: words.input }).fill('');
  await page.getByRole('button', { name: words.explain }).click();
  await expect(page.locator('.guide-chips')).toBeVisible();
}

for (const words of WORDS) {
  test(`WEB-10, D-11, D-14: ${words.lang === 'en' ? 'English' : 'Dutch'} walk over every view keeps values in the page`, async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    if (baseURL === undefined) throw new Error('the Playwright config has no baseURL');
    const canary = makeCanary();
    const traffic = await recordTraffic(context, baseURL);
    const violations = await cspViolations(page);
    const box = page.getByRole('textbox', { name: words.input });
    const explain = page.getByRole('button', { name: words.explain });

    // Paste the canary with the SPEC section 10 triple and press Explain.
    await page.goto(words.start);
    await expect(page.locator('html')).toHaveAttribute('lang', words.lang);
    await box.fill([EORI_VALUE, VAT_VALUE, RSIN_VALUE, canary].join('\n'));
    await explain.click();

    // The dead-page rule: results are rendered before any absence is checked.
    await expect(page.locator('#recognition-heading')).toBeVisible();
    await expect(
      page.locator('section[aria-labelledby="recognition-heading"] [data-scheme="eori"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('section[aria-labelledby="derivations-heading"] [data-key]').first(),
    ).toBeVisible();
    await expect(
      page.locator('section[aria-labelledby="consistency-heading"] [data-pair]'),
    ).not.toHaveCount(0);
    await expect(page.locator('[role="status"]')).not.toHaveText('');
    await expectNoValueInSinks(page, canary, 'after Explain');

    // Open every conclusion on the page, one real click on each summary.
    const summaries = page.locator('.conclusion > details > summary');
    const total = await summaries.count();
    expect(total, 'the results hold conclusions to open').toBeGreaterThan(3);
    for (let index = 0; index < total; index += 1) await summaries.nth(index).click();
    await expect(page.locator('.conclusion > details[open]')).toHaveCount(total);
    await expectNoValueInSinks(page, canary, 'after opening the conclusions');

    // Treat as rsin, which reruns the derivations with the user's declaration.
    const treatAsRsin = page.getByRole('button', { name: /\(rsin\)$/ });
    await treatAsRsin.click();
    await expect(treatAsRsin).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page
        .locator('section[aria-labelledby="derivations-heading"] [data-key="derive.derivation"]')
        .first(),
    ).toBeVisible();
    await expectNoValueInSinks(page, canary, 'after Treat as');

    // The language toggle, twice, writes only ?lang= and keeps the text and the results.
    const toggle = page.locator('header > button');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('lang', words.lang === 'en' ? 'nl' : 'en');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('lang', words.lang);
    await expect(box).toHaveValue(new RegExp(canary));
    await expect(page.locator('#recognition-heading')).toBeVisible();
    await expectNoValueInSinks(page, canary, 'after the language toggle');

    // The scheme list, the eori page and a graph node link.
    const nav = page.locator('nav');
    await nav.locator('a[href$="#/schemes"]').click();
    await expect(page.locator('.scheme-list a')).not.toHaveCount(0);
    await expectNoValueInSinks(page, canary, 'on the scheme list');
    await page.locator('.scheme-list a[href$="#/schemes/eori"]').click();
    await expect(page.locator('svg.graph')).toBeVisible();
    await expectNoValueInSinks(page, canary, 'on the eori page');
    await page.locator('svg.graph a[data-node="rsin"]').click();
    await expect(page).toHaveURL(/#\/schemes\/rsin$/);
    await expect(page.locator('h1')).toBeFocused();
    await expectNoValueInSinks(page, canary, 'after a graph node link');

    // The relation view: both selects, a chain, the chain opened and the swap.
    await nav.locator('a[href$="#/relate"]').click();
    // Focus moves to the new view's h1 after the render and its effects; choose only then.
    await expect(page.locator('h1')).toBeFocused();
    await page.getByLabel(words.schemeA).selectOption('rsin');
    // A first choice is kept in the view until it is rendered; the second choice builds on it.
    await expect(page.getByLabel(words.schemeA)).toHaveValue('rsin');
    await page.getByLabel(words.schemeB).selectOption('eori');
    await expect(page).toHaveURL(/#\/relate\/rsin\/eori$/);
    await expect(page.locator('.chain')).toHaveCount(1);
    await page.locator('.chain summary').first().click();
    await expect(page.locator('.chain .steps li').first()).toBeVisible();
    await page.getByRole('button', { name: words.swap }).click();
    await expect(page).toHaveURL(/#\/relate\/eori\/rsin$/);
    await expect(page.locator('.chain .hop')).toHaveCount(1);
    await expectNoValueInSinks(page, canary, 'on the relation view');

    // Back to the paste view: the box and the results stayed in memory.
    await nav.locator('a[href$="#/"]').click();
    await expect(box).toHaveValue(new RegExp(canary));
    await expect(page.locator('#recognition-heading')).toBeVisible();

    // Every chip, from the empty state. The three paste chips fill the box and run at once.
    for (let chip = 0; chip < 3; chip += 1) {
      await backToEmptyState(page, words);
      await page.locator('.chips button').nth(chip).click();
      await expect(box).not.toHaveValue('');
      await expect(
        page.locator('section[aria-labelledby="recognition-heading"] [data-scheme]').first(),
      ).toBeVisible();
      await expectNoValueInSinks(page, canary, `after paste chip ${chip + 1}`);
    }
    // The two view chips are links; the nav brings the user back to the empty state.
    for (const [chip, address] of [
      [0, /#\/schemes\/eori$/],
      [1, /#\/relate\/rsin\/eori$/],
    ] as const) {
      await backToEmptyState(page, words);
      await page.locator('.chips a').nth(chip).click();
      await expect(page).toHaveURL(address);
      await expectNoValueInSinks(page, canary, `after view chip ${chip + 1}`);
      await nav.locator('a[href$="#/"]').click();
      await expect(page.locator('.guide-chips')).toBeVisible();
    }

    // The walkthrough from the empty state, every step, then Finish.
    await page.locator('#walkthrough-open').click();
    await expect(page.locator('.walkthrough')).toBeVisible();
    for (const lines of [
      EORI_VALUE,
      RSIN_VALUE,
      CONTRAST_VALUE,
      [EORI_VALUE, VAT_VALUE, RSIN_VALUE].join('\n'),
    ]) {
      await expect(box).toHaveValue(lines);
      await expect(page.locator('#recognition-heading')).toBeVisible();
      await expectNoValueInSinks(page, canary, `at walkthrough value ${lines.split('\n')[0]}`);
      await page.locator('#walkthrough-next').click();
    }
    await expect(page.locator('.walkthrough')).toHaveCount(0);

    // Evidence 1: traffic. Nothing left the origin, and every request stayed under the base.
    expect(traffic.requests.length, 'the recorder saw the page load').toBeGreaterThan(0);
    expect(traffic.crossOrigin, 'cross-origin requests were attempted').toEqual([]);
    const basePath = new URL(baseURL).pathname;
    for (const url of traffic.requests) {
      const { pathname } = new URL(url);
      expect(pathname.startsWith(basePath), `${url} is outside the site base ${basePath}`).toBe(
        true,
      );
      for (const text of forbiddenTexts(canary)) {
        expect(url.toLowerCase(), `a value or the canary is in a request URL`).not.toContain(text);
      }
    }

    // Evidence 2: storage. Nothing was kept anywhere.
    expect(await storageSnapshot(page, context)).toEqual({
      cookies: 0,
      documentCookie: '',
      localStorage: 0,
      sessionStorage: 0,
      indexedDb: 0,
      cacheStorage: 0,
      serviceWorkers: 0,
    });

    // Evidence 3: the sinks on the page the walk ended on, and the privacy sentence under the box.
    await expectNoValueInSinks(page, canary, 'at the end of the walk');
    const describedBy = await box.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(words.sentence);

    // The site's own use of the page raised no policy violation.
    expect(violations, 'the page violated its own policy').toEqual([]);

    // Positive controls: the policy is delivered first in head and is enforced.
    const first = await page.evaluate(() => {
      const element = document.head.firstElementChild;
      return element?.getAttribute('http-equiv') ?? null;
    });
    expect(first, 'the CSP meta is not the first element of head').toBe('Content-Security-Policy');
    const outcome = await page.evaluate(() =>
      fetch(location.href).then(
        () => 'sent',
        () => 'blocked',
      ),
    );
    expect(outcome, 'a same-origin fetch was not blocked: the CSP is not enforced').toBe('blocked');
    await expect.poll(() => violations).toContain('connect-src');
  });
}
