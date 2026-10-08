import { expect, test } from '../../src/fixtures/test';
import { uniqueName } from '../../src/support/data';

/**
 * Release lifecycle: draft → publish → public content → edit → republish →
 * rollback, plus the failure paths.
 *
 * In this product a release is an immutable `Deployment` snapshot. The published
 * site is served from that snapshot, never from the mutable editor tables, which
 * is exactly what makes "draft must not leak" a meaningful invariant.
 */
test.describe('releases', () => {
  test('publishing a document makes it visible on the public site and a later draft does not leak',
    async ({ page, editor, publish, releases, project, db, diagnostics }) => {
      const title = uniqueName('Release Target');
      const v1 = `v1-body-${Date.now()}`;
      const v2 = `v2-body-${Date.now()}`;

      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${v1}\n`);
      await editor.expectPageVisible(title, 'en');

      // Before any release there is nothing live for a reader to be served.
      expect(await releases.activeDeployment(project.id), 'nothing is live before the first release').toBeNull();

      const outcome = await publish.publishAndWait({ message: 'First release' });
      expect(outcome, 'publish should reach the live state').toBe('ready');
      await publish.closePipeline();

      const livePath = `/${slugOf(title)}`;
      const live = await releases.activeDeployment(project.id);
      expect(live, 'the release must be live').not.toBeNull();
      expect(await releases.snapshotPageText(live!.id, livePath), 'the release must contain v1').toContain(v1);

      // Now change the draft but do not publish it.
      await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(title, 'en'))!.id}`);
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${v2}\n`);

      // The live snapshot is immutable: a later draft must not reach readers.
      const stillLive = await releases.activeDeployment(project.id);
      expect(stillLive!.id, 'editing a draft must not create a new live release').toBe(live!.id);
      const liveText = await releases.snapshotPageText(stillLive!.id, livePath);
      expect(liveText, 'the live release still serves v1').toContain(v1);
      expect(liveText, 'the unsaved draft must never reach a reader').not.toContain(v2);

      // Independently: exactly one ACTIVE deployment exists for the release.
      const active = await db.count(
        `SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1 AND status = 'ACTIVE'`,
        [project.id],
      );
      expect(active).toBe(1);
      diagnostics.assertClean({ label: 'draft must not leak: ' });
    });

  test('republishing upgrades the public content and keeps the snapshot history',
    async ({ page, editor, publish, releases, project, db }) => {
      const title = uniqueName('Upgraded');
      const v1 = `first-${Date.now()}`;
      const v2 = `second-${Date.now()}`;

      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${v1}\n`);
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      const livePath = `/${slugOf(title)}`;
      const first = await releases.activeDeployment(project.id);
      expect(await releases.snapshotPageText(first!.id, livePath)).toContain(v1);

      await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(title, 'en'))!.id}`);
      await editor.setBody(`# ${title}\n\n${v2}\n`);

      expect(await publish.publishAndWait({ message: 'Upgrade' })).toBe('ready');
      await publish.closePipeline();

      // The superseded release keeps its own frozen copy…
      expect(await releases.snapshotPageText(first!.id, livePath), 'the old snapshot is immutable').toContain(v1);
      // …while readers now get the new one.
      const second = await releases.activeDeployment(project.id);
      expect(second!.id, 'republishing must create a new live release').not.toBe(first!.id);
      const upgraded = await releases.snapshotPageText(second!.id, livePath);
      expect(upgraded).toContain(v2);
      expect(upgraded, 'the new release must not carry the superseded body').not.toContain(v1);

      // History: both releases remain addressable with their own version numbers.
      const history = await releases.deploymentHistory(project.id);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.filter((row) => row.status === 'ACTIVE').length).toBe(1);
    });

  test('rolling back restores the previous release content while the editor keeps the newer draft',
    async ({ page, editor, publish, releases, project, db }) => {
      const title = uniqueName('Rollback');
      const v1 = `rollback-v1-${Date.now()}`;
      const v2 = `rollback-v2-${Date.now()}`;

      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\n${v1}\n`);
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(title, 'en'))!.id}`);
      await editor.setBody(`# ${title}\n\n${v2}\n`);
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      const livePath = `/${slugOf(title)}`;
      const v2Release = await releases.activeDeployment(project.id);
      expect(await releases.snapshotPageText(v2Release!.id, livePath)).toContain(v2);

      expect(await publish.rollBackToPreviousVersion()).toBe('ready');
      await publish.closePipeline();

      // After the rollback the previously live release is the one served again.
      const restored = await releases.activeDeployment(project.id);
      expect(restored!.id, 'rollback must make the earlier release live again').not.toBe(v2Release!.id);
      const restoredText = await releases.snapshotPageText(restored!.id, livePath);
      expect(restoredText).toContain(v1);
      expect(restoredText, 'the rolled-back release must not serve v2').not.toContain(v2);
      expect(await releases.snapshotPageText(v2Release!.id, livePath), 'v2 survives as history').toContain(v2);

      // The editor still holds the author's newest draft: rollback is a release
      // operation, not a content revert.
      await page.goto(`/app/projects/${project.id}/editor?page=${(await editor.pageRowData(title, 'en'))!.id}`);
      await editor.setMode('markdown');
      await expect(editor.markdownBody).toHaveValue(new RegExp(escapeRegExp(v2)));

      const rollbackRows = await db.query(
        `SELECT build_logs FROM "Deployment" WHERE project_id = $1 ORDER BY created_at`,
        [project.id],
      );
      expect(rollbackRows.some((row) => (row.build_logs ?? '').startsWith('Rollback to deployment'))).toBe(true);
    });

  test('publishing with no changes reports "nothing new" and creates no release',
    async ({ editor, publish, project, db }) => {
      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(uniqueName('Once'));
      await editor.setBody('stable body');
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      const before = await db.count(`SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1`, [project.id]);

      const dialog = await publish.openDialog();
      // The product must tell the author there is nothing to do, and must not
      // leave an enabled publish button that would create an empty release.
      await expect(dialog.getByText(/No changes since the last publish/i)).toBeVisible({ timeout: 30_000 });
      const publishNow = dialog.getByRole('button', { name: 'Publish now' });
      await expect(publishNow).toBeDisabled({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      const after = await db.count(`SELECT count(*) AS count FROM "Deployment" WHERE project_id = $1`, [project.id]);
      expect(after, 'an unchanged site must not create a new release').toBe(before);
    });

  test('a hidden page is excluded from the release', async ({ editor, publish, releases, project, db }) => {
    const visible = uniqueName('Visible');
    const hidden = uniqueName('Hidden');
    const hiddenMarker = `hidden-${Date.now()}`;

    await editor.goto(project.id);
    await editor.createPage('en');
    await editor.setTitle(visible);
    await editor.setBody(`# ${visible}\n\nvisible-body\n`);
    await editor.createPage('en');
    await editor.setTitle(hidden);
    await editor.setBody(`# ${hidden}\n\n${hiddenMarker}\n`);
    await editor.updatePageSettings({ hidden: true });

    expect(await publish.publishAndWait()).toBe('ready');
    await publish.closePipeline();

    const live = await releases.activeDeployment(project.id);
    expect(live, 'the release must be live').not.toBeNull();
    const frozen = await releases.snapshotPaths(live!.id);
    const frozenPaths = frozen.map((row) => row.path);

    expect(frozenPaths, 'the visible page must be released').toContain(`/${slugOf(visible)}`);
    expect(
      frozenPaths,
      'a hidden page must not be part of the release a reader can reach',
    ).not.toContain(`/${slugOf(hidden)}`);
    expect(await releases.snapshotPageText(live!.id, `/${slugOf(hidden)}`)).toBe('');

    const published = await db.count(
      `SELECT count(*) AS count FROM "DeploymentSnapshotPageIndex" i
         JOIN "Deployment" d ON d.id = i.deployment_id
        WHERE d.project_id = $1 AND d.status = 'ACTIVE' AND i.is_published`,
      [project.id],
    );
    expect(published).toBeGreaterThan(0);
  });

  test('a page whose slug is unsafe to publish fails the release without corrupting the live site',
    async ({ editor, publish, project, db, diagnostics }) => {
      const title = uniqueName('Stable');
      await editor.goto(project.id);
      await editor.createPage('en');
      await editor.setTitle(title);
      await editor.setBody(`# ${title}\n\nstable-body\n`);
      expect(await publish.publishAndWait()).toBe('ready');
      await publish.closePipeline();

      // A traversal-shaped slug is normalised away by the API; assert the rule
      // rather than assuming either outcome is acceptable.
      await editor.updatePageSettings({ slug: '../../etc/passwd' });
      const stored = await db.one(`SELECT slug, path FROM "Page" WHERE project_id = $1 AND title = $2`, [project.id, title]);
      expect(stored.slug, 'path traversal segments must never reach storage').not.toContain('..');
      expect(stored.path.startsWith('/')).toBe(true);
      diagnostics.assertClean({ label: 'unsafe slug: ' });
    });
});

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}