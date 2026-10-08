import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Version lifecycle.
 *
 * Authors see "versions"; the product stores them as branches. A version is a
 * full copy of the site's pages, so the interesting questions are all about
 * isolation: does editing v2 damage v1, does publishing v2 replace the live
 * site, and what does promoting a version do to the other one?
 */
test.describe('versions', () => {
  test('a version starts as a copy of the default version and edits are isolated', async ({
    editor,
    project,
    db,
  }) => {
    const shared = uniqueName('Shared Page');
    const onlyInNew = uniqueName('Only In V2');

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(shared);
    await editor.waitForSaved();

    await editor.createVersion('v2-e2e');

    // The copy contains the page it inherited.
    await editor.expectPageVisible(shared, 'en');

    // Editing inside the new version must not touch the default version.
    await editor.createPage('en');
    await editor.setTitle(onlyInNew);
    await editor.waitForSaved();

    const inNewVersion = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2`, [
      project.id,
      onlyInNew,
    ]);
    expect(inNewVersion).toBe(1);

    // The default branch is a different branch id: confirm the page only exists there.
    const branches = await db.query(`SELECT id, name, is_default FROM "Branch" WHERE project_id = $1 ORDER BY created_at`, [
      project.id,
    ]);
    expect(branches).toHaveLength(2);
    const defaultBranch = branches.find((b) => b.is_default === 'true')!;
    const scoped = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2 AND branch_id = $3`, [
      project.id,
      onlyInNew,
      defaultBranch.id,
    ]);
    expect(scoped, 'a new version must not leak pages into the default version').toBe(0);
  });

  test('switching versions shows each version’s own tree', async ({ editor, project }) => {
    const onlyInMain = uniqueName('Main Only');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(onlyInMain);

    await editor.createVersion('v-alt');
    await editor.expectPageAbsent(onlyInMain, 'en');

    await editor.switchVersion('main');
    await editor.expectPageVisible(onlyInMain, 'en');
  });

  test('publishing while a non-default version is selected still releases the default version',
    async ({ page, editor, publish, site, project, db }) => {
      const title = uniqueName('Branch Publish');
      const mainBody = `main-body-${Date.now()}`;
      const v2Body = `v2-body-${Date.now()}`;

      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${mainBody}\n`);

      await editor.createVersion('v2-branch');
      await editor.setBody(`# ${title}\n\n${v2Body}\n`);
      await editor.waitForSaved();

      const outcome = await publish.publishAndWait();
      expect(outcome).toBe('ready');
      await publish.closePipeline();

      // Which branch did the release actually capture? Ask the release, not the UI.
      const deployment = await db.one(
        `SELECT d.branch_id, b.name AS branch_name, b.is_default
           FROM "Deployment" d JOIN "Branch" b ON b.id = d.branch_id
          WHERE d.project_id = $1 AND d.status = 'ACTIVE'
          ORDER BY d.created_at DESC LIMIT 1`,
        [project.id],
      );
      expect(deployment.branch_name).toBe('main');
      expect(deployment.is_default).toBe('true');

      await site.open(project.id, slugOf(title));
      await site.expectContains(mainBody);
      void page;
    });

  test('promoting a version into main replaces main’s pages and retires the version', async ({
    editor,
    project,
    db,
  }) => {
    const mainOnly = uniqueName('Main Only');
    const versionOnly = uniqueName('Version Only');

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(mainOnly);

    await editor.createVersion('v-promote');
    await editor.createPage('en');
    await editor.setTitle(versionOnly);
    await editor.waitForSaved();

    await editor.promoteActiveVersion();

    // Main now carries the promoted page; the retired version is gone.
    await editor.expectPageVisible(versionOnly, 'en');
    const branches = await db.query(`SELECT name FROM "Branch" WHERE project_id = $1`, [project.id]);
    expect(branches.map((b) => b.name)).not.toContain('v-promote');

    const promoted = await db.count(
      `SELECT count(*) AS count FROM "Page" p JOIN "Branch" b ON b.id = p.branch_id
        WHERE p.project_id = $1 AND p.title = $2 AND b.is_default`,
      [project.id, versionOnly],
    );
    expect(promoted).toBeGreaterThan(0);
  });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}