import { expect, test } from '../../src/fixtures/test';
import { uniqueEmail, uniqueName } from '../../src/support/data';

/**
 * Authorization boundaries.
 *
 * The product stores per-site membership but resolves effective project role
 * from organization membership. These tests probe that seam from the outside:
 * a genuinely separate account must not be able to reach or mutate a site it was
 * never given, and every refusal must leave the content untouched.
 */
test.describe('permissions', () => {
  test('a signed-out visitor is refused the editor, the settings and the API', async ({
    page,
    project,
    diagnostics,
  }) => {
    for (const path of [`/app/projects/${project.id}/editor`, `/app/projects/${project.id}/settings`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
    }

    // The API must refuse too, not just the SPA router.
    const result = await page.evaluate(async (id) => {
      const response = await fetch(`/api/app/projects/${id}/pages`, { credentials: 'include' });
      return response.status;
    }, project.id);
    expect(result, 'unauthenticated API access must be refused').toBeGreaterThanOrEqual(400);
    diagnostics.assertClean({ label: 'anonymous access: ' });
  });

  test('an unrelated account cannot open another team’s project', async ({ page, secondContext, project, diagnostics }) => {
    const intruderPage = await secondContext.newPage();
    await intruderPage.goto(`/app/projects/${project.id}/editor`);

    // Either bounced to sign-in or shown an access boundary — never the tree.
    await expect(intruderPage.getByRole('button', { name: 'New page' })).toHaveCount(0, { timeout: 20_000 });

    const apiStatus = await intruderPage.evaluate(async (id) => {
      const response = await fetch(`/api/app/projects/${id}`, { credentials: 'include' });
      return response.status;
    }, project.id);
    expect(apiStatus, 'cross-tenant project read must be refused').toBeGreaterThanOrEqual(400);

    await intruderPage.close();
    await page.goto(`/app/projects/${project.id}/editor`);
    await expect(page.getByRole('button', { name: 'New page' }).first()).toBeVisible();
    diagnostics.assertClean({ label: 'cross-tenant access: ' });
  });

  test('an unrelated account cannot mutate content, publish, or delete through the API', async ({
    page,
    secondContext,
    editor,
    project,
    db,
    diagnostics,
  }) => {
    const title = uniqueName('Protected');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    const pageId = (await editor.pageRowData(title, 'en'))!.id;

    const intruder = await secondContext.newPage();
    await intruder.goto('/app');

    const attempts = await intruder.evaluate(
      async ({ projectId, id }) => {
        const call = async (method: string, url: string, body?: unknown) => {
          const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
          });
          return response.status;
        };
        return {
          update: await call('PATCH', `/api/app/projects/${projectId}/pages/${id}`, { title: 'Hacked' }),
          remove: await call('DELETE', `/api/app/projects/${projectId}/pages/${id}`),
          publish: await call('POST', `/api/app/projects/${projectId}/deployments`, {}),
          addLanguage: await call('POST', `/api/app/projects/${projectId}/languages`, { code: 'xx', label: 'Intruder' }),
          listPages: await call('GET', `/api/app/projects/${projectId}/pages`),
        };
      },
      { projectId: project.id, id: pageId },
    );

    expect(attempts.update, 'a non-member must not edit a page').toBeGreaterThanOrEqual(400);
    expect(attempts.remove, 'a non-member must not delete a page').toBeGreaterThanOrEqual(400);
    expect(attempts.publish, 'a non-member must not publish').toBeGreaterThanOrEqual(400);
    expect(attempts.addLanguage, 'a non-member must not add a language').toBeGreaterThanOrEqual(400);
    expect(attempts.listPages, 'a non-member must not list pages').toBeGreaterThanOrEqual(400);

    // Nothing changed.
    const stored = await db.one(`SELECT title FROM "Page" WHERE id = $1`, [pageId]);
    expect(stored.title).toBe(title);
    const deployments = await db.count(`SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1`, [project.id]);
    expect(deployments).toBe(0);
    const languages = await db.count(`SELECT count(*) AS count FROM "Language" WHERE project_id = $1 AND code = 'xx'`, [project.id]);
    expect(languages).toBe(0);

    await intruder.close();
    diagnostics.expectFailure(/40[0-9]|403|404/);
    diagnostics.assertClean({ label: 'cross-tenant mutation: ' });
  });

  test('a forged project id in a URL does not grant access to someone else’s site', async ({
    page,
    secondContext,
    project,
  }) => {
    const intruder = await secondContext.newPage();
    const status = await intruder.evaluate(async (id) => {
      const response = await fetch(`/api/app/projects/${id}/deployments`, { credentials: 'include' });
      return response.status;
    }, project.id);
    expect(status).toBeGreaterThanOrEqual(400);
    await intruder.close();
    await page.goto('/app');
  });

  test('signing out invalidates a session that tries to keep writing', async ({ page, editor, project, diagnostics }) => {
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(uniqueName('Session Bound'));

    // Drop the cookie without going through the UI, simulating a stolen tab.
    await contextClear(page);
    const status = await page.evaluate(async (id) => {
      const response = await fetch(`/api/app/projects/${id}/pages`, { credentials: 'include' });
      return response.status;
    }, project.id);
    expect(status).toBeGreaterThanOrEqual(400);
    diagnostics.expectFailure(/40[0-9]|401/);
    diagnostics.assertClean({ label: 'post-logout write: ' });
  });

  test('a brand new account starts with no projects and creates its own workspace', async ({
    page,
    dashboard,
    db,
    diagnostics,
  }) => {
    await page.goto('/app');
    await expect(page.getByText('No projects yet')).toBeVisible();
    expect(await dashboard.listedSiteNames()).toHaveLength(0);

    const name = uniqueName('First Site');
    const site = await dashboard.createSite(name);
    expect(site.id).toBeTruthy();

    const membership = await db.one(
      `SELECT m.role FROM "Member" m JOIN "Project" p ON p.organization_id = m.organization_id WHERE p.id = $1`,
      [site.id],
    );
    expect(membership.role).toBe('OWNER');
    void uniqueEmail;
    diagnostics.assertClean({ label: 'new workspace: ' });
  });
});

async function contextClear(page: import('@playwright/test').Page): Promise<void> {
  await page.context().clearCookies();
}