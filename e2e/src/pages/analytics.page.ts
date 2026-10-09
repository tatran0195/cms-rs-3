import { expect, type Page } from '@playwright/test';

/**
 * Page object model for /app/analytics.
 */
export class AnalyticsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/analytics');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectAnalyticsVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Analytics|Traffic|Views/i, { timeout: 15_000 });
  }
}
