import { expect, test } from '../../src/fixtures/test';

test.describe('Project Workspace & Studio Pages', () => {
  let projectId: string;

  test.beforeEach(async ({ authenticatedPage, sites }) => {
    await sites.goto();
    const siteCard = authenticatedPage.locator('button.group, button:has-text("/")').first();
    await expect(siteCard).toBeVisible({ timeout: 15_000 });
    await siteCard.click();
    await authenticatedPage.waitForURL(/\/app\/projects\/([^/?#]+)/, { timeout: 15_000 });
    const match = authenticatedPage.url().match(/\/app\/projects\/([^/?#]+)/);
    projectId = match ? match[1] : '';
  });

  test('loads project overview hub', async ({ authenticatedPage, projectWorkspace }) => {
    await projectWorkspace.goto(projectId);
    await projectWorkspace.expectLoaded();
  });

  test('loads TipTap markdown/visual editor at /editor', async ({ authenticatedPage, editor }) => {
    await editor.goto(projectId);
    await expect(authenticatedPage.locator('body')).toContainText(/Settings|Preview|Pages/i, { timeout: 15_000 });
  });

  test('loads document preview at /preview', async ({ authenticatedPage, preview }) => {
    await preview.goto(projectId);
    await preview.expectPreviewLoaded();
  });

  test('loads project analytics at /analytics', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/app/projects/${projectId}/analytics`);
    await expect(authenticatedPage.locator('body')).toContainText(/Analytics|Traffic|Views/i, { timeout: 15_000 });
  });

  test('loads project settings and asserts strictly no billing section exists', async ({ authenticatedPage, projectSettings }) => {
    await projectSettings.goto(projectId, 'general');
    await projectSettings.expectLoaded();
    await projectSettings.assertNoBillingSection();
  });
});
