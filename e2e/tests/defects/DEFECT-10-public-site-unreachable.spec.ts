import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * DEFECT-10 (open): a published documentation site is unreachable on a loopback
 * host, and the studio's own "View site" link lands on the CMS application.
 *
 * `HostResolver::resolve_from_database` short-circuits for `localhost`,
 * `127.0.0.1`, `[::1]`, `::1` and `0.0.0.0`, returning "no project". Both the
 * root and wildcard handlers then fall through to `serve_spa_file("index.html")`
 * — the studio — with HTTP 200.
 *
 * Consequences, all reproducible below:
 *   * `GET /sites/{projectId}` returns the studio shell for every project, even
 *     one with an ACTIVE deployment.
 *   * The publish dialog's "View site" button links to exactly that URL, so an
 *     author who clicks it is not taken to their documentation.
 *   * Unknown or unpublished documentation paths answer 200 instead of 404, so
 *     crawlers index the CMS shell as a documentation page.
 *
 * These tests are the executable form of the report. They FAIL today and must
 * keep failing until the product resolves `/sites/{projectId}/**` to the
 * project (or serves a real 404 for it).
 */
test.describe('DEFECT-10 — published site reachability', () => {
  test('a published project is served at its /sites/{projectId} URL', async ({
    page,
    editor,
    publish,
    project,
    db,
    diagnostics,
  }) => {
    test.setTimeout(300_000);

    const title = uniqueName('Reachable Release');
    const markerText = `reachable-body-${Date.now()}`;

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.setBody(`# ${title}\n\n${markerText}\n`);

    expect(await publish.publishAndWait({ message: 'Reachability' })).toBe('ready');
    await publish.closePipeline();

    // The release genuinely exists…
    const active = await db.count(
      `SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1 AND status = 'ACTIVE'`,
      [project.id],
    );
    expect(active, 'the release must be live in the database').toBe(1);
    const snapshotted = await db.count(
      `SELECT count(*) AS count FROM "DeploymentSnapshotPageIndex" i
         JOIN "Deployment" d ON d.id = i.deployment_id
        WHERE d.project_id = $1`,
      [project.id],
    );
    expect(snapshotted, 'the release snapshot must contain the published page').toBeGreaterThan(0);

    // …but a reader following the public URL must not be shown the CMS.
    const response = await page.goto(`/sites/${project.id}`);
    expect(response?.status(), 'the published site must not answer 404').toBe(200);

    const shell = await page.evaluate(() => ({
      hasStudioRoot: Boolean(document.querySelector('#root, [data-tanstack-router]')),
      title: document.title,
    }));
    expect(
      shell.hasStudioRoot,
      `DEFECT-10: /sites/{projectId} served the studio application (title "${shell.title}") ` +
        'instead of the published documentation site',
    ).toBe(false);

    await expect(page.locator('article')).toContainText(markerText);
    diagnostics.assertClean({ label: 'public reachability: ' });
  });

  test('an unpublished documentation path answers 404 rather than the studio shell', async ({
    page,
    project,
  }) => {
    const response = await page.goto(`/sites/${project.id}/this-page-was-never-published`);
    expect(
      response?.status(),
      'a documentation URL that does not exist must not be served as the CMS shell',
    ).toBe(404);
  });
});