import { expect, type Page } from '@playwright/test';

/**
 * Page object model for /app/projects/$projectId/settings.
 */
export class ProjectSettingsPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string, section = 'general'): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}/settings?section=${section}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Configurations|General|Settings/i, { timeout: 15_000 });
  }

  /**
   * Internal company platform rule verification:
   * Asserts that no Plan, Billing, or Subscription features/tabs exist in project settings.
   */
  async assertNoBillingSection(): Promise<void> {
    const billingElements = this.page.locator('text=/\\b(Plans?|Billing|Subscriptions?|Payment|Pricing)\\b/i');
    await expect(billingElements).toHaveCount(0);
  }
}
