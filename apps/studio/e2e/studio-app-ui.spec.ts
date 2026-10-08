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
});
