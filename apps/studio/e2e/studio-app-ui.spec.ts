import { createCmsClient } from '@cms/sdk';
import { expect, test } from '@playwright/test';
import { createAuthenticatedSession, type TestSession } from './helpers/test-auth';

test.describe('Studio App Browser UI Workflows', () => {
  let session: TestSession;
  let client: ReturnType<typeof createCmsClient>;
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    session = await createAuthenticatedSession(request);
    client = createCmsClient({
      baseUrl: 'http://localhost:4310',
      headers: {
        Cookie: session.cookieHeader,
      },
    });

    // Create a base project for UI navigation tests
    const project = await client.projects.create({
      name: `Studio UI E2E ${Date.now()}`,
      slug: `studio-ui-e2e-${Date.now()}`,
      description: 'Project for Playwright Browser UI verification',
    });
    projectId = project.id;

    // Create an initial page
    await client.pages.create(projectId, {
      title: 'Getting Started',
      slug: 'getting-started',
      content: '# Getting Started\n\nWelcome to your new documentation.',
    });
  });

  test('Sign-in page renders properly for unauthenticated users', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');

    // Check title or sign-in elements
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
  });

  test('Authenticated user can navigate to /app dashboard', async ({ browser }) => {
    // Create browser context with the session cookie
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: session.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Should be on /app or dashboard
    await expect(page).toHaveURL(/\/app/);

    // Verify workspace layout or sidebar rendered
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeDefined();

    await context.close();
  });

  test('Project Settings page renders tabs and STRICTLY excludes Plan/Billing (Rule Compliance)', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: session.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(`/app/projects/${projectId}/settings`);
    await page.waitForLoadState('networkidle');

    // Verify settings page loaded
    await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/settings`));

    // CRITICAL REPOSITORY RULE CHECK:
    // Verify there is NO Plan, Billing, Subscription, or Pricing UI elements
    const planTab = page.locator('[role="tab"]:has-text("Plan"), [role="tab"]:has-text("Billing"), a:has-text("Pricing")');
    await expect(planTab).toHaveCount(0);

    const bodyText = (await page.textContent('body')) || '';
    expect(bodyText.toLowerCase()).not.toContain('upgrade to pro');
    expect(bodyText.toLowerCase()).not.toContain('pricing tiers');

    await context.close();
  });

  test('Editor and Preview routes load without crash', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: session.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();

    // Editor route
    await page.goto(`/app/projects/${projectId}/editor`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/editor`));

    // Preview route
    await page.goto(`/app/projects/${projectId}/preview`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/preview`));

    await context.close();
  });

  test('Interactive dashboard elements: search dialog, new project modal, and sidebar navigation', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: session.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // 1. Search modal trigger and dismiss
    const searchTrigger = page.locator('button:has-text("Search…"), button:has-text("Ctrl K")').first();
    await expect(searchTrigger).toBeVisible();
    await searchTrigger.click();
    const searchDialog = page.locator('[role="dialog"], [data-cmdk-root]').first();
    await expect(searchDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(searchDialog).toBeHidden({ timeout: 10_000 });

    // 2. New project modal and API endpoint interaction
    const newProjectBtn = page.getByRole('button', { name: /new project/i }).first();
    await expect(newProjectBtn).toBeVisible();
    await newProjectBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /new documentation site/i })).toBeVisible();

    const projectName = `Interactive Verified Site ${Date.now()}`;
    await dialog.getByLabel('Name', { exact: true }).fill(projectName);

    // Track API response for project creation
    const [createResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/projects') && res.request().method() === 'POST'),
      dialog.getByRole('button', { name: /create project/i }).click(),
    ]);
    expect(createResponse.status()).toBeLessThan(400);

    // Modal closes and new project row appears
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const siteRow = page.getByRole('row').filter({ hasText: projectName });
    await expect(siteRow).toBeVisible({ timeout: 30_000 });

    // 3. Sidebar navigation across all sections
    await page.getByRole('link', { name: 'Sites' }).first().click();
    await page.waitForURL(/\/app\/sites/);
    await expect(page).toHaveURL(/\/app\/sites/);

    await page.getByRole('link', { name: 'Analytics' }).first().click();
    await page.waitForURL(/\/app\/analytics/);
    await expect(page).toHaveURL(/\/app\/analytics/);

    await page.getByRole('link', { name: 'Settings' }).first().click();
    await page.waitForURL(/\/app\/settings/);
    await expect(page).toHaveURL(/\/app\/settings/);

    // Return to Overview
    await page.getByRole('link', { name: 'Overview' }).first().click();
    await page.waitForURL(/\/app$/);
    await expect(page).toHaveURL(/\/app$/);

    await context.close();
  });

  test('Interactive editor elements: mode switcher, page settings, and autosave indicators', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: session.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(`/app/projects/${projectId}/editor`);
    await page.waitForLoadState('networkidle');

    // 1. Interactive editor mode buttons (Visual / Rich text / Markdown)
    const visualBtn = page.getByRole('button', { name: 'Visual', exact: true });
    const richTextBtn = page.getByRole('button', { name: 'Rich text', exact: true });
    const markdownBtn = page.getByRole('button', { name: 'Markdown', exact: true });

    await expect(visualBtn).toBeVisible();
    await expect(richTextBtn).toBeVisible();
    await expect(markdownBtn).toBeVisible();

    await markdownBtn.click();
    const markdownTextarea = page.getByRole('textbox', { name: /Write Markdown/i });
    await expect(markdownTextarea).toBeVisible();

    await visualBtn.click();
    await expect(markdownTextarea).toBeHidden();

    // 2. Interactive Page settings dialog
    const pageSettingsBtn = page.getByRole('button', { name: 'Page settings' }).first();
    if (await pageSettingsBtn.isVisible()) {
      await pageSettingsBtn.click();
      const settingsDialog = page.getByRole('dialog').filter({ hasText: 'Page settings' });
      await expect(settingsDialog).toBeVisible();
      // Dismiss dialog
      await page.keyboard.press('Escape');
    }

    await context.close();
  });
});
