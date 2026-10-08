import { expect, type Locator, type Page } from '@playwright/test';

export interface SiteSummary {
  id: string;
  name: string;
}

/** Workspace landing page: the table of documentation sites. */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app');
    await expect(this.page.getByRole('heading', { name: 'Your sites' })).toBeVisible();
  }

  /** Row locator for a site in the "All sites" table. */
  siteRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** Create a site through the real dialog, then open it. */
  async createSite(name: string): Promise<SiteSummary> {
    await this.goto();
    await this.page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New documentation site' })).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog).toBeHidden({ timeout: 45_000 });

    const row = this.siteRow(name);
    await expect(row).toBeVisible({ timeout: 45_000 });
    return { id: await this.openSite(name), name };
  }

  /** Click a site row and return its project id. */
  async openSite(name: string): Promise<string> {
    await this.siteRow(name).click();
    await this.page.waitForURL(/\/app\/projects\/[^/?#]+/, { timeout: 45_000 });
    return projectIdFromUrl(this.page.url());
  }

  async isListed(name: string): Promise<boolean> {
    return this.siteRow(name).isVisible();
  }

  async deployCount(name: string): Promise<number> {
    const cells = this.siteRow(name).getByRole('cell');
    const text = (await cells.nth(2).innerText()).replace(/[^0-9]/g, '');
    return Number(text || '0');
  }

  /** Every site name currently rendered in the table. */
  async listedSiteNames(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const count = await rows.count();
    const names: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const cell = rows.nth(i).getByRole('cell').first();
      if ((await cell.count()) > 0) names.push((await cell.innerText()).trim());
    }
    return names;
  }

  async pageCount(name: string): Promise<number> {
    const cells = this.siteRow(name).getByRole('cell');
    const text = (await cells.nth(1).innerText()).replace(/[^0-9]/g, '');
    return Number(text || '0');
  }
}

export function projectIdFromUrl(url: string): string {
  const match = url.match(/\/app\/projects\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Could not read a project id from ${url}`);
  }
  return match[1]!;
}