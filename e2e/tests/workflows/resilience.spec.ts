import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Resilience: duplicate submissions, browser history, refresh mid-flight,
 * recovery after a rejected operation, and boundary data.
 */
test.describe('resilience', () => {
  test('a rejected create leaves no partial state and the corrected retry succeeds', async ({
    page,
    editor,
    project,
    db,
    diagnostics,
  }) => {
    await editor.goto(project.id);

    // Attempt an over-long slug through page settings: the product must refuse it.
    await editor.createPage('en');
    await editor.setTitle(uniqueName('Recovery'));

    const dialog = await editor.openPageSettings();
    await dialog.getByLabel('Slug', { exact: true }).fill('a'.repeat(400));
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    diagnostics.expectFailure(/40[0-9]/);
    // Either the dialog stays open with an error or the slug is truncated; what
    // must never happen is a 500 or a silently unwritten value.
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible({ timeout: 20_000 });
    await editor.page.keyboard.press('Escape');

    const before = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);

    // Retry with a valid value through the same dialog.
    await editor.updatePageSettings({ slug: 'recovered-slug' });

    const stored = await db.one(`SELECT slug FROM "Page" WHERE project_id = $1 AND slug = 'recovered-slug'`, [project.id]);
    expect(stored.slug).toBe('recovered-slug');
    const after = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1`, [project.id]);
    expect(after, 'a failed create must not create duplicates').toBe(before);
    void page;
    diagnostics.assertClean({ label: 'recovery: ' });
  });

  test('double-submitting the publish action produces one release, not two', async ({
    page,
    editor,
    publish,
    project,
    db,
  }) => {
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(uniqueName('Double Publish'));

    const dialog = await publish.openDialog();
    await expect(dialog.getByText('Checking for changes…')).toBeHidden({ timeout: 30_000 }).catch(() => {});
    const publishNow = dialog.getByRole('button', { name: 'Publish now' });
    await expect(publishNow).toBeEnabled();
    // Mashed button, as an impatient user does before the modal closes.
    await Promise.allSettled([publishNow.click(), publishNow.click()]);

    await expect(page.getByText('Deployed successfully', { exact: true })).toBeVisible({ timeout: 120_000 });
    await publish.closePipeline();

    await expect
      .poll(async () => db.count(`SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1 AND status = 'ACTIVE'`, [project.id]), {
        timeout: 30_000,
      })
      .toBe(1);
  });

  test('browser back and forward never resurrect a deleted document', async ({ page, editor, project, db }) => {
    const title = uniqueName('Undo History');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.waitForSaved();

    await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(title, 'en'))!.id}`);
    await editor.deleteOpenPage();
    await editor.expectPageAbsent(title, 'en');

    await page.goBack();
    await page.goForward();

    // The tree must still reflect the deletion, not a cached pre-delete render.
    await expect(editor.rowByTitle(title, 'en')).toHaveCount(0);
    const rows = await db.count(`SELECT count(*) AS count FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    expect(rows).toBe(0);
  });

  test('a refresh immediately after typing keeps the draft that was on screen', async ({
    page,
    editor,
    project,
    db,
  }) => {
    const title = uniqueName('Unsaved Then Reloaded');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.waitForSaved();

    const uniqueLine = `typed-then-reloaded-${Date.now()}`;
    await editor.setMode('markdown');
    await editor.markdownBody.fill(`# ${title}\n\n${uniqueLine}\n`);
    // Deliberately reload before the debounce elapses — the product promises an
    // unmount flush, so the keystroke must not be lost.
    await page.reload();

    await editor.openPage(title, 'en');
    await editor.setMode('markdown');
    await expect
      .poll(async () => {
        const row = await db.one(`SELECT content FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
        return row.content;
      }, { timeout: 20_000 })
      .toContain(uniqueLine);
  });

  test('boundary content survives the round trip unchanged', async ({ page, editor, project, db }) => {
    const title = uniqueName('Boundary');
    const body = [
      `# ${title}`,
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```ts',
      "const x: number = 1;",
      '```',
      '',
      'Unicode: 日本語 · Tiếng Việt · עברית · 🎉',
      '',
      "Apostrophe's & <angle> \"quotes\" 100% #hash",
    ].join('\n');

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.setBody(`${body}\n`);
    await editor.waitForSaved();

    const stored = await db.one(`SELECT content FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
    expect(stored.content).toContain('日本語');
    expect(stored.content).toContain('🎉');
    expect(stored.content).toContain("Apostrophe's");

    await page.reload();
    await editor.openPage(title, 'en');
    await editor.setMode('markdown');
    await expect(editor.markdownBody).toHaveValue(/日本語/);

    // A very long single line is accepted without truncation of the payload.
    const longLine = 'x'.repeat(5_000);
    await editor.markdownBody.fill(`${body}\n\n${longLine}\n`);
    await editor.waitForSaved();
    await expect
      .poll(async () => {
        const row = await db.one(`SELECT content FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
        return row.content.length;
      }, { timeout: 20_000 })
      .toBeGreaterThan(5_000);
  });

  test('script-like content is stored but never executed on the published site', async ({
    page,
    editor,
    publish,
    site,
    project,
    diagnostics,
  }) => {
    const title = uniqueName('Injection Probe');
    const markerId = `cmsE2eXss${Date.now()}`;
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.setBody(
      [
        `# ${title}`,
        '',
        'Legitimate content stays readable.',
        '',
        `<script>window.${markerId} = 'executed'</script>`,
        '',
        '<img src=x onerror="window.' + markerId + " = 'executed'\">",
      ].join('\n'),
    );

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await site.open(project.id, slugOf(title));
    await site.expectContains('Legitimate content stays readable.');
    await site.expectNoScriptExecution(markerId);

    const html = await site.rawHtml();
    expect(html.includes('<script>window.' + markerId), 'raw script tags must be sanitised').toBe(false);
    void page;
    diagnostics.assertClean({ label: 'xss: ' });
  });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
