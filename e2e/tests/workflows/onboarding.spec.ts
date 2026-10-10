import { expect, test } from '../../src/fixtures/test';
import { uniqueEmail } from '../../src/support/data';

/**
 * First-run / empty-workspace behaviour.
 *
 * Regression coverage for DEFECT-01 (fixed in this repository):
 * `GET /api/app/workspace/analytics` previously produced errors
 * for an account that had not created a site yet. The studio dashboard
 * requests that endpoint as soon as anyone signs in, so every brand-new user's
 * first landing produced two failed requests and two console errors. The
 * endpoint now answers 200 with an explicitly empty payload.
 *
 * If someone reintroduces errors these tests fail; they must not be relaxed.
 */
test.describe('first run with an empty workspace', () => {
  test('a new account lands on the workspace dashboard without a failed request', async ({ page, signIn, mailbox, diagnostics }) => {
    const email = uniqueEmail('firstrun');

    await signIn.signIn(email, mailbox);

    // The workspace has no projects yet at this point.
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { name: 'Your sites' })).toBeVisible();

    const analytics = await page.request.get('/api/app/workspace/analytics?range=30d');
    expect(analytics.status(), 'empty workspace analytics must not be a 404').toBe(200);
    const body = await analytics.json();
    expect(body.data).toBeTruthy();
    expect(body.data.totalViews).toBe(0);
    expect(body.data.timeseries).toEqual([]);

    diagnostics.assertClean({ label: 'first run: ' });
  });

  test('the dashboard analytics panel renders the empty state', async ({ page, signIn, mailbox, diagnostics }) => {
    const email = uniqueEmail('emptyanalytics');

    await signIn.signIn(email, mailbox);
    await page.goto('/app/analytics');
    await expect(page).toHaveURL(/\/app\/analytics/);
    // Either the empty chart or an explicit no-data message — never an error.
    await expect(page.getByText(/No traffic yet|No searches yet/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/failed to load|something went wrong|unexpected error/i)).toHaveCount(0);

    diagnostics.assertClean({ label: 'empty analytics panel: ' });
  });

  test('after creating a site the same endpoint reports real availability', async ({ page, signIn, dashboard, mailbox, diagnostics }) => {
    const email = uniqueEmail('withorg');

    await signIn.signIn(email, mailbox);
    await dashboard.createSite('E2E Availability Site');

    const analytics = await page.request.get('/api/app/workspace/analytics?range=30d');
    expect(analytics.status()).toBe(200);
    const body = await analytics.json();
    expect(['available', 'no_data']).toContain(body.data.availability);

    diagnostics.assertClean({ label: 'analytics availability: ' });
  });
});
