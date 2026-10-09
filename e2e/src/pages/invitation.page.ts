import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object model for the /accept-invitation route.
 */
export class AcceptInvitationPage {
  readonly workspaceHeading: Locator;
  readonly acceptButton: Locator;
  readonly cardBody: Locator;

  constructor(private readonly page: Page) {
    this.workspaceHeading = page.locator('h1, h2, h3').first();
    this.acceptButton = page.getByRole('button', { name: /accept|join|continue/i }).first();
    this.cardBody = page.locator('main, [role="main"], .card, div:has-text("invited")').first();
  }

  async goto(token: string): Promise<void> {
    await this.page.goto(`/accept-invitation?token=${encodeURIComponent(token)}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectInvitationVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/invited|invitation/i, { timeout: 15_000 });
  }

  async accept(): Promise<void> {
    if (await this.acceptButton.isVisible()) {
      await this.acceptButton.click();
    }
  }
}
