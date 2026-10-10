import { expect, type Locator, type Page } from '@playwright/test';

export type WorkspaceTab = 'account' | 'appearance' | 'workspace-general' | 'workspace-members' | 'workspace-roles' | 'workspace-danger';

/**
 * Page object model for /app/settings.
 */
export class WorkspaceSettingsPage {
  readonly workspaceNameInput: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.workspaceNameInput = page.getByLabel(/workspace name|name/i).first();
    this.saveButton = page.getByRole('button', { name: /save|update/i }).first();
  }

  async goto(tab: WorkspaceTab = 'account'): Promise<void> {
    await this.page.goto(`/app/settings?tab=${tab}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async selectTab(tab: WorkspaceTab): Promise<void> {
    const tabItem = this.page.locator(`[data-tab="${tab}"], button:has-text("${tab}"), a[href*="tab=${tab}"]`).first();
    if (await tabItem.isVisible()) {
      await tabItem.click();
    } else {
      await this.goto(tab);
    }
  }

  async expectMemberVisible(email: string, role?: string): Promise<void> {
    await this.goto('workspace-members');
    const memberRow = this.page.locator('tr, div', { hasText: email }).first();
    await expect(memberRow).toBeVisible({ timeout: 15_000 });
    if (role) {
      await expect(memberRow).toContainText(new RegExp(role, 'i'));
    }
  }

  async assertNoBillingSection(): Promise<void> {
    const billingElements = this.page.locator('text=/\\b(Plans?|Billing|Subscriptions?|Pricing)\\b/i');
    await expect(billingElements).toHaveCount(0);
  }
}
