import { expect, test } from '../../src/fixtures/test';

/**
 * Cross-engine smoke set.
 *
 * The full business matrix runs on Chromium (see the other suites). This file
 * proves the critical public paths behave the same in Firefox and WebKit so a
 * browser-specific regression in the rich-text canvas, the tree or the release
 * dialog is caught rather than assumed away.
 */
test.describe('cross-engine smoke', () => {
  test('signs in, creates a site, publishes a document and reads it back', async ({
    page,
    signIn,
    dashboard,
    editor,
    publish,
    site,
    mailbox,
    diagnostics,
  }) => {
    test.setTimeout(300_000);

    await signIn.signIn(`engine.${Date.now()}@cms-e2e.local`, mailbox);
    const siteSummary = await dashboard.createSite('E2E Cross Engine');

    await editor.goto(siteSummary.id);
    await editor.createPage('en');
    await editor.setTitle('Cross Engine Doc');
    await editor.setBody('# Cross Engine Doc\n\nRendered identically.\n');

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    await site.open(siteSummary.id, 'cross-engine-doc');
    await site.expectContains('Rendered identically.');

    await page.reload();
    await site.expectContains('Rendered identically.');

    diagnostics.assertClean({ label: 'cross-engine: ' });
  });
});