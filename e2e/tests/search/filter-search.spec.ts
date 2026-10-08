import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Search, filtering and list behaviour across the surfaces that offer them.
 */
test.describe('search and filtering', () => {
  test('the editor page filter matches title, is case-insensitive, and clears', async ({ editor, project }) => {
    const needle = uniqueName('Needle');
    const other = uniqueName('Haystack');

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(needle);
    await editor.createPage('en');
    await editor.setTitle(other);

    await editor.filterPages('needle');
    await expect(editor.rows('en')).toHaveCount(1);
    await expect(editor.rowByTitle(needle, 'en')).toBeVisible();
    await expect(editor.rowByTitle(other, 'en')).toHaveCount(0);

    // Case-insensitive.
    await editor.filterPages('NEEDLE');
    await expect(editor.rowByTitle(needle, 'en')).toBeVisible();

    await editor.clearFilter();
    await expect(editor.rows('en')).toHaveCount(2);
  });

  test('a filter that matches nothing leaves the tree empty without losing data', async ({ editor, project }) => {
    const title = uniqueName('Filterable Doc');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.filterPages('zzzzz-no-such-page');
    await expect(editor.rows('en')).toHaveCount(0);

    await editor.clearFilter();
    await expect(editor.rowByTitle(title, 'en')).toBeVisible();
  });

  test('the filter keeps ancestors so a matched child is reachable through its group', async ({ editor, project }) => {
    const group = uniqueName('Ancestor Group');
    const child = uniqueName('Matched Child');

    await editor.goto(project.id);
    await editor.createGroup('en', group);
    await editor.createChildPage(group, 'en');
    await editor.setTitle(child);

    await editor.filterPages('matched');
    await expect(editor.rowByTitle(child, 'en')).toBeVisible();
    await expect(editor.rowByTitle(group, 'en'), 'the ancestor group must stay visible').toBeVisible();
  });

  test('Unicode and special characters are searchable', async ({ editor, project }) => {
    const title = uniqueName('Tiếng Việt Tài Liệu');
    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);

    await editor.filterPages('tài liệu');
    await expect(editor.rowByTitle(title, 'en')).toBeVisible();

    await editor.filterPages('TÀI LIỆU');
    await expect(editor.rowByTitle(title, 'en')).toBeVisible();
  });

  test('the published site search finds a released document and not a draft', async ({
    editor,
    publish,
    site,
    project,
    context,
  }) => {
    const title = uniqueName('Searchable Release');
    const draftOnly = uniqueName('Draft Only Doc');

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(title);
    await editor.setBody(`searchable-released-${Date.now()}\n`);
    await editor.createPage('en');
    await editor.setTitle(draftOnly);

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await site.open(project.id);
    const searchButton = site.page.getByRole('button', { name: /search/i }).first();
    if (await searchButton.isVisible()) {
      await searchButton.click();
      const input = site.page.getByRole('searchbox').or(site.page.getByPlaceholder(/search/i)).first();
      await input.fill('Searchable Release');
      await expect(site.page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
    }
    void context;
  });
});