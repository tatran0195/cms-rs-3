import { expect, type Page } from '@playwright/test';

/**
 * Page object model for /app/projects/$projectId (Project Dashboard / Overview).
 */
export class ProjectWorkspacePage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Overview|Editor|Preview|Analytics|Settings/i, { timeout: 15_000 });
  }

  async navigateToEditor(): Promise<void> {
    await this.page.getByRole('link', { name: 'Editor' }).first().click();
    await this.page.waitForURL(/\/editor/, { timeout: 15_000 });
  }

  async navigateToPreview(): Promise<void> {
    await this.page.getByRole('link', { name: 'Preview' }).first().click();
    await this.page.waitForURL(/\/preview/, { timeout: 15_000 });
  }

  async navigateToSettings(): Promise<void> {
    await this.page.getByRole('link', { name: 'Settings' }).first().click();
    await this.page.waitForURL(/\/settings/, { timeout: 15_000 });
  }
}
