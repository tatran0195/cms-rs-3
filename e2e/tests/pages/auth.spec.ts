import { expect, test } from '../../src/fixtures/test';

test.describe('Auth Pages & Invitation Flow', () => {
  test('authenticates via API and establishes session at /app', async ({ page, signIn }) => {
    await signIn.loginViaApi('admin@example.com', 'Password123!', '/app');
    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator('body')).toContainText(/Overview|Sites|All sites/i);
  });

  test('sign-in page is reachable and renders login form', async ({ page, signIn }) => {
    // Clear cookies to test signed-out state
    await page.context().clearCookies();
    await signIn.goto();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('resolves invitation details on /accept-invitation with token', async ({ page, invitation }) => {
    await invitation.goto('test-token');
    await invitation.expectInvitationVisible();
  });
});
