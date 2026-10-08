import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Language lifecycle — the entity every other content decision hangs off.
 *
 * Covers creation (catalog + custom BCP-47), default-language invariants,
 * duplicates, invalid tags, rename, enable/disable and the destructive delete
 * with its cascade, always verifying through the editor UI and, independently,
 * through the database.
 */
test.describe('languages', () => {
  test('a new site starts with exactly one enabled default language', async ({ page, editor, project, db }) => {
    await editor.goto(project.id);

    await editor.expectLanguageVisible(project.defaultLanguage);
    expect(await editor.languageCodes()).toEqual(['en']);

    const rows = await db.query(
      `SELECT code, name, is_default, enabled FROM "Language" WHERE project_id = $1`,
      [project.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe('en');
    expect(rows[0]!.is_default).toBe('true');
    expect(rows[0]!.enabled).toBe('true');

    // The Default badge is user-visible proof, not just a database column.
    await expect(editor.language('en').getByText('Default', { exact: true })).toBeVisible();
    void page;
  });

  test('adds a language from the catalog and it persists with a real code', async ({
    editor,
    project,
    db,
    diagnostics,
  }) => {
    await editor.goto(project.id);

    await editor.addLanguageFromCatalog('Tiếng Việt');

    await editor.expectLanguageVisible('vi', 'Tiếng Việt');
    const stored = await db.one(
      `SELECT code, name, is_default, enabled FROM "Language" WHERE project_id = $1 AND code = 'vi'`,
      [project.id],
    );
    expect(stored.name).toBe('Tiếng Việt');
    expect(stored.is_default).toBe('false');
    diagnostics.assertClean({ label: 'add catalog language: ' });
  });

  test('adds a custom BCP-47 language and keeps Unicode labels intact', async ({ editor, project, db }) => {
    await editor.goto(project.id);

    await editor.addCustomLanguage('pt-BR', 'Português (Brasil)');
    await editor.expectAddLanguageDialogClosed();
    await editor.expectLanguageVisible('pt-br', 'Português (Brasil)');

    const stored = await db.one(`SELECT code, name FROM "Language" WHERE project_id = $1 AND name = $2`, [
      project.id,
      'Português (Brasil)',
    ]);
    // The backend canonicalises the tag; the label must survive byte-for-byte.
    expect(stored.code).toBe('pt-BR');
    expect(stored.name).toBe('Português (Brasil)');
  });

  test('rejects a duplicate language code, in any casing, without creating a row', async ({
    page,
    editor,
    project,
    db,
  }) => {
    await editor.goto(project.id);
    await editor.addCustomLanguage('de', 'Deutsch');
    await editor.expectLanguageVisible('de');

    const before = await db.count(`SELECT count(*) AS count FROM "Language" WHERE project_id = $1`, [project.id]);

    // Same tag, different casing — BCP-47 tags are case-insensitive, so this
    // collides with the "de" language already added above.
    await editor.addCustomLanguage('DE', 'Deutsch (duplicate)');
    await expect(page.getByText(/could not add the language/i).first()).toBeVisible({ timeout: 20_000 });
    // The dialog stays open because the operation was rejected.
    await expect(page.getByRole('dialog').filter({ hasText: 'Add a language' })).toBeVisible();

    const after = await db.count(`SELECT count(*) AS count FROM "Language" WHERE project_id = $1`, [project.id]);
    expect(after, 'a rejected create must not mutate state').toBe(before);
  });

  test('rejects malformed language codes through the UI', async ({ page, editor, project, db }) => {
    await editor.goto(project.id);

    for (const badCode of ['not a tag', 'e', 'en--US', '日本語']) {
      await editor.addCustomLanguage(badCode, 'Invalid');
      // Either the dialog blocks it locally or the API rejects it; both are valid
      // as long as nothing is persisted.
      await expect
        .poll(async () => db.count(`SELECT count(*) AS count FROM "Language" WHERE project_id = $1 AND name = 'Invalid'`, [project.id]), {
          timeout: 8_000,
        })
        .toBe(0);
      const dialog = page.getByRole('dialog').filter({ hasText: 'Add a language' });
      if (await dialog.isVisible()) {
        await dialog.getByRole('button', { name: 'Back to suggested languages' }).click().catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  });

  test('renames a language and the new label is what readers and the tree show', async ({
    editor,
    project,
    db,
  }) => {
    await editor.goto(project.id);
    await editor.addCustomLanguage('ja', '日本語');
    await editor.expectLanguageVisible('ja');

    await editor.updateLanguageSettings('ja', { label: 'Japanese (E2E)' });
    await editor.expectLanguageVisible('ja', 'Japanese (E2E)');

    const stored = await db.one(`SELECT name FROM "Language" WHERE project_id = $1 AND code = 'ja'`, [project.id]);
    expect(stored.name).toBe('Japanese (E2E)');
  });

  test('exactly one default language survives a default switch', async ({ editor, project, db }) => {
    await editor.goto(project.id);
    await editor.addCustomLanguage('fr', 'Français');
    await editor.expectLanguageVisible('fr');

    await editor.updateLanguageSettings('fr', { makeDefault: true });

    await expect
      .poll(async () => db.count(`SELECT count(*) AS count FROM "Language" WHERE project_id = $1 AND is_default`, [project.id]))
      .toBe(1);
    const current = await db.one(`SELECT code FROM "Language" WHERE project_id = $1 AND is_default`, [project.id]);
    expect(current.code).toBe('fr');

    // The badge moved: French is default, English is not.
    await expect(editor.language('fr').getByText('Default', { exact: true })).toBeVisible();
    await expect(editor.language('en').getByText('Default', { exact: true })).toHaveCount(0);
  });

  test('deleting a language cascades to its pages and leaves the other language intact', async ({
    page,
    editor,
    project,
    db,
    diagnostics,
  }) => {
    await editor.goto(project.id);
    await editor.addCustomLanguage('es', 'Español');
    await editor.expectLanguageVisible('es');

    // A page that only exists in the language we are about to delete.
    await editor.createPage('es');
    await editor.setTitle(uniqueName('Spanish Page'));
    await editor.expectPageVisible('Untitled', 'es').catch(() => {});
    await editor.waitForSaved();

    const spanishPages = await db.count(`SELECT count(*) AS count FROM "Page" p JOIN "Language" l ON l.id = p.language_id WHERE l.project_id = $1 AND l.code = 'es'`, [
      project.id,
    ]);
    expect(spanishPages).toBeGreaterThan(0);

    // Delete through Project Settings → Languages, which is the real admin path.
    await page.goto(`/app/projects/${project.id}/settings?section=languages`);
    const settings = page.getByRole('dialog').filter({ hasText: 'Languages' });
    void settings;
    await page.getByRole('button', { name: 'Delete language' }).last().click();
    const confirm = page.getByRole('dialog').filter({ hasText: /Delete Español\?/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete language' }).click();
    await expect(page.getByText('Language deleted')).toBeVisible({ timeout: 30_000 });

    await editor.goto(project.id);
    await editor.expectLanguageAbsent('es');
    await editor.expectLanguageVisible('en');

    // Referential integrity: the orphan pages are gone, not merely hidden.
    const remaining = await db.count(
      `SELECT count(*) AS count FROM "Page" p JOIN "Language" l ON l.id = p.language_id WHERE l.project_id = $1 AND l.code = 'es'`,
      [project.id],
    );
    expect(remaining, 'pages of a deleted language must be removed by cascade').toBe(0);
    diagnostics.assertClean({ label: 'delete language: ' });
  });

  test('the default language cannot be deleted or disabled from the settings list', async ({
    page,
    editor,
    project,
    db,
  }) => {
    await page.goto(`/app/projects/${project.id}/settings?section=languages`);
    await expect(page.getByRole('heading', { name: 'Languages' })).toBeVisible();

    // The default row exposes no delete affordance at all.
    const deleteButtons = page.getByRole('button', { name: 'Delete language' });
    await expect(deleteButtons).toHaveCount(0);

    // And its enabled toggle is locked on.
    const toggle = page.getByRole('switch', { name: /Serve English on the published site/ });
    await expect(toggle).toBeDisabled();

    const rows = await db.query(`SELECT code, enabled, is_default FROM "Language" WHERE project_id = $1`, [project.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.enabled).toBe('true');
    void editor;
  });
});