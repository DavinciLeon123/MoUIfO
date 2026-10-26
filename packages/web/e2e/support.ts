import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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
