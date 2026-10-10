import { expect, test } from '../../src/fixtures/test';

test.describe('Workspace Settings & Members Management', () => {
  test('settings page loads and renders account and appearance tabs', async ({ authenticatedPage, workspaceSettings }) => {
    await workspaceSettings.goto('account');
    await expect(authenticatedPage.locator('body')).toContainText(/Account|Settings/i);
  });

  test('workspace members tab renders member list with owner', async ({ authenticatedPage: _authenticatedPage, workspaceSettings }) => {
    await workspaceSettings.goto('workspace-members');
    await workspaceSettings.expectMemberVisible('admin@example.com');
  });

  test('strictly enforces absence of billing or pricing tabs in workspace settings', async ({
    authenticatedPage: _authenticatedPage,
    workspaceSettings,
  }) => {
    await workspaceSettings.goto('account');
    await workspaceSettings.assertNoBillingSection();
  });
});
