import { expect, type Page } from '@playwright/test';

/**
 * Page object model for /app/projects/$projectId/preview.
 */
export class PreviewPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}/preview`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectPreviewLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Preview|Draft preview/i, { timeout: 15_000 });
  }
}
