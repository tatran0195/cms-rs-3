import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Cross-entity referential integrity.
 *
 * The interesting failures live at relationship boundaries, not at CRUD edges:
 * what happens to a published document when its language disappears, when its
 * group is deleted, when the whole language is disabled mid-life.
 */
test.describe('referential integrity', () => {
  test('deleting a language that has a published release removes it from the public site',
    async ({ page, editor, publish, site, project, db, diagnostics }) => {
      const title = uniqueName('Doomed Language Page');
      const body = `doomed-${Date.now()}`;

      await editor.goto(project.id);
      await editor.addCustomLanguage('ko', '한국어');
      await editor.expectLanguageVisible('ko');

      await editor.createPage('ko');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${body}\n`);

      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      // Readers can see the Korean page.
      await site.open(project.id, slugOf(title), { lang: 'ko' });
      await site.expectContains(body);

      // Now delete the language through Project Settings.
      await page.goto(`/app/projects/${project.id}/settings?section=languages`);
      await page.getByRole('button', { name: 'Delete language' }).last().click();
      const confirm = page.getByRole('dialog').filter({ hasText: /Delete 한국어\?/ });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Delete language' }).click();
      await expect(page.getByText('Language deleted')).toBeVisible({ timeout: 30_000 });

      // The published site must stop serving it — an immutable release must not
      // keep serving content whose language no longer exists.
      await site.open(project.id, slugOf(title), { lang: 'ko' });
      await expect(site.body).not.toContainText(body, { timeout: 20_000 });

      // A fresh release reconciles the live tree with the new language set.
      await editor.goto(project.id);
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();
      await site.open(project.id, slugOf(title), { lang: 'ko' });
      await expect(site.body).not.toContainText(body, { timeout: 20_000 });

      const orphanPages = await db.count(
        `SELECT count(*) AS count FROM "Page" p WHERE p.project_id = $1 AND p.language_id NOT IN (SELECT id FROM "Language" WHERE project_id = $1)`,
        [project.id],
      );
      expect(orphanPages).toBe(0);
      diagnostics.assertClean({ label: 'delete language with release: ' });
    });

  test('disabling a language keeps the draft editable but removes it from the release',
    async ({ page, editor, publish, site, project, db }) => {
      const title = uniqueName('Hidden Language Page');
      const body = `hidden-lang-${Date.now()}`;

      await editor.goto(project.id);
      await editor.addCustomLanguage('nl', 'Nederlands');
      await editor.expectLanguageVisible('nl');
      await editor.createPage('nl');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${body}\n`);

      await page.goto(`/app/projects/${project.id}/settings?section=languages`);
      const toggle = page.getByRole('switch', { name: /Serve Nederlands on the published site/ });
      await expect(toggle).toBeEnabled();
      await toggle.click();
      await expect(page.getByText('Hidden', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

      const stored = await db.one(`SELECT enabled FROM "Language" WHERE project_id = $1 AND code = 'nl'`, [project.id]);
      expect(stored.enabled).toBe('false');

      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      await site.open(project.id, slugOf(title), { lang: 'nl' });
      await expect(site.body).not.toContainText(body, { timeout: 20_000 });

      // The draft is still there for the author.
      await editor.goto(project.id);
      await editor.expectLanguageVisible('nl');
      await editor.expectPageVisible(title, 'nl');
    });

  test('deleting a published document removes it from the public site on the next release',
    async ({ page, editor, publish, site, project, db }) => {
      const keep = uniqueName('Kept Page');
      const drop = uniqueName('Removed Page');
      const dropBody = `removed-${Date.now()}`;

      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(keep);
      await editor.createPage('en');
      await editor.setTitle(drop);
      await editor.setBody(`# ${drop}\n\n${dropBody}\n`);

      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();
      await site.open(project.id, slugOf(drop));
      await site.expectContains(dropBody);

      await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(drop, 'en'))!.id}`);
      await editor.deleteOpenPage();

      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      await site.open(project.id, slugOf(keep));
      await site.expectTitle(keep);
      await site.open(project.id, slugOf(drop));
      await site.expectNotFound();

      const stillPublished = await db.count(
        `SELECT count(*) AS count FROM "DeploymentSnapshotPageIndex" i
           JOIN "Deployment" d ON d.id = i.deployment_id
          WHERE d.project_id = $1 AND d.status = 'ACTIVE' AND i.slug = $2`,
        [project.id, slugOf(drop)],
      );
      expect(stillPublished).toBe(0);
    });

  test('deleting a site removes every dependent record in one action', async ({ page, dashboard, editor, project, db }) => {
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(uniqueName('Doomed Site Page'));

    await page.goto(`/app/projects/${project.id}/settings?section=danger`);
    const danger = page.getByRole('dialog').filter({ hasText: /Delete/ }).or(page.getByText(/Delete/, { exact: false }));
    void danger;
    const deleteButton = page.getByRole('button', { name: /^Delete/ }).last();
    await deleteButton.click();
    const confirm = page.getByRole('dialog').filter({ hasText: /can.?t be undone|cannot be undone/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /^Delete/ }).click();

    await page.goto('/app');
    await expect(page.getByText('No projects yet')).toBeVisible({ timeout: 45_000 });

    const rows = await db.query(`SELECT id FROM "Project" WHERE id = $1`, [project.id]);
    expect(rows).toHaveLength(0);
    const pages = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);
    expect(pages).toBe(0);
    await dashboard.goto();
  });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}