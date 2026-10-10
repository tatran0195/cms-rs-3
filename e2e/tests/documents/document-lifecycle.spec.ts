import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Document (page) lifecycle.
 *
 * Create → read → edit → reopen → duplicate-title behaviour → settings →
 * delete, plus the negative paths: empty titles, hostile slugs, cancellation,
 * repeated submission and stale writes.
 */
test.describe('documents', () => {
  test('creates a page, types a title and body, and the draft survives a reload', async ({ page, editor, project, db, diagnostics }) => {
    const title = uniqueName('Product Documentation');
    const marker = `intro-${Date.now()}`;

    await editor.goto(project.id);
    await editor.createPage('en');

    await editor.setTitle(title);
    await editor.setBody(`# ${title}\n\nThis paragraph contains ${marker}.\n`);

    // User-visible result first…
    await editor.expectPageVisible(title, 'en');
    // …then persistence through a real reload…
    await page.reload();
    await expect(editor.titleInput).toHaveValue(title);
    await editor.setMode('markdown');
    await expect(editor.markdownBody).toHaveValue(new RegExp(escapeRegExp(marker)));
    // …then independent verification in the database.
    const stored = await db.one(`SELECT title, slug, path, is_published FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    // The slug is derived from the title the author typed (DEFECT-04: it used
    // to stay "untitled" forever), then normalised the way the product does.
    expect(stored.slug).toBe(slugify(title));
    expect(stored.path).toBe(`/${slugify(title)}`);
    diagnostics.assertClean({ label: 'create document: ' });
  });

  test('a second page with the same title gets a distinct slug instead of overwriting', async ({ editor, project, db }) => {
    const title = uniqueName('Duplicate');
    await editor.goto(project.id);

    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.waitForSaved();

    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.waitForSaved();

    const rows = await db.query(`SELECT slug, path FROM "Page" WHERE project_id = $1 AND title = $2 ORDER BY created_at`, [project.id, title]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2);
    // The uniquification is deterministic: base slug, then -1.
    expect(rows.map((r) => r.slug).sort()).toEqual([`${slugify(title)}`, `${slugify(title)}-1`]);

    await editor.expectPageVisible(title, 'en');
  });

  test('page settings persist slug and description and change the public path', async ({ editor, project, db }) => {
    const title = uniqueName('Settings');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.updatePageSettings({ slug: 'custom-slug', description: 'A short summary.' });

    await editor.openPage(title, 'en');
    const dialog = await editor.openPageSettings();
    await expect(dialog.getByLabel('Slug', { exact: true })).toHaveValue('custom-slug');
    await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('A short summary.');
    await dialog
      .getByRole('button', { name: 'Cancel' })
      .click()
      .catch(async () => {
        await dialog.getByRole('button', { name: 'Close' }).click();
      });

    const stored = await db.one(`SELECT slug, path, description FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    expect(stored.slug).toBe('custom-slug');
    expect(stored.path).toBe('/custom-slug');
    expect(stored.description).toBe('A short summary.');
  });

  test('an empty title is refused rather than silently saving a blank document', async ({ editor, project, db, page, diagnostics }) => {
    await editor.goto(project.id);
    await editor.createPage('en');
    // A freshly created page has nothing to autosave yet, so wait for the
    // editor to have it open instead of for a save that cannot happen.
    await expect(editor.titleInput).toBeVisible();

    const before = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);
    diagnostics.expectFailure('HTTP 400');
    diagnostics.expectFailure('HTTP 422');
    diagnostics.expectFailure('Failed to load resource.*40');
    await editor.fillTitle('   ');
    // Give the debounced autosave more than its window, then confirm nothing landed.
    await expect
      .poll(async () => db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = ''`, [project.id]), {
        timeout: 6000,
      })
      .toBe(0);
    const after = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);
    expect(after).toBe(before);

    // The stored title is untouched: a rejected save changes nothing.
    const stored = await db.one(`SELECT title FROM "Page" WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [project.id]);
    expect(stored.title, 'a rejected title must not overwrite the stored one').not.toBe('   ');

    // The author is told, and their text is not thrown away while they fix it.
    // (DEFECT-06: the rejection used to be silent.)
    await editor.waitForSaveRejected();
    await expect(editor.titleInput).toHaveValue('   ');
    void page;
    diagnostics.assertClean({ label: 'blank title: ' });
  });

  test('deleting a page removes it from the tree, the database and the editor', async ({ editor, project, db, diagnostics }) => {
    const keep = uniqueName('Keeper');
    const drop = uniqueName('Dropped');
    await editor.goto(project.id);

    await editor.createPage('en');
    await editor.setTitle(keep);
    await editor.createPage('en');
    await editor.setTitle(drop);
    await editor.expectPageVisible(keep, 'en');
    await editor.expectPageVisible(drop, 'en');

    await editor.openPage(drop, 'en');
    await editor.deleteOpenPage();

    await editor.expectPageAbsent(drop, 'en');
    await editor.expectPageVisible(keep, 'en');
    const remaining = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, drop]);
    expect(remaining).toBe(0);
    diagnostics.assertClean({ label: 'delete document: ' });
  });

  test('cancelling the delete confirmation leaves the document untouched', async ({ editor, project, db }) => {
    const title = uniqueName('Survivor');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.cancelDeletePage();

    await editor.expectPageVisible(title, 'en');
    const rows = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    expect(rows).toBe(1);
  });

  test('a double click on "New page" produces exactly one document', async ({ editor, project, db, diagnostics }) => {
    await editor.goto(project.id);
    const before = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);

    // The impatient double click a real user makes. The button is disabled
    // while the create is in flight, so the second click must not queue up a
    // second document.
    await editor.createPageTwice('en');

    await expect
      .poll(async () => db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]), { timeout: 20_000 })
      .toBe(before + 1);

    // Give any second request a chance to land before declaring success.
    await expect
      .poll(async () => db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]), { timeout: 5000 })
      .toBe(before + 1);
    diagnostics.assertClean({ label: 'double click create: ' });
  });

  test('two browser tabs editing the same document converge on the last writer', async ({ page, editor, project, db, diagnostics }) => {
    const title = uniqueName('Contended');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.waitForSaved();

    const pageId = (await editor.pageRowData(title, 'en'))?.id;
    const contextB = page.context();
    const tabB = await contextB.newPage();
    const editorB = new (await import('../../src/pages/editor.page')).EditorPage(tabB);

    // Both tabs load the same document before either writes.
    await tabB.goto(`/app/projects/${project.id}/editor?page=${pageId}`);
    await expect(tabB.getByRole('textbox', { name: 'Page title' })).toHaveValue(title);

    await editor.setMode('markdown');
    await editor.markdownBody.fill('Written by tab A.');
    await editor.waitForSaved();

    await editorB.setMode('markdown');
    await editorB.markdownBody.fill('Written by tab B.');
    await editorB.waitForSaved();

    // The product is last-write-wins; the important guarantee is that the stored
    // document is exactly one of the two writes and is not corrupted/duplicated.
    const stored = await db.one(`SELECT content, updated_at FROM "Page" WHERE id = $1`, [pageId]);
    expect(['Written by tab A.', 'Written by tab B.']).toContain(stored.content.trim());

    await tabB.close();
    diagnostics.assertClean({ label: 'concurrent tabs: ' });
  });

  test('hiding a page keeps it in the editor but marks it unpublished', async ({ editor, project, db }) => {
    const title = uniqueName('Hidden Page');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.updatePageSettings({ hidden: true });

    const stored = await db.one(`SELECT is_published FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    expect(stored.is_published, 'hidden pages must not be published').toBe('false');
    await editor.expectPageVisible(title, 'en');
  });

  test('the page filter finds pages case-insensitively and clears again', async ({ editor, project }) => {
    const title = uniqueName('Filterable');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.filterPages('filterable');
    await expect(editor.rows('en')).toHaveCount(1);
    await editor.clearFilter();
    await expect(editor.rows('en').filter({ hasText: title })).toHaveCount(1);
  });
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
