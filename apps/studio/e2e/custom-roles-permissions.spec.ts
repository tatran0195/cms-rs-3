import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

test.describe('Authentication and Custom Roles Permissions Verification', () => {
  test('Auth Flow: Email OTP authentication sets cms_session and navigates to /app', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/sign-in/);

    // Fill in email
    const emailInput = page.locator('input[type="email"], input[id="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('owner-test@company.com');

    // Click submit to send code
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Verify OTP input fields appear
    const otpInput = page.locator('#otp');
    await expect(otpInput).toBeVisible({ timeout: 10_000 });

    // Retrieve the newly generated OTP from VerificationToken table
    const otp = execFileSync(
      'psql',
      [
        'postgresql://postgres:postgres@localhost:5432/cms',
        '-t',
        '-A',
        '-c',
        "SELECT token FROM \"VerificationToken\" WHERE identifier = 'otp:sign-in:owner-test@company.com' ORDER BY expires_at DESC LIMIT 1;",
      ],
      { encoding: 'utf-8' }
    ).trim();

    await otpInput.fill(otp);

    // Should redirect to /app
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

    // Verify dashboard rendered
    await expect(page.locator('text=Overview').first()).toBeVisible();
    await expect(page.locator('text=owner-test@company.com')).toBeVisible();
  });

  test('Permissions: Owner has full access to workspace roles and management', async ({ browser }) => {
    // Session token for u-owner-001 (Alice Owner)
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: '5e087bd5-09bf-4472-afcf-551f37c6b35d',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Verify owner account displays
    await expect(page.locator('text=owner-test@company.com')).toBeVisible();

    // Test API call as owner to list workspace roles
    const rolesRes = await page.request.get('/api/workspaces/org-security-demo-1/roles');
    expect(rolesRes.status()).toBe(200);
    const rolesData = await rolesRes.json();
    const roleNames = rolesData.data.map((r: { name: string }) => r.name);
    expect(roleNames).toContain('SupportAgent');
    expect(roleNames).toContain('Developer');

    // Test API call as owner to create an invitation (permitted for owner)
    const inviteRes = await page.request.post('/api/orgs/org-security-demo-1/invitations', {
      data: {
        email: `test-invited-${Date.now()}@company.com`,
        role: 'member',
      },
    });
    expect(inviteRes.status()).toBe(200);

    await context.close();
  });

  test('Permissions: Restricted user (SupportAgent) is forbidden from managing roles and members', async ({ browser }) => {
    // Session token for u-restricted-002 (Bob Restricted)
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: 'a1f00426-34c9-40be-be9a-fcbebb16cea0',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Verify restricted account displays
    await expect(page.locator('text=restricted-test@company.com')).toBeVisible();

    // Test API call as restricted user to delete role -> MUST BE 403 Forbidden
    const deleteRoleRes = await page.request.delete('/api/workspaces/org-security-demo-1/roles/role-developer');
    expect(deleteRoleRes.status()).toBe(403);

    // Test API call as restricted user to invite members -> MUST BE 403 Forbidden
    const inviteRes = await page.request.post('/api/orgs/org-security-demo-1/invitations', {
      data: {
        email: 'unauthorized-invite@company.com',
        role: 'member',
      },
    });
    expect(inviteRes.status()).toBe(403);

    await context.close();
  });
});
