import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The published documentation site a reader sees — the real public surface at
 * `/sites/{projectId}`, rendered from the immutable release snapshot.
 *
 * Every release assertion is made here, not just in the admin UI, because the
 * admin saying "Deployed successfully" is not evidence that readers see the
 * content.
 */
export class PublicSite {
  constructor(readonly page: Page) {}

  /**
   * Open the public URL a reader would use.
   *
   * On a loopback host the server deliberately answers `/sites/**` with the
   * studio shell (see DEFECT-10), so a silent success here would assert against
   * the CMS application instead of the documentation. Fail loudly instead.
   */
  async open(projectId: string, path = '', options: { lang?: string; version?: string } = {}): Promise<void> {
    const segments = [options.version, path].filter(Boolean).join('/');
    const query = options.lang ? `?lang=${encodeURIComponent(options.lang)}` : '';
    await this.page.goto(`/sites/${projectId}${segments ? `/${segments}` : ''}${query}`);
    await this.assertNotStudioShell();
  }

  /**
   * The published site and the studio are different documents. Detect the
   * studio shell so a release assertion can never accidentally pass by reading
   * the author's own application.
   */
  async assertNotStudioShell(): Promise<void> {
    const shell = await this.page
      .evaluate(() => ({
        hasStudioRoot: Boolean(document.querySelector('#root, [data-tanstack-router]')),
        title: document.title,
      }))
      .catch(() => ({ hasStudioRoot: false, title: '' }));
    if (shell.hasStudioRoot) {
      throw new Error(
        `The public URL served the studio application (title "${shell.title}") instead of a ` +
          'published documentation site. See DEFECT-10: on a loopback host /sites/** always ' +
          'falls through to the SPA, so the documentation site is unreachable here.',
      );
    }
  }

  async openUrl(url: string): Promise<void> {
    await this.page.goto(url);
  }

  get article(): Locator {
    return this.page.locator('article');
  }

  get heading(): Locator {
    return this.page.locator('article h1').first();
  }

  get body(): Locator {
    return this.page.locator('article');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('article')).toBeVisible({ timeout: 45_000 });
  }

  async expectTitle(title: string | RegExp): Promise<void> {
    await this.expectLoaded();
    if (typeof title === 'string') {
      await expect(this.heading).toHaveText(title);
    } else {
      await expect(this.heading).toHaveText(title);
    }
  }

  async text(): Promise<string> {
    await this.expectLoaded();
    return (await this.body.innerText()).trim();
  }

  async expectContains(needle: string): Promise<void> {
    await this.expectLoaded();
    await expect(this.body).toContainText(needle);
  }

  async expectNotContains(needle: string): Promise<void> {
    await this.expectLoaded();
    await expect(this.body).not.toContainText(needle);
  }

  /** Switch language through the reader's own control (a real user action). */
  async switchLanguage(code: string): Promise<void> {
    await this.page.getByRole('button', { name: /Change language/i }).click();
    await this.page.getByRole('menuitem', { name: new RegExp(code, 'i') }).click();
  }

  async hasLanguageSwitcher(): Promise<boolean> {
    return this.page.getByRole('button', { name: /Change language/i }).isVisible();
  }

  /** Sidebar navigation link for a published page/group. */
  navLink(title: string): Locator {
    return this.page.getByRole('link', { name: title, exact: true }).first();
  }

  async navigateTo(title: string): Promise<void> {
    await this.navLink(title).click();
    await expect(this.page.locator('article')).toBeVisible({ timeout: 30_000 });
  }

  async expectNotFound(): Promise<void> {
    await expect(this.page.getByText(/not found|404/i).first()).toBeVisible({ timeout: 30_000 });
  }

  /** Raw HTML, used for escaping / script-injection style assertions. */
  async rawHtml(): Promise<string> {
    return await this.page.content();
  }

  async expectNoScriptExecution(markerId: string): Promise<void> {
    const flag = await this.page.evaluate((id) => (window as unknown as Record<string, unknown>)[id], markerId);
    expect(flag, 'injected script must not run on the published site').toBeUndefined();
  }
}
