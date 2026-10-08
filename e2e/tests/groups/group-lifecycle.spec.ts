import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Group lifecycle.
 *
 * In this product a "group" is a folder node in the page tree (`kind = GROUP`)
 * that owns child pages through `parent_id` + a materialized path. These tests
 * treat it as a real business object: containment, membership, nesting, and the
 * destructive edges that break naive CRUD assumptions.
 */
test.describe('groups', () => {
  test('creates a group and adds a document to it', async ({ editor, project, db }) => {
    const group = uniqueName('Public Documentation');
    const child = uniqueName('Child');

    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await editor.expectPageVisible(group, 'en');

    await editor.createChildPage(group, 'en');
    await editor.setTitle(child);
    await editor.expectPageVisible(child, 'en');

    const rows = await db.query(
      `SELECT c.title AS child, g.kind AS group_kind, c.path AS child_path, g.path AS group_path
         FROM "Page" c JOIN "Page" g ON g.id = c.parent_id
        WHERE g.project_id = $1 AND c.title = $2`,
      [project.id, child],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group_kind).toBe('GROUP');
    // Membership is expressed through the materialized path, not just parent_id.
    expect(rows[0]!.child_path.startsWith(rows[0]!.group_path!)).toBe(true);
  });

  test('a group with no documents is still a first-class entity in the tree and the database', async ({
    editor,
    project,
    page,
    db,
  }) => {
    const group = uniqueName('Empty Group');
    await editor.goto(project.id);
    await editor.createGroup('en', group);

    const stored = await db.one(`SELECT kind FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, group]);
    expect(stored.kind).toBe('GROUP');
    await editor.expectPageVisible(group, 'en');

    // Selecting a group opens the navigation container panel, not a document
    // editor — that is what the product does for a group.
    await editor.openPage(group, 'en');
    await expect(page.getByText(/Groups organize related pages/i)).toBeVisible();
  });

  test('a group in one language cannot adopt a page from another language', async ({
    editor,
    project,
    db,
    diagnostics,
  }) => {
    const group = uniqueName('EN Group');
    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await editor.addCustomLanguage('vi', 'Tiếng Việt');
    await editor.expectLanguageVisible('vi');

    const groupRow = (await editor.pageRowData(group, 'en'))!;
    const englishLanguage = await db.one(`SELECT id FROM "Language" WHERE project_id = $1 AND code = 'en'`, [project.id]);

    // Forge the relationship a stale client could send: re-parent the English
    // group under a Vietnamese page (or at minimum move it to another language).
    const forged = await editor.updatePageViaBrowserApi(project.id, groupRow.id, { languageId: 'vi' });
    expect(forged.status, 'moving a page to a language that is not its own must be rejected').toBeGreaterThanOrEqual(400);

    const after = await db.one(`SELECT language_id FROM "Page" WHERE id = $1`, [groupRow.id]);
    expect(after.language_id, 'a rejected update must not mutate the page').toBe(englishLanguage.id);
    diagnostics.expectFailure(/40[0-9]|409|400/);
    diagnostics.assertClean({ label: 'cross-language group: ' });
  });

  test('groups nest: a document under a group inherits the group path prefix', async ({ editor, project, db }) => {
    const outer = uniqueName('Outer');
    const inner = uniqueName('Inner');
    await editor.goto(project.id);
    await editor.createGroup('en', outer);
    await editor.createChildPage(outer, 'en');
    await editor.setTitle(inner);

    const row = await db.one(`SELECT path, parent_id FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, inner]);
    const parent = await db.one(`SELECT path FROM "Page" WHERE id = $1`, [row.parent_id]);
    expect(row.path).toBe(`${parent.path}/${slugOf(inner)}`);
  });

  test('renaming a group re-anchors the paths of its documents', async ({ editor, project, db }) => {
    const group = uniqueName('Before Rename');
    const child = uniqueName('Movable');
    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await editor.createChildPage(group, 'en');
    await editor.setTitle(child);

    const before = await db.one(`SELECT path FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, child]);

    await editor.updatePageSettings({ slug: 'renamed-group' });

    const after = await db.one(`SELECT path FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, child]);
    expect(after.path, 'descendant paths must follow a renamed ancestor').not.toBe(before.path);
    expect(after.path).toBe(`/renamed-group/${slugOf(child)}`);
  });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}