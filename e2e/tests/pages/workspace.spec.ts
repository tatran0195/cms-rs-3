import { expect, test } from '../../src/fixtures/test';

test.describe('Workspace Navigation & Dashboards', () => {
  test('root route / redirects authenticated user to /app', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await expect(authenticatedPage).toHaveURL(/\/app/);
  });

  test('dashboard renders overview sections and stats', async ({ authenticatedPage, dashboard }) => {
    await dashboard.goto();
    await dashboard.expectOverviewVisible();
  });

  test('quick search modal opens and displays input', async ({ authenticatedPage, dashboard }) => {
    await dashboard.goto();
    await dashboard.openQuickSearch();
  });

  test('sites list page renders at /app/sites', async ({ authenticatedPage, sites }) => {
    await sites.goto();
    await sites.expectSitesListVisible();
  });

  test('cross-project analytics renders metrics at /app/analytics', async ({ authenticatedPage, analytics }) => {
    await analytics.goto();
    await analytics.expectAnalyticsVisible();
  });
});
