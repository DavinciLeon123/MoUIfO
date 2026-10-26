import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** WCAG 2.0 and 2.1, levels A and AA: the gate of WEB-08. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Runs axe on the page as it is now and fails with the violation ids, impacts and targets when
 * there is any. `label` names the state in the failure message. Every view's browser test calls it.
 */
export async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lines = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'no impact'}): ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
  expect(lines, `axe violations on ${label}`).toEqual([]);
}

/** What the browser context asked the network for, as the recorder saw it (WEB-10). */
export type Traffic = {
  /** Every http(s) request URL, in order. */
  requests: string[];
  /** The requests whose origin is not the origin of the site; each of them was aborted. */
  crossOrigin: string[];
};

/**
 * Routes every request of the context: a request to another origin than `baseURL`'s is recorded
 * and aborted, anything else is recorded and let through. Install it before the first `goto`.
 * Assert on the returned lists, never on console output (a blocked request is silent).
 */
export async function recordTraffic(context: BrowserContext, baseURL: string): Promise<Traffic> {
  const origin = new URL(baseURL).origin;
  const traffic: Traffic = { requests: [], crossOrigin: [] };
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (!/^https?:/i.test(url)) return route.continue();
    traffic.requests.push(url);
    if (new URL(url).origin !== origin) {
      traffic.crossOrigin.push(url);
      return route.abort();
    }
    return route.continue();
  });
  return traffic;
}

/**
 * Forwards every `securitypolicyviolation` event of the page (and its frames) to the test and
 * returns the live list of violated directives. navigator.sendBeacon still returns true when the
 * policy blocks it, so the event, not the return value, is the evidence. Install before `goto`.
 */
export async function cspViolations(page: Page): Promise<string[]> {
  const violated: string[] = [];
  await page.exposeFunction('__uioCspViolation', (directive: string) => {
    violated.push(directive);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as Record<string, (directive: string) => void>).__uioCspViolation?.(
        event.violatedDirective,
      );
    });
  });
  return violated;
}

/**
 * A token that is not an identifier, so no digit run is needed to prove that a pasted value goes
 * nowhere. The UUID part is also returned lower-case without hyphens by {@link canaryForms}.
 */
export function makeCanary(): string {
  return `canary-${randomUUID()}`;
}

/** The spellings of a canary a normalising page might show: as given, and its UUID without hyphens. */
export function canaryForms(canary: string): string[] {
  const uuid = canary.slice('canary-'.length).toLowerCase();
  return [canary.toLowerCase(), uuid, uuid.replaceAll('-', '')];
}

/** Everything the page or the browser context could have kept (WEB-10, D-11). */
export type StorageSnapshot = {
  cookies: number;
  documentCookie: string;
  localStorage: number;
  sessionStorage: number;
  indexedDb: number;
  cacheStorage: number;
  serviceWorkers: number;
};

/** Counts cookies, web storage, IndexedDB databases, Cache Storage keys and service workers. */
export async function storageSnapshot(
  page: Page,
  context: BrowserContext,
): Promise<StorageSnapshot> {
  const cookies = (await context.cookies()).length;
  const inPage = await page.evaluate(async () => ({
    documentCookie: document.cookie,
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDb: 'indexedDB' in window ? (await indexedDB.databases()).length : 0,
    cacheStorage: 'caches' in window ? (await caches.keys()).length : 0,
    serviceWorkers:
      'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
  return { cookies, ...inPage };
}
