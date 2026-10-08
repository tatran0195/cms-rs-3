import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Workflow A — Language → Document → Group → Version → Release → Public site.
 *
 * This is the deliberate long test the suite exists for: it carries one piece
 * of content through every lifecycle stage and every persistence boundary
 * (reload, sign-out, sign-in) in a single continuous story, exactly as a real
 * documentation team would.
 */
test('workflow A: language → document → group → version → release → public content → re-login',
  async ({ page, context, signIn, editor, publish, site, author, project, db, diagnostics }) => {
    test.setTimeout(300_000);

    // ── 1. Create the second language through the UI ─────────────────────────
    const languageLabel = uniqueName('Vietnamese');
    await editor.goto(project.id);
    await editor.addCustomLanguage('vi', languageLabel);
    await editor.expectLanguageVisible('vi', languageLabel);
    await editor.expectLanguageVisible('en');

    // ── 2. Create the group and the English document inside it ───────────────
    const groupTitle = uniqueName('Guides');
    await editor.createGroup('en', groupTitle);

    const englishTitle = uniqueName('Getting Started');
    const englishBody = `english-release-${Date.now()}`;
    await editor.createChildPage(groupTitle, 'en');
    await editor.setTitle(englishTitle);
    await editor.setBody(`# ${englishTitle}\n\n${englishBody}\n`);

    // ── 3. Reopen the document: the language + group membership persisted ────
    await page.reload();
    await editor.openPage(englishTitle, 'en');
    await editor.setMode('markdown');
    await expect(editor.markdownBody).toHaveValue(new RegExp(escapeRegExp(englishBody)));

    const membership = await db.one(
      `SELECT g.title AS group_title, g.kind AS group_kind, l.code AS language_code, p.path
         FROM "Page" p
         JOIN "Page" g ON g.id = p.parent_id
         JOIN "Language" l ON l.id = p.language_id
        WHERE p.project_id = $1 AND p.title = $2`,
      [project.id, englishTitle],
    );
    expect(membership.group_title).toBe(groupTitle);
    expect(membership.group_kind).toBe('GROUP');
    expect(membership.language_code).toBe('en');

    // ── 4. The Vietnamese translation of the same logical document ───────────
    const vietnameseTitle = uniqueName('Bắt đầu');
    const vietnameseBody = `vietnamese-release-${Date.now()}`;
    await editor.createGroup('vi', uniqueName('Guide Viet'));
    await editor.setTitle(`${groupTitle} (VI)`);
    await editor.createChildPage(`${groupTitle} (VI)`, 'vi');
    await editor.setTitle(vietnameseTitle);
    await editor.setBody(`# ${vietnameseTitle}\n\n${vietnameseBody}\n`);

    await editor.openPage(vietnameseTitle, 'vi');
    await editor.setMode('markdown');
    await expect(editor.markdownBody).toHaveValue(new RegExp(escapeRegExp(vietnameseBody)));

    // ── 5. Create a version and edit inside it ───────────────────────────────
    await editor.createVersion('v2-guides');
    await editor.expectPageVisible(englishTitle, 'en');
    await editor.openPage(englishTitle, 'en');
    const draftBody = `draft-not-released-${Date.now()}`;
    await editor.setBody(`# ${englishTitle}\n\n${draftBody}\n`);

    // ── 6. Release the default version ───────────────────────────────────────
    await publish.publishAndWait({ message: 'Workflow A first release' });
    await expect(page.getByText('Deployed successfully', { exact: true })).toBeVisible();
    await publish.closePipeline();

    // ── 7. Verify the public site in both languages ──────────────────────────
    const englishSlug = slugOf(englishTitle);
    const vietnameseSlug = slugOf(vietnameseTitle);

    await site.open(project.id, englishSlug);
    await site.expectTitle(englishTitle);
    await site.expectContains(englishBody);
    await site.expectNotContains(draftBody);

    await site.open(project.id, vietnameseSlug, { lang: 'vi' });
    await site.expectTitle(vietnameseTitle);
    await site.expectContains(vietnameseBody);

    // ── 8. Refresh the public page: the release is durable ───────────────────
    await page.reload();
    await site.expectContains(englishBody);

    // ── 9. Sign out, sign in again, and re-verify the released state ─────────
    await page.goto('/app');
    await signIn.signOut(author.email);
    await signIn.signIn(author.email, await mailboxFor(context));

    await site.open(project.id, englishSlug);
    await site.expectContains(englishBody);
    await site.open(project.id, vietnameseSlug, { lang: 'vi' });
    await site.expectContains(vietnameseBody);

    // ── 10. Referential integrity across the whole workflow ──────────────────
    const summary = await db.one<{
      languages: string;
      pages: string;
      groups: string;
      releases: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "Language" WHERE project_id = $1) AS languages,
         (SELECT count(*) FROM "Page" WHERE project_id = $1) AS pages,
         (SELECT count(*) FROM "Page" WHERE project_id = $1 AND kind = 'GROUP') AS groups,
         (SELECT count(*) FROM "Deployment" WHERE project_id = $1 AND status = 'ACTIVE') AS releases`,
      [project.id],
    );
    expect(Number(summary.languages)).toBe(2);
    expect(Number(summary.groups)).toBe(2);
    expect(Number(summary.releases)).toBe(1);

    diagnostics.assertClean({ label: 'workflow A: ' });
  });

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function mailboxFor(context: import('@playwright/test').BrowserContext) {
  const { Mailbox } = await import('../../src/support/mail');
  void context;
  return Mailbox.fromEnv();
}