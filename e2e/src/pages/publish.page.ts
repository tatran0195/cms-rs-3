import { expect, type Locator, type Page } from '@playwright/test';

export type DeployOutcome = 'ready' | 'failed';

/**
 * The release flow: open the publish dialog, review the change set, publish,
 * and wait for the product's own pipeline to report the outcome.
 *
 * Nothing here assumes a publish succeeded — `publishAndWait` returns the
 * outcome so a test can assert the failure path with the same real UI.
 */
export class PublishControl {
  constructor(private readonly page: Page) {}

  async openDialog(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Publish to production' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /** The change rows the dialog claims will go live. */
  async pendingChanges(): Promise<Array<{ title: string; path: string; status: string }>> {
    const dialog = await this.openDialog();
    // Let the preflight request settle.
    // The preflight request fills the change list; wait for it to settle rather
    // than guessing with a sleep.
    await expect(dialog.getByText('Checking for changes'))
      .toBeHidden({ timeout: 30_000 })
      .catch(() => {
        /* ignore */
      });
    await expect
      .poll(async () => dialog.locator('li').count(), { timeout: 30_000 })
      .toBeGreaterThan(0)
      .catch(() => {
        /* ignore */
      });
    // Each pending change is a list row of "<title><path><status>".
    const rows = await dialog.locator('li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const text = node.textContent ?? '';
        const status = /\bNew\b/.test(text) ? 'added' : /\bRemoved?\b/.test(text) ? 'removed' : /\bEdit(ed)?\b/.test(text) ? 'modified' : 'unknown';
        const path = /(\/[^\s]*)/.exec(text)?.[1] ?? '';
        const title = text
          .replace(status === 'added' ? /\s*New\s*$/ : '', '')
          .replace(/\s*\/?[^\s]*\s*(New|Removed|Edited)?\s*$/, '')
          .trim();
        return { title, path, status };
      }),
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    return rows.filter((row) => row.path.startsWith('/') && row.status !== 'unknown');
  }

  /** Publish and wait for the deploy pipeline to settle. Returns the outcome. */
  async publishAndWait(options: { message?: string; reviewDiff?: boolean } = {}): Promise<DeployOutcome> {
    const dialog = await this.openDialog();
    await expect(dialog.getByText('Checking for changes'))
      .toBeHidden({ timeout: 30_000 })
      .catch(() => {
        /* ignore */
      });

    if (options.reviewDiff) {
      await dialog.getByRole('button', { name: 'Review diff' }).click();
      await expect(dialog.getByText('Review changes')).toBeVisible();
    }

    if (options.message !== undefined) {
      await dialog.getByPlaceholder('Describe this release (optional)').fill(options.message);
    }

    const publishNow = dialog.getByRole('button', { name: 'Publish now' });
    await expect(publishNow).toBeEnabled({ timeout: 30_000 });
    await publishNow.click();

    // The dialog hands over to the deploy pipeline dialog.
    const pipeline = this.page.getByRole('dialog').filter({ hasText: /Deploying…|Deployed successfully|Deploy failed/ });
    await expect(pipeline).toBeVisible({ timeout: 45_000 });

    const succeeded = this.page.getByText('Deployed successfully', { exact: true });
    const failed = this.page.getByText('Deploy failed', { exact: true });
    await expect(succeeded.or(failed)).toBeVisible({ timeout: 120_000 });
    return (await succeeded.isVisible()) ? 'ready' : 'failed';
  }

  /** The deploy dialog after a successful release. */
  pipeline(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: /Deployed successfully|Deploy failed/ });
  }

  async closePipeline(): Promise<void> {
    const pipeline = this.pipeline();
    if (await pipeline.isHidden()) {
      return;
    }
    const done = pipeline.getByRole('button', { name: 'Done', exact: true });
    if (await done.isVisible()) {
      await done.click().catch(() => {
        /* ignore */
      });
    } else {
      const close = pipeline.getByRole('button', { name: 'Close', exact: true });
      if (await close.isVisible()) {
        await close.click().catch(() => {
          /* ignore */
        });
      }
    }
    await expect(pipeline).toBeHidden({ timeout: 30_000 });
  }

  /** Roll back to the previous release through the pipeline dialog. */
  async rollBackToPreviousVersion(): Promise<DeployOutcome> {
    const pipeline = this.pipeline();
    const rollBack = pipeline.getByRole('button', { name: 'Roll back' });
    await expect(rollBack).toBeEnabled({ timeout: 30_000 });
    await rollBack.click();
    const confirmDialog = this.page.getByRole('dialog').filter({ hasText: /Roll back to v/ });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Roll back' }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 45_000 });

    const succeeded = this.page.getByText('Deployed successfully', { exact: true });
    const failed = this.page.getByText('Deploy failed', { exact: true });
    await expect(succeeded.or(failed)).toBeVisible({ timeout: 120_000 });
    return (await succeeded.isVisible()) ? 'ready' : 'failed';
  }

  async isPublishDisabled(): Promise<boolean> {
    const dialog = await this.openDialog();
    const disabled = await dialog.getByRole('button', { name: 'Publish now' }).isDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    return disabled;
  }
}
