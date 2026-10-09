import { expect, type Locator, type Page } from '@playwright/test';



export type EditorMode = 'visual' | 'wysiwyg' | 'markdown';

export interface PageRow {
  id: string;
  title: string;
  kind: 'PAGE' | 'GROUP';
  slug: string;
  path: string;
}

/**
 * The Notion-style project editor.
 *
 * Every helper here performs genuine UI work — clicking sidebar affordances,
 * typing into the title, letting the product autosave — rather than calling the
 * API behind the user's back. The business workflow stays visible in the test.
 */
export class EditorPage {
  constructor(readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}/editor`);
    await expect(this.page.getByRole('button', { name: 'New page' }).first()).toBeVisible({ timeout: 45_000 });
  }

  /** Reopen the editor, discarding whatever the page had cached. */
  async reload(projectId: string): Promise<void> {
    await this.goto(projectId);
  }

  // ── Language sections ──────────────────────────────────────────────────────

  /**
   * A language section, matched case-insensitively.
   *
   * BCP-47 tags are case-insensitive but the product stores the canonical
   * casing ("pt-BR"), so a caller that typed "pt-br" must still find it.
   */
  language(code: string): Locator {
    return this.page.locator(`[data-testid="language-section"][data-language-code="${code}" i]`);
  }

  async expectLanguageVisible(code: string, label?: string): Promise<void> {
    const section = this.language(code);
    await expect(section).toBeVisible();
    if (label) {
      await expect(section.getByText(label, { exact: true })).toBeVisible();
    }
  }

  async expectLanguageAbsent(code: string): Promise<void> {
    await expect(this.language(code)).toHaveCount(0);
  }

  async languageCodes(): Promise<string[]> {
    return this.page
      .locator('[data-testid="language-section"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-language-code') ?? ''));
  }

  /** Add a language and confirm the product rejected it (dialog stays open). */
  async addCustomLanguageExpectingRejection(
    code: string,
    label: string,
    message: RegExp,
  ): Promise<void> {
    await this.addCustomLanguage(code, label);
    await this.page.getByText(message).first().waitFor({ timeout: 20_000 });
  }

  /** Add a language through the sidebar catalog (click the native name). */
  async addLanguageFromCatalog(searchText: string): Promise<void> {
    await this.closeAnyDialog();
    await this.page.getByRole('button', { name: 'Add language' }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Add a language' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByPlaceholder('Search languages…').fill(searchText);
    const option = dialog.getByRole('option').filter({ hasText: searchText }).first();
    await option.click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }

  /** Add a language through the "custom code" path (arbitrary BCP-47 tags). */
  async addCustomLanguage(code: string, label: string, direction: 'LTR' | 'RTL' = 'LTR'): Promise<void> {
    await this.closeAnyDialog();
    await this.page.getByRole('button', { name: 'Add language' }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Add a language' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The dialog opens on the catalog; "Add a language not listed" switches it
    // to the free-form form. If it is already showing the free-form fields the
    // step is unnecessary.
    const notListed = dialog.getByRole('button', { name: 'Add a language not listed' });
    if (await notListed.isVisible().catch(() => false)) {
      await notListed.click();
    }
    await dialog.getByPlaceholder('zh-Hans-CN').fill(code);
    await dialog.getByLabel('Label', { exact: true }).fill(label);
    if (direction === 'RTL') {
      await dialog.getByLabel('Direction', { exact: true }).click();
      await this.page.getByRole('option', { name: 'Right to left' }).click();
    }
    await dialog.getByRole('button', { name: 'Add a language', exact: true }).click();
  }

  /** Confirm the add-language dialog closed (success) or is still open (failure). */
  async expectAddLanguageDialogClosed(): Promise<void> {
    await expect(this.page.getByRole('dialog').filter({ hasText: 'Add a language' })).toBeHidden({ timeout: 30_000 });
  }

  /** Open the per-language settings dialog and read the persisted label field. */
  async openLanguageSettings(code: string): Promise<Locator> {
    const section = this.language(code);
    await section.hover();
    await section.getByRole('button', { name: 'Language settings' }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Language settings' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /** Rename a language and optionally flip it to be the default. */
  async updateLanguageSettings(code: string, options: { label?: string; makeDefault?: boolean }): Promise<void> {
    const dialog = await this.openLanguageSettings(code);
    if (options.label !== undefined) {
      await dialog.getByLabel('Label', { exact: true }).fill(options.label);
    }
    if (options.makeDefault) {
      await dialog.getByText('Default language', { exact: false }).first().click();
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }

  // ── Page tree ──────────────────────────────────────────────────────────────

  /**
   * The Markdown / Rich text modes collapse the page tree. A person who wants
   * to see the tree clicks "Show pages" again, so tests do the same rather than
   * asserting against a hidden panel.
   */
  async ensureSidebarVisible(): Promise<void> {
    // The tree panel reports its own state; the toggle that opens it is only
    // meaningful while the panel is closed.
    const aside = this.page.locator('aside[aria-hidden="false"]');
    if (await aside.isVisible().catch(() => false)) return;
    const show = this.page.locator('[data-slot="button"][aria-label="Show pages"]');
    await expect(show).toBeVisible({ timeout: 15_000 });
    await show.click();
    await expect(aside, 'the page tree should open').toBeVisible({ timeout: 15_000 });
  }

  /** Open the tree panel and return the page rows for a language. */
  async openTree(code?: string): Promise<Locator> {
    await this.ensureSidebarVisible();
    return this.rows(code);
  }

  rows(code?: string): Locator {
    const scope = code ? this.language(code) : this.page.locator('[data-testid="language-section"]').first();
    return scope.locator('[data-testid="page-row"]');
  }

  rowByTitle(title: string, code?: string): Locator {
    return this.rows(code).filter({ has: this.page.getByRole('button', { name: title, exact: true }) }).first();
  }

  /** Create a top-level page inside a language (sidebar "+" affordance). */
  async createPage(code: string): Promise<void> {
    await this.ensureSidebarVisible();
    const section = this.language(code);
    await section.hover();
    await section.getByRole('button', { name: 'New page' }).click();
    await expect(this.page.getByRole('button', { name: 'Delete page' })).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Fire the "New page" affordance twice in quick succession, the way a double
   * click reaches the application. The product disables the control while the
   * create is in flight, so this must still produce a single document.
   */
  async createPageTwice(code: string): Promise<void> {
    const section = this.language(code);
    await section.hover();
    const button = section.getByRole('button', { name: 'New page' });
    await button.dblclick({ delay: 15 });
  }

  /**
   * Create a group (folder) inside a language.
   *
   * The product creates the group and immediately opens Page settings so the
   * author can name it; a person fills that in and saves, and so does this.
   */
  async createGroup(code: string, name?: string): Promise<string> {
    await this.ensureSidebarVisible();
    const section = this.language(code);
    await section.hover();
    await section.getByRole('button', { name: 'New group' }).click();

    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Page settings' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const title = name ?? 'New group';
    if (name) {
      await dialog.getByLabel('Title', { exact: true }).fill(name);
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await this.page.locator('[data-slot="dialog-overlay"]').waitFor({ state: 'detached', timeout: 15_000 });
    return title;
  }

  /** Create a child page under an existing group node. */
  async createChildPage(groupTitle: string, code: string): Promise<void> {
    await this.ensureSidebarVisible();
    const row = this.rowByTitle(groupTitle, code);
    await row.hover();
    await row.getByRole('button', { name: 'New page' }).click();
    await expect(this.page.getByRole('button', { name: 'Delete page' })).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Open a node in the editor.
   *
   * A PAGE shows a title field; a GROUP is a navigation container and has no
   * title editor, so the editor's own action bar is the signal that it opened.
   */
  async openPage(title: string, code?: string): Promise<void> {
    await this.ensureSidebarVisible();
    const row = this.rowByTitle(title, code);
    await row.getByRole('button', { name: title, exact: true }).click();
    // A PAGE opens a document editor; a GROUP opens the navigation-container
    // panel. Either counts as "opened".
    await expect
      .poll(
        async () =>
          (await this.titleInput.count()) > 0 ||
          (await this.page.getByRole('button', { name: 'Delete page' }).count()) > 0 ||
          (await this.page.getByText(/Groups organize related pages/i).count()) > 0,
        { timeout: 30_000, message: `"${title}" did not open in the editor` },
      )
      .toBe(true);
  }

  async expectPageVisible(title: string, code?: string): Promise<void> {
    await this.ensureSidebarVisible();
    await expect(this.rowByTitle(title, code)).toBeVisible();
  }

  async expectPageAbsent(title: string, code?: string): Promise<void> {
    await this.ensureSidebarVisible();
    await expect(this.rowByTitle(title, code)).toHaveCount(0);
  }

  /** Count rows without requiring the tree panel to be expanded. */
  async rowCount(code?: string): Promise<number> {
    await this.ensureSidebarVisible();
    return this.rows(code).count();
  }

  async pageRowData(title: string, code?: string): Promise<PageRow | null> {
    // The tree is not rendered while the Markdown/Rich text views are active;
    // a person opens it, and so does the test.
    await this.ensureSidebarVisible();
    const row = this.rowByTitle(title, code);
    if ((await row.count()) === 0) {
      return null;
    }
    return {
      id: (await row.getAttribute('data-page-id')) ?? '',
      kind: ((await row.getAttribute('data-page-kind')) ?? 'PAGE') as 'PAGE' | 'GROUP',
      slug: (await row.getAttribute('data-page-slug')) ?? '',
      path: (await row.getAttribute('data-page-path')) ?? '',
      title,
    };
  }

  async allPages(code?: string): Promise<PageRow[]> {
    await this.ensureSidebarVisible();
    return this.rows(code).evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-page-id') ?? '',
        kind: (node.getAttribute('data-page-kind') ?? 'PAGE') as 'PAGE' | 'GROUP',
        slug: node.getAttribute('data-page-slug') ?? '',
        path: node.getAttribute('data-page-path') ?? '',
        title: '',
      })),
    );
  }

  // ── Content editing ────────────────────────────────────────────────────────

  get titleInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Page title' });
  }

  /** Switch the body editor mode (Visual / Rich text / Markdown). */
  async setMode(mode: EditorMode): Promise<void> {
    const label = mode === 'visual' ? 'Visual' : mode === 'wysiwyg' ? 'Rich text' : 'Markdown';
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  get markdownBody(): Locator {
    return this.page.getByRole('textbox', { name: 'Write Markdown / MDX…' });
  }

  /**
   * The rich-text canvas used by the Visual / Rich text modes.
   *
   * Markdown mode renders a plain textarea instead, so this resolves to the
   * ProseMirror surface whenever one is present.
   */
  get canvas(): Locator {
    return this.page.locator('.ProseMirror, [contenteditable="true"]').first();
  }

  /** Type a title and wait for the product's debounced autosave to settle. */
  async setTitle(title: string): Promise<void> {
    const current = await this.titleInput.inputValue().catch(() => null);
    if (current === title) {
      return;
    }
    await this.fillTitle(title);
    await this.waitForSaved();
  }

  /**
   * Type a title without waiting for the save indicator.
   *
   * Used when the value is expected to be *rejected* — the autosave never
   * reaches "Saved", so waiting for it would mask the failure being tested.
   */
  async fillTitle(title: string): Promise<void> {
    const input = this.titleInput;
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.fill(title);
  }

  /** The error the product shows after a rejected autosave. */
  saveError(): Locator {
    return this.page.locator('[role="alert"], [data-slot="toast"]').filter({ hasText: /.+/ }).first();
  }

  /** Replace the page body through whichever editor mode is active. */
  async setBody(markdown: string): Promise<void> {
    const currentMode = await this.currentMode();
    if (currentMode === 'markdown') {
      const area = this.markdownBody;
      await area.click();
      await area.press('ControlOrMeta+a');
      await area.fill(markdown);
    } else {
      // Visual mode renders the Markdown into ProseMirror; the Markdown source
      // editor is the deterministic way to write exact content.
      await this.setMode('markdown');
      const area = this.markdownBody;
      await area.click();
      await area.press('ControlOrMeta+a');
      await area.fill(markdown);
    }
    await this.waitForSaved();
  }

  async currentMode(): Promise<EditorMode> {
    if (await this.markdownBody.isVisible()) {
      return 'markdown';
    }
    return 'visual';
  }

  /** The header autosave indicator is the product's own "write completed" signal. */
  async waitForSaved(): Promise<void> {
    await expect(this.page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Wait for the product to report that a save was rejected.
   *
   * Regression coverage for DEFECT-06: the server rejected the change and the
   * editor gave the author no indication, so the edit silently vanished on the
   * next reload.
   */
  async waitForSaveRejected(): Promise<void> {
    await expect(this.page.getByText('Not saved', { exact: true })).toBeVisible({ timeout: 30_000 });
  }

  /** Read the persisted body back out of the DOM (independent of the editor). */
  async readBodyText(): Promise<string> {
    if (await this.markdownBody.isVisible()) {
      return (await this.markdownBody.inputValue()) ?? '';
    }
    return (await this.canvas.innerText()).trim();
  }

  // ── Page settings ──────────────────────────────────────────────────────────

  async openPageSettings(): Promise<Locator> {
    await this.closeAnyDialog();
    const hidePages = this.page.getByRole('button', { name: 'Hide pages' });
    if (await hidePages.isVisible().catch(() => false)) {
      await hidePages.click();
    }
    await this.page.getByRole('button', { name: 'Page settings' }).first().click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Page settings' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /**
   * Dismiss any dialog still on screen, including the animated overlay that
   * lingers after a close, so the next click lands on the real control.
   */
  async closeAnyDialog(): Promise<void> {
    const overlay = this.page.locator('[data-slot="dialog-overlay"]');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if ((await overlay.count()) === 0) return;
      await this.page.keyboard.press('Escape');
      await expect(overlay).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
    }
  }

  /** Switch the Page settings dialog to one of its tabs. */
  async openPageSettingsTab(tab: 'General' | 'SEO' | 'Behaviour'): Promise<Locator> {
    const dialog = await this.openPageSettings();
    await dialog.getByRole('button', { name: tab, exact: true }).click();
    return dialog;
  }

  async updatePageSettings(
    patch: { slug?: string; title?: string; description?: string; hidden?: boolean },
  ): Promise<void> {
    const dialog = await this.openPageSettings();
    if (patch.title !== undefined) await dialog.getByLabel('Title', { exact: true }).fill(patch.title);
    if (patch.slug !== undefined) await dialog.getByLabel('Slug', { exact: true }).fill(patch.slug);
    if (patch.description !== undefined) {
      await dialog.getByLabel('Description', { exact: true }).fill(patch.description);
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await this.page.locator('[data-slot="dialog-overlay"]').waitFor({ state: 'detached', timeout: 15_000 });

    if (patch.hidden !== undefined) {
      // "Hidden" lives in the General tab, next to the description.
      const general = await this.openPageSettings();
      // The switch is a base-ui control whose real <input> is visually hidden;
      // a person clicks the visible track (equivalently, its label), so drive
      // it the same way.
      const hidden = general.locator('#page-hidden');
      const already = (await hidden.isChecked().catch(() => false));
      if (already !== patch.hidden) {
        await general.getByText('Hidden', { exact: true }).click();
      }
      await general.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(general).toBeHidden({ timeout: 30_000 });
    }
  }

  /** Delete the open page and confirm in the product's confirm dialog. */
  async deleteOpenPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete page' }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Delete this page?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete page' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }

  async cancelDeletePage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete page' }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Delete this page?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  }

  // ── Filter box ─────────────────────────────────────────────────────────────

  async filterPages(query: string): Promise<void> {
    await this.filterInput.fill(query);
  }

  /** The product exposes no "clear" button — the filter is just emptied. */
  async clearFilter(): Promise<void> {
    await this.filterInput.fill('');
  }

  get filterInput(): Locator {
    return this.page.getByPlaceholder('Filter pages...');
  }

  /**
   * Send a hand-crafted update from inside the authenticated browser session.
   *
   * Used only for security-boundary cases the UI cannot express (a page moved to
   * another language, an id belonging to another project). The request itself is
   * the product's real endpoint with the real session cookie.
   */
  async updatePageViaBrowserApi(
    projectId: string,
    pageId: string,
    patch: Record<string, unknown>,
  ): Promise<{ status: number; body: string }> {
    return this.page.evaluate(
      async ({ projectId: project, pageId: id, patch: payload }) => {
        const response = await fetch(`/api/app/projects/${project}/pages/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return { status: response.status, body: await response.text() };
      },
      { projectId, pageId, patch },
    );
  }

  // ── Versions (backed by branches) ──────────────────────────────────────────

  /**
   * Open the version switcher. In this product "version" is a branch: authors
   * create a version, edit it in isolation, and publish whichever version is
   * live. The dropdown trigger shows the active version's name.
   */
  async openVersionMenu(activeName: string): Promise<Locator> {
    await this.page.getByRole('button', { name: activeName, exact: true }).first().click();
    return this.page.getByRole('menu');
  }

  async createVersion(name: string): Promise<void> {
    await this.openActiveVersionMenu();
    await this.page.getByRole('menuitem', { name: 'New version' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Version name').fill(name);
    await dialog.getByRole('button', { name: /create/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  }

  /** Open the version dropdown showing whichever version is active. */
  async openActiveVersionMenu(): Promise<Locator> {
    await this.page.getByRole('button', { name: /^(main|default|v)/i }).first().click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async switchVersion(name: string): Promise<void> {
    await this.openActiveVersionMenu();
    await this.page.getByRole('menuitem', { name: new RegExp(`^${escapeRegExp(name)}$`) }).first().click();
    await expect(this.page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}$`) }).first()).toBeVisible();
  }

  async promoteActiveVersion(): Promise<void> {
    await this.openActiveVersionMenu();
    await this.page.getByRole('menuitem', { name: 'Promote into main' }).click();
    const confirmDialog = this.page.getByRole('dialog').filter({ hasText: 'Promote' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Promote into main' }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 45_000 });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}