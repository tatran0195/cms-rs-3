import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object model for /app/sites.
 */
export class SitesPage {
  readonly searchInput: Locator;
  readonly newSiteButton: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.locator('input[placeholder*="Search"]').first();
    this.newSiteButton = page.getByRole('button', { name: /new site|create site|new project/i }).first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/sites');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectSitesListVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/All sites|Your sites|Sites/i, { timeout: 15_000 });
  }

  async searchSites(term: string): Promise<void> {
    if (await this.searchInput.isVisible()) {
      await this.searchInput.fill(term);
    }
  }

  async openSite(name = 'Company Docs'): Promise<void> {
    const siteCard = this.page.locator('button.group, button, a', { hasText: name }).first();
    await siteCard.click();
    await this.page.waitForURL(/\/app\/projects\//, { timeout: 15_000 });
  }
}
