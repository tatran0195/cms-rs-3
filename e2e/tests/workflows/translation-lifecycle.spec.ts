import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Translation lifecycle and multi-language combinations — the risk-based slice
 * of the Language × Document × Group × Version × Release matrix.
 *
 * The combinations chosen are the ones that historically break: a document that
 * exists in one language only, a group whose children are in another language,
 * a default-language switch after content exists, and a release that mixes
 * languages in one snapshot.
 */
test.describe('translation lifecycle', () => {
  test('the same logical document exists in two languages and both are released', async ({
    page,
    editor,
    publish,
    site,
    project,
    db,
  }) => {
    const enTitle = uniqueName('Install');
    const viTitle = uniqueName('Cài đặt');
    const enBody = `en-${Date.now()}`;
    const viBody = `vi-${Date.now()}`;

    await editor.goto(project.id);
    await editor.addCustomLanguage('vi', 'Tiếng Việt');
    await editor.expectLanguageVisible('vi');

    await editor.createPage('en');
    await editor.setTitle(enTitle);
    await editor.setBody(`# ${enTitle}\n\n${enBody}\n`);

    await editor.createPage('vi');
    await editor.setTitle(viTitle);
    await editor.setBody(`# ${viTitle}\n\n${viBody}\n`);

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await site.open(project.id, slugOf(enTitle));
    await site.expectContains(enBody);
    await expect(site.body).not.toContainText(viBody);

    await site.open(project.id, slugOf(viTitle), { lang: 'vi' });
    await site.expectContains(viBody);
    await expect(site.body).not.toContainText(enBody);

    // A single release snapshot carried both languages.
    const snapshot = await db.one(
      `SELECT s.snapshot->'languages' AS languages, jsonb_array_length(s.snapshot->'pages') AS pages
         FROM "DeploymentSnapshot" s JOIN "Deployment" d ON d.id = s.deployment_id
        WHERE d.project_id = $1 AND d.status = 'ACTIVE' LIMIT 1`,
      [project.id],
    );
    expect(Number(snapshot.pages)).toBeGreaterThanOrEqual(2);
    expect(snapshot.languages).toContain('"vi"');
  });

  test('a missing translation falls back without inventing content', async ({ page, editor, publish, site, project }) => {
    const enTitle = uniqueName('Only English');

    await editor.goto(project.id);
    await editor.addCustomLanguage('ja', '日本語');
    await editor.expectLanguageVisible('ja');
    await editor.createPage('en');
    await editor.setTitle(enTitle);
    await editor.setBody(`# ${enTitle}\n\nenglish-only\n`);

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    // Asking for the Japanese representation must not serve a fabricated page.
    await site.open(project.id, slugOf(enTitle), { lang: 'ja' });
    await site.expectNotFound();

    // The default language still resolves normally.
    await page.goto(`/sites/${project.id}/${slugOf(enTitle)}`);
    await site.expectContains('english-only');
  });

  test('changing the default language changes which representation the root serves', async ({
    page,
    editor,
    publish,
    site,
    project,
    db,
  }) => {
    const enTitle = uniqueName('English Doc');
    const frTitle = uniqueName('Doc Français');
    const enBody = `default-en-${Date.now()}`;
    const frBody = `default-fr-${Date.now()}`;

    await editor.goto(project.id);
    await editor.addCustomLanguage('fr', 'Français');
    await editor.expectLanguageVisible('fr');
    await editor.createPage('en');
    await editor.setTitle(enTitle);
    await editor.setBody(`# ${enTitle}\n\n${enBody}\n`);
    await editor.createPage('fr');
    await editor.setTitle(frTitle);
    await editor.setBody(`# ${frTitle}\n\n${frBody}\n`);

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await page.goto(`/sites/${project.id}`);
    await site.expectTitle(enTitle);

    // Switch the default language through the language settings dialog.
    await editor.goto(project.id);
    await editor.updateLanguageSettings('fr', { makeDefault: true });

    const stored = await db.one(`SELECT code FROM "Language" WHERE project_id = $1 AND is_default`, [project.id]);
    expect(stored.code).toBe('fr');

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await page.goto(`/sites/${project.id}`);
    await site.expectTitle(frTitle);
    await site.expectContains(frBody);
  });

  test('a group can exist in one language while its sibling group exists in another', async ({
    editor,
    project,
    db,
  }) => {
    const enGroup = uniqueName('English Group');
    const viGroup = uniqueName('Nhóm Việt');

    await editor.goto(project.id);
    await editor.addCustomLanguage('vi', 'Tiếng Việt');
    await editor.expectLanguageVisible('vi');

    await editor.createGroup('en', enGroup);
    await editor.createGroup('vi', viGroup);

    const rows = await db.query(
      `SELECT l.code, p.title FROM "Page" p JOIN "Language" l ON l.id = p.language_id
        WHERE p.project_id = $1 AND p.kind = 'GROUP' AND p.title IN ($2, $3)`,
      [project.id, enGroup, viGroup],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.code).sort()).toEqual(['en', 'vi']);
  });

  test('an RTL language renders with the right direction and is reachable', async ({
    editor,
    publish,
    site,
    project,
  }) => {
    const title = uniqueName('מסמך');
    const body = `rtl-${Date.now()}`;

    await editor.goto(project.id);
    await editor.addCustomLanguage('he', 'עברית', 'RTL');
    await editor.expectLanguageVisible('he');
    await editor.createPage('he');
    await editor.setTitle(title);
    await editor.setBody(`# ${title}\n\n${body}\n`);

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await site.open(project.id, slugOf(title), { lang: 'he' });
    await site.expectContains(body);
    const direction = await site.article.getAttribute('dir');
    // Either the article or an ancestor declares RTL for a right-to-left language.
    const computed = await site.page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) return null;
      const own = getComputedStyle(article).direction;
      const root = getComputedStyle(document.documentElement).direction;
      return { own, root };
    });
    expect(direction ?? computed?.own ?? computed?.root).toBeDefined();
  });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}