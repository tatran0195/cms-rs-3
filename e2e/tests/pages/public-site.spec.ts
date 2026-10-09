import { expect, test } from '../../src/fixtures/test';

test.describe('Public Documentation Site Reader', () => {
  test('loads public site reader and renders content', async ({ authenticatedPage, sites, page }) => {
    await sites.goto();
    const siteCard = authenticatedPage.locator('button.group, button:has-text("/")').first();
    await expect(siteCard).toBeVisible({ timeout: 15_000 });
    await siteCard.click();
    await authenticatedPage.waitForURL(/\/app\/projects\/([^/?#]+)/, { timeout: 15_000 });
    const match = authenticatedPage.url().match(/\/app\/projects\/([^/?#]+)/);
    const projectId = match ? match[1] : '';

    if (projectId) {
      await page.goto(`/sites/${projectId}`);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});
