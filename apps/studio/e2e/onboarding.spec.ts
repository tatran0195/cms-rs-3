import { expect, test } from '@playwright/test';

test.describe('First-Time Application Onboarding & Setup Flow', () => {
  test('Redirects uninitialized instances from root / to /onboarding', async ({ page }) => {
    // Mock setup status returning requiresSetup = true
    await page.route('**/api/public/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isInitialized: false,
          requiresSetup: true,
          configuredOauthProviders: ['google', 'github'],
        }),
      });
    });

    await page.goto('/');
    await page.waitForURL('**/onboarding');
    await expect(page.getByText('First-Time Platform Setup')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Account' })).toBeVisible();
  });

  test('Redirects uninitialized instances from /sign-in to /onboarding', async ({ page }) => {
    await page.route('**/api/public/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isInitialized: false,
          requiresSetup: true,
          configuredOauthProviders: [],
        }),
      });
    });

    await page.goto('/sign-in');
    await page.waitForURL('**/onboarding');
    await expect(page.getByText('First-Time Platform Setup')).toBeVisible();
  });

  test('Redirects already initialized instances away from /onboarding to /app', async ({ page }) => {
    await page.route('**/api/public/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isInitialized: true,
          requiresSetup: false,
          configuredOauthProviders: [],
        }),
      });
    });

    await page.goto('/onboarding');
    await page.waitForURL('**/app');
  });

  test('Completes the 5-step onboarding wizard and validates fields', async ({ page }) => {
    let setupCompleted = false;

    await page.route('**/api/public/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isInitialized: setupCompleted,
          requiresSetup: !setupCompleted,
          configuredOauthProviders: ['google', 'github'],
        }),
      });
    });

    await page.route('**/api/public/setup/complete', async (route) => {
      setupCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Set-Cookie': 'cms_session=test-admin-session-token; Path=/; HttpOnly',
        },
        body: JSON.stringify({
          success: true,
          user: {
            id: 'admin-1',
            email: 'admin@company.com',
            name: 'Alex Admin',
            role: 'admin',
          },
          redirectUrl: '/app',
        }),
      });
    });

    await page.goto('/onboarding');
    await expect(page.getByText('First-Time Platform Setup')).toBeVisible();

    // Step 1: Admin Account
    const continueBtn = page.getByRole('button', { name: /continue/i });

    // Validate required fields
    await continueBtn.click();
    await expect(page.getByText('Please provide your full name')).toBeVisible();

    await page.fill('#admin-name', 'Alex Admin');
    await page.fill('#admin-email', 'admin@company.com');
    await page.fill('#admin-password', 'SecretPassword123!');
    await page.fill('#admin-confirm-password', 'DifferentPassword');

    await continueBtn.click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();

    await page.fill('#admin-confirm-password', 'SecretPassword123!');
    await continueBtn.click();

    // Step 2: Workspace Profile
    await expect(page.getByLabel('Workspace / Organization Name')).toBeVisible();
    await page.fill('#ws-name', 'Engineering Handbook');
    await expect(page.locator('#ws-slug')).toHaveValue('engineering-handbook');

    await continueBtn.click();

    // Step 3: Authentication Policies
    await expect(page.getByText('User Registration Mode')).toBeVisible();
    await expect(page.getByText('Invite-Only')).toBeVisible();
    await expect(page.getByText('Open Registration')).toBeVisible();

    // Select Invite-Only (default) and advance
    await continueBtn.click();

    // Step 4: Appearance & Theme
    await expect(page.getByText('Default Platform Theme')).toBeVisible();
    await expect(page.getByText('Dark Mode')).toBeVisible();
    await page.getByText('Dark Mode').click();

    await continueBtn.click();

    // Step 5: Review & Launch
    await expect(page.getByText('Ready to Initialize Platform')).toBeVisible();
    await expect(page.getByText('Alex Admin')).toBeVisible();
    await expect(page.getByText('admin@company.com')).toBeVisible();
    await expect(page.getByText('engineering-handbook')).toBeVisible();

    // Test Back button preserves previous state
    const backBtn = page.getByRole('button', { name: /back/i });
    await backBtn.click();
    await expect(page.getByText('Default Platform Theme')).toBeVisible();

    // Advance forward again
    await continueBtn.click();
    await expect(page.getByText('Ready to Initialize Platform')).toBeVisible();

    // Click Launch
    const launchBtn = page.getByRole('button', { name: /initialize & launch platform/i });
    await launchBtn.click();

    // Expect navigation to /app
    await page.waitForURL('**/app');
  });
});
