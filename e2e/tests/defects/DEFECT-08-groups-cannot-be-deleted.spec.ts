import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * DEFECT-08 (open): a group created in the studio cannot be deleted through the
 * UI.
 *
 * Selecting a group opens the navigation-container panel, which offers
 * "Page settings" and "New page" but no delete action; the Page settings dialog
 * offers only General / SEO / Behaviour / Cancel / Save / Close. The project
 * Danger section deletes the whole project, not an individual node, and there
 * is no row context menu or bulk action anywhere else.
 *
 * The first test states the behaviour the product should have and therefore
 * FAILS today. It is retained deliberately: it is the regression that should
 * start passing the moment a delete affordance is added, and until then it is
 * the executable form of the defect report. Do not delete or weaken it.
 *
 * The second test verifies the cascade semantics behind that missing button.
 * The group and its child are still created through the UI; only the deletion
 * is issued from the authenticated browser session, because the UI cannot
 * express it. That is the documented "independent verification" case, not a
 * substitute for the user operation the first test is still missing.
 */
test.describe('DEFECT-08 — group deletion', () => {
  test('a group can be deleted by an author from the editor', async ({ editor, project, db }) => {
    const group = uniqueName('Removable Group');
    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await expect(editor.rowByTitle(group, 'en')).toBeVisible();

    // The author selects the group and looks for a way to remove it.
    await editor.openPage(group, 'en');
    await editor.deleteOpenPage();

    await editor.expectPageAbsent(group, 'en');
    expect(
      await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2`, [
        project.id,
        group,
      ]),
    ).toBe(0);
  });

  test('deleting a group detaches its documents instead of corrupting them', async ({
    editor,
    project,
    browserApi,
    db,
    diagnostics,
  }) => {
    const group = uniqueName('Cascade Group');
    const child = uniqueName('Cascade Child');

    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await editor.createChildPage(group, 'en');
    await editor.setTitle(child);
    await editor.expectPageVisible(child, 'en');

    const before = await db.query(
      `SELECT c.id FROM "Page" c JOIN "Page" g ON g.id = c.parent_id
        WHERE g.project_id = $1 AND c.title = $2 AND g.title = $3`,
      [project.id, child, group],
    );
    expect(before, 'the child must start inside the group').toHaveLength(1);

    // No UI affordance exists for this (see the note above), so the deletion is
    // issued from the real session the browser already holds.
    const groupRow = await editor.pageRowData(group, 'en');
    expect(groupRow?.kind, 'the group node must be identifiable before deleting it').toBe('GROUP');

    const response = await browserApi.request(
      'DELETE',
      `/api/app/projects/${project.id}/pages/${groupRow!.id}`,
    );
    expect(response.status, 'the backend accepts the deletion the UI cannot issue').toBeLessThan(400);

    // Nothing may point at a page that no longer exists…
    const dangling = await db.query(
      `SELECT c.title FROM "Page" c LEFT JOIN "Page" g ON g.id = c.parent_id
        WHERE c.project_id = $1 AND c.parent_id IS NOT NULL AND g.id IS NULL`,
      [project.id],
    );
    expect(dangling, 'no page may keep a dangling parent reference').toHaveLength(0);

    // …the document survives…
    const survivors = await db.query(`SELECT title, parent_id FROM "Page" WHERE project_id = $1 AND title = $2`, [
      project.id,
      child,
    ]);
    expect(survivors, 'deleting a group must not delete its documents').toHaveLength(1);

    // …and the tree the author sees agrees with the database. The delete was
    // issued outside the UI, so nothing invalidated its cache: reload the way a
    // person would and check what they now see.
    await editor.reload(project.id);
    await editor.expectPageAbsent(group, 'en');
    await editor.expectPageVisible(child, 'en');

    diagnostics.assertClean({ label: 'group delete cascade: ' });
  });
});