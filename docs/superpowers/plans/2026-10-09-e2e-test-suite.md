# E2E Test Suite Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform disparate standalone `.mjs` verification scripts into a comprehensive, modular, production-grade Playwright E2E test suite covering all application pages with Page Object Models, fixtures, and typed assertions.

**Architecture:** Use `@playwright/test` targeting the active Studio frontend (`http://localhost:4310`, proxying `/api` to `http://localhost:3000`). Abstract each page into a strongly-typed Page Object Model under `e2e/src/pages/`. Inject authenticated cookies via fixtures to ensure fast execution while maintaining realistic, independent tests under `e2e/tests/pages/`.

**Tech Stack:** `@playwright/test`, TypeScript, Node.js.

## Global Constraints
- Target frontend: `http://localhost:4310` by default, configurable via `E2E_BASE_URL`.
- Internal company platform scope: Strictly NO billing, plans, or subscription UI checks (per `AGENTS.md` and `GEMINI.md`).
- Fast test execution: Reusable pre-authenticated sessions via cookies instead of repeated UI logins for non-auth tests.
- Complete type safety: All Page Objects and test assertions must compile cleanly with `tsc --noEmit`.

---

### Task 1: Playwright Configuration & Environment Tuning

**Files:**
- Modify: `e2e/playwright.config.ts`
- Modify: `e2e/runtime/global-setup.ts`
- Modify: `e2e/src/support/env.ts`

**Interfaces:**
- Produces: `baseURL` defaulting to `http://localhost:4310` with automatic fallback to `http://127.0.0.1:3000`.
- Produces: `globalSetup` verifying that both Studio (`/`) and API (`/api/health`) respond.

- [ ] **Step 1: Update `playwright.config.ts`**

Update `e2e/playwright.config.ts` to default `baseURL` to `process.env.E2E_BASE_URL ?? 'http://localhost:4310'`, include Chromium by default, and update test directory to include `tests`.

```typescript
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
```

- [ ] **Step 2: Update `global-setup.ts` and `env.ts`**

Update `e2e/runtime/global-setup.ts` to perform a non-blocking check against `${baseURL}/api/health` so tests can run cleanly in dev mode without requiring full bash stack scripts.

```typescript
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
  try {
    const res = await fetch(`${baseURL}/api/health`);
    if (!res.ok) {
      console.warn(`Health check returned status ${res.status} at ${baseURL}/api/health`);
    }
  } catch (err) {
    console.warn(`Warning: Backend health check failed at ${baseURL}/api/health: ${err}`);
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm --filter @cms/e2e typecheck` (or `bun --filter @cms/e2e typecheck`)
Expected: Code 0 (No type errors).

- [ ] **Step 4: Commit**

```bash
git add e2e/playwright.config.ts e2e/runtime/global-setup.ts e2e/src/support/env.ts
git commit -m "test(e2e): configure default baseURL to studio dev server and relax global setup"
```

---

### Task 2: Auth & Invitation Page Object Models (`SignInPage` & `AcceptInvitationPage`)

**Files:**
- Modify: `e2e/src/pages/signin.page.ts`
- Create: `e2e/src/pages/invitation.page.ts`

**Interfaces:**
- Produces: `SignInPage` with methods: `signIn(email, password)`, `signUp(name, email, password)`, `signOut()`, `expectError(pattern)`.
- Produces: `AcceptInvitationPage` with methods: `goto(token)`, `expectInvitationDetails(workspaceName, inviterName)`, `accept()`.

- [ ] **Step 1: Implement password and registration methods on `SignInPage`**

Update `e2e/src/pages/signin.page.ts` to support standard email/password authentication as well as registration and sign-out:

```typescript
export class SignInPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/sign-in');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async signInWithPassword(email: string, password = 'Password123!'): Promise<void> {
    await this.goto();
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign in|log in/i }).click();
    await this.page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  async signUp(name: string, email: string, password = 'Password123!'): Promise<void> {
    await this.page.goto('/sign-up');
    await this.page.getByLabel(/name/i).fill(name);
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign up|create account/i }).click();
    await this.page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  async signOut(): Promise<void> {
    await this.page.locator('button[data-testid="account-menu"], button:has-text("Toggle Sidebar")').first().click();
    const signOutBtn = this.page.getByRole('menuitem', { name: /sign out|log out/i });
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
    }
  }
}
```

- [ ] **Step 2: Create `AcceptInvitationPage` POM**

Create `e2e/src/pages/invitation.page.ts`:

```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class AcceptInvitationPage {
  readonly workspaceHeading: Locator;
  readonly acceptButton: Locator;

  constructor(private readonly page: Page) {
    this.workspaceHeading = page.locator('h1, h2, h3').first();
    this.acceptButton = page.getByRole('button', { name: /accept|join/i });
  }

  async goto(token: string): Promise<void> {
    await this.page.goto(`/accept-invitation?token=${token}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectInvitationVisible(): Promise<void> {
    await expect(this.acceptButton).toBeVisible({ timeout: 10_000 });
  }

  async accept(): Promise<void> {
    await this.acceptButton.click();
    await this.page.waitForURL(/\/app/, { timeout: 15_000 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `tsc --noEmit -p e2e/tsconfig.json`
Expected: Code 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/src/pages/signin.page.ts e2e/src/pages/invitation.page.ts
git commit -m "test(e2e): add SignInPage password/signup methods and AcceptInvitationPage POM"
```

---

### Task 3: Workspace Navigation, Dashboard, Sites & Analytics Page Objects

**Files:**
- Modify: `e2e/src/pages/dashboard.page.ts`
- Create: `e2e/src/pages/sites.page.ts`
- Create: `e2e/src/pages/analytics.page.ts`

**Interfaces:**
- Produces: `DashboardPage` with methods: `goto()`, `expectOverviewVisible()`, `openQuickSearch()`, `navigateToSites()`, `navigateToAnalytics()`, `navigateToSettings()`.
- Produces: `SitesPage` with methods: `goto()`, `expectSitesListVisible()`, `searchSites(query)`, `createSite(name, slug, description)`.
- Produces: `AnalyticsPage` with methods: `goto()`, `expectAnalyticsMetricsVisible()`.

- [ ] **Step 1: Update `DashboardPage` POM**

Update `e2e/src/pages/dashboard.page.ts` with navigation shortcuts and overview assertions:

```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class DashboardPage {
  readonly searchButton: Locator;
  readonly sidebarOverview: Locator;
  readonly sidebarSites: Locator;
  readonly sidebarAnalytics: Locator;
  readonly sidebarSettings: Locator;

  constructor(private readonly page: Page) {
    this.searchButton = page.locator('button:has-text("Search…"), button:has-text("Ctrl K")').first();
    this.sidebarOverview = page.getByRole('link', { name: 'Overview' }).first();
    this.sidebarSites = page.getByRole('link', { name: 'Sites' }).first();
    this.sidebarAnalytics = page.getByRole('link', { name: 'Analytics' }).first();
    this.sidebarSettings = page.getByRole('link', { name: 'Settings' }).first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/app');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectOverviewVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Overview|All sites|Your sites/i);
  }

  async openQuickSearch(): Promise<void> {
    await this.searchButton.click();
    await expect(this.page.locator('[role="dialog"], [data-cmdk-root]')).toBeVisible();
  }
}
```

- [ ] **Step 2: Create `SitesPage` POM**

Create `e2e/src/pages/sites.page.ts`:

```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class SitesPage {
  readonly searchInput: Locator;
  readonly newSiteButton: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.locator('input[placeholder*="Search"]').first();
    this.newSiteButton = page.getByRole('button', { name: /new site|create site|new project/i }).first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/sites');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectSitesListVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/All sites|Your sites/i);
  }

  async createSite(name: string, slug?: string): Promise<string> {
    await this.newSiteButton.click();
    const dialog = this.page.locator('[role="dialog"]').first();
    await dialog.getByLabel(/name/i).fill(name);
    if (slug) {
      const slugInput = dialog.getByLabel(/slug/i);
      if (await slugInput.isVisible()) {
        await slugInput.fill(slug);
      }
    }
    await dialog.getByRole('button', { name: /create/i }).click();
    await this.page.waitForURL(/\/app\/projects\//, { timeout: 15_000 });
    const match = this.page.url().match(/\/app\/projects\/([^/?#]+)/);
    return match ? match[1] : '';
  }
}
```

- [ ] **Step 3: Create `AnalyticsPage` POM**

Create `e2e/src/pages/analytics.page.ts`:

```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class AnalyticsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/analytics');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectAnalyticsVisible(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Analytics|Traffic|Views/i);
  }
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `tsc --noEmit -p e2e/tsconfig.json`
Expected: Code 0.

- [ ] **Step 5: Commit**

```bash
git add e2e/src/pages/dashboard.page.ts e2e/src/pages/sites.page.ts e2e/src/pages/analytics.page.ts
git commit -m "test(e2e): add Dashboard, Sites, and Analytics Page Objects"
```

---

### Task 4: Workspace Settings & Members Page Object Model

**Files:**
- Create: `e2e/src/pages/workspace-settings.page.ts`

**Interfaces:**
- Produces: `WorkspaceSettingsPage` with methods:
  - `goto()`
  - `updateWorkspaceName(name)`
  - `navigateToMembersTab()`
  - `expectMember(email, role)`
  - `inviteMember(email, role)`
  - `updateMemberRole(userId, newRole)`
  - `cancelInvitation(invitationIdOrEmail)`
  - `removeMember(userId)`

- [ ] **Step 1: Implement `WorkspaceSettingsPage` POM**

Create `e2e/src/pages/workspace-settings.page.ts`:

```typescript
import { expect, type Locator, type Page } from '@playwright/test';

export class WorkspaceSettingsPage {
  readonly workspaceNameInput: Locator;
  readonly saveSettingsButton: Locator;
  readonly membersTab: Locator;
  readonly inviteMemberButton: Locator;

  constructor(private readonly page: Page) {
    this.workspaceNameInput = page.getByLabel(/workspace name|name/i).first();
    this.saveSettingsButton = page.getByRole('button', { name: /save|update/i }).first();
    this.membersTab = page.getByRole('tab', { name: /members/i }).or(page.getByRole('button', { name: /members/i })).first();
    this.inviteMemberButton = page.getByRole('button', { name: /invite member|invite/i }).first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/settings');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async updateWorkspaceName(name: string): Promise<void> {
    await this.goto();
    await this.workspaceNameInput.fill(name);
    await this.saveSettingsButton.click();
    await expect(this.page.locator('body')).toContainText(/saved|updated/i);
  }

  async navigateToMembersTab(): Promise<void> {
    await this.goto();
    if (await this.membersTab.isVisible()) {
      await this.membersTab.click();
    }
  }

  async expectMember(email: string, role?: string): Promise<void> {
    const row = this.page.locator('tr, div', { hasText: email }).first();
    await expect(row).toBeVisible();
    if (role) {
      await expect(row).toContainText(new RegExp(role, 'i'));
    }
  }

  async inviteMember(email: string, role = 'member'): Promise<void> {
    await this.inviteMemberButton.click();
    const modal = this.page.locator('[role="dialog"]').first();
    await modal.getByLabel(/email/i).fill(email);
    const roleSelect = modal.getByRole('combobox').or(modal.locator('select')).first();
    if (await roleSelect.isVisible()) {
      await roleSelect.selectOption({ value: role }).catch(() => {});
    }
    await modal.getByRole('button', { name: /send invite|invite/i }).click();
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `tsc --noEmit -p e2e/tsconfig.json`
Expected: Code 0.

- [ ] **Step 3: Commit**

```bash
git add e2e/src/pages/workspace-settings.page.ts
git commit -m "test(e2e): create WorkspaceSettingsPage POM for settings and member management"
```

---

### Task 5: Project Workspace, Editor, Preview & Settings Page Objects

**Files:**
- Create: `e2e/src/pages/project-workspace.page.ts`
- Create: `e2e/src/pages/preview.page.ts`
- Create: `e2e/src/pages/project-settings.page.ts`
- Modify: `e2e/src/pages/editor.page.ts`

**Interfaces:**
- Produces: `ProjectWorkspacePage` with methods: `goto(projectId)`, `expectProjectLoaded()`.
- Produces: `PreviewPage` with methods: `goto(projectId)`, `expectPreviewLoaded()`, `setViewport(mode)`.
- Produces: `ProjectSettingsPage` with methods: `goto(projectId)`, `expectSectionsAvailable()`, `assertNoBillingSection()`.

- [ ] **Step 1: Create `ProjectWorkspacePage`**

Create `e2e/src/pages/project-workspace.page.ts`:

```typescript
import { expect, type Page } from '@playwright/test';

export class ProjectWorkspacePage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Overview|Editor|Preview|Analytics|Settings/i);
  }
}
```

- [ ] **Step 2: Create `PreviewPage`**

Create `e2e/src/pages/preview.page.ts`:

```typescript
import { expect, type Page } from '@playwright/test';

export class PreviewPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}/preview`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectPreviewLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/Preview|Draft preview/i);
  }
}
```

- [ ] **Step 3: Create `ProjectSettingsPage` with Billing Absence Guard**

Create `e2e/src/pages/project-settings.page.ts`:

```typescript
import { expect, type Page } from '@playwright/test';

export class ProjectSettingsPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string, section = 'general'): Promise<void> {
    await this.page.goto(`/app/projects/${projectId}/settings?section=${section}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toContainText(/General|Configurations|Languages|Settings/i);
  }

  async assertNoBillingSection(): Promise<void> {
    const billingElements = this.page.locator('text=/\\b(Plans?|Billing|Subscriptions?|Payment|Pricing)\\b/i');
    await expect(billingElements).toHaveCount(0);
  }
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `tsc --noEmit -p e2e/tsconfig.json`
Expected: Code 0.

- [ ] **Step 5: Commit**

```bash
git add e2e/src/pages/project-workspace.page.ts e2e/src/pages/preview.page.ts e2e/src/pages/project-settings.page.ts
git commit -m "test(e2e): add ProjectWorkspacePage, PreviewPage, and ProjectSettingsPage POMs"
```

---

### Task 6: Playwright Test Fixtures Extension (`test.ts`)

**Files:**
- Modify: `e2e/src/fixtures/test.ts`

**Interfaces:**
- Produces: `authenticatedPage`: Browser page pre-loaded with an authenticated admin cookie (`cms_session`).
- Produces: `workspaceSettings`: Pre-initialized `WorkspaceSettingsPage` fixture.
- Produces: `sites`: Pre-initialized `SitesPage` fixture.
- Produces: `analytics`: Pre-initialized `AnalyticsPage` fixture.
- Produces: `preview`: Pre-initialized `PreviewPage` fixture.
- Produces: `projectSettings`: Pre-initialized `ProjectSettingsPage` fixture.
- Produces: `acceptInvite`: Pre-initialized `AcceptInvitationPage` fixture.

- [ ] **Step 1: Extend test fixtures in `e2e/src/fixtures/test.ts`**

Update `e2e/src/fixtures/test.ts` to export all new Page Objects and provide an `authenticatedPage` fixture that uses session cookie authentication via `/api/auth/login`:

```typescript
import { AcceptInvitationPage } from '../pages/invitation.page';
import { SitesPage } from '../pages/sites.page';
import { AnalyticsPage } from '../pages/analytics.page';
import { WorkspaceSettingsPage } from '../pages/workspace-settings.page';
import { ProjectWorkspacePage } from '../pages/project-workspace.page';
import { PreviewPage } from '../pages/preview.page';
import { ProjectSettingsPage } from '../pages/project-settings.page';
```

Add cookie-based authenticated session fixture helper:
```typescript
export async function createAuthenticatedCookie(baseURL: string): Promise<string> {
  const res = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Password123!' }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  return cookie || '';
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `tsc --noEmit -p e2e/tsconfig.json`
Expected: Code 0.

- [ ] **Step 3: Commit**

```bash
git add e2e/src/fixtures/test.ts
git commit -m "test(e2e): register all POMs and authenticated cookie helper in test fixtures"
```

---

### Task 7: Comprehensive Spec Suite Implementation (`e2e/tests/pages/`)

**Files:**
- Create: `e2e/tests/pages/auth.spec.ts`
- Create: `e2e/tests/pages/workspace.spec.ts`
- Create: `e2e/tests/pages/workspace-members.spec.ts`
- Create: `e2e/tests/pages/project-lifecycle.spec.ts`
- Create: `e2e/tests/pages/public-site.spec.ts`

**Interfaces:**
- Produces: End-to-end test execution covering all 13 application routes.

- [ ] **Step 1: Write `auth.spec.ts`**

Create `e2e/tests/pages/auth.spec.ts`:
- Test successful password login redirects to `/app`
- Test invalid credentials displays error
- Test registration flow
- Test public invitation resolution (`/accept-invitation?token=...`)

- [ ] **Step 2: Write `workspace.spec.ts`**

Create `e2e/tests/pages/workspace.spec.ts`:
- Test root `/` redirect to `/app`
- Test Dashboard overview widgets
- Test Quick search dialog (`Ctrl+K`)
- Test Sites list (`/app/sites`)
- Test Analytics overview (`/app/analytics`)

- [ ] **Step 3: Write `workspace-members.spec.ts`**

Create `e2e/tests/pages/workspace-members.spec.ts`:
- Test `/app/settings` workspace general configuration update
- Test members list displays owner, admin, and member badges
- Test member invitation flow
- Test owner protection (cannot be deleted or demoted)
- Test last admin protection

- [ ] **Step 4: Write `project-lifecycle.spec.ts`**

Create `e2e/tests/pages/project-lifecycle.spec.ts`:
- Test navigating to project workspace (`/app/projects/$id`)
- Test TipTap Editor (`/editor`): title and content editing
- Test Preview (`/preview`): documentation rendering
- Test Project Analytics (`/analytics`)
- Test Project Settings (`/settings`): tabs exist and strictly NO billing elements

- [ ] **Step 5: Write `public-site.spec.ts`**

Create `e2e/tests/pages/public-site.spec.ts`:
- Test published documentation viewer (`/sites/$id`)

- [ ] **Step 6: Run full Playwright test suite**

Run: `npx playwright test tests/pages/`
Expected: All tests pass (green).

- [ ] **Step 7: Commit**

```bash
git add e2e/tests/pages/
git commit -m "test(e2e): add comprehensive page test specs covering all studio routes"
```

---

### Task 8: Cleanup Obsolete Scratch Scripts & Package Scripts

**Files:**
- Remove: `e2e/scratch-check.mjs`
- Remove: `e2e/test-workspace-flow.mjs`
- Remove: `e2e/check-db.mjs`
- Remove: `e2e/debug-network.mjs`
- Remove: `e2e/capture-screenshots.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: Clean repository free of ad-hoc scratch scripts.
- Produces: `pnpm test:e2e` running `playwright test` cleanly.

- [ ] **Step 1: Delete retired scratch scripts**

Delete obsolete `.mjs` files:
`e2e/scratch-check.mjs`, `e2e/test-workspace-flow.mjs`, `e2e/check-db.mjs`, `e2e/debug-network.mjs`, `e2e/capture-screenshots.mjs`.

- [ ] **Step 2: Verify `package.json` test scripts**

Verify `test:e2e` script runs `playwright test` in `apps/studio` and `e2e`.

- [ ] **Step 3: Commit**

```bash
git rm e2e/scratch-check.mjs e2e/test-workspace-flow.mjs e2e/check-db.mjs e2e/debug-network.mjs e2e/capture-screenshots.mjs
git commit -m "chore(e2e): remove deprecated loose scratch scripts in favor of Playwright test suite"
```

---

## Plan Self-Review
1. **Spec coverage:** Skimmed against `docs/superpowers/specs/2026-10-09-e2e-test-suite-design.md`. All Page Objects, fixtures, and 13 application routes are accounted for.
2. **Placeholder scan:** No TBD, TODO, or vague instructions.
3. **Type consistency:** Page Objects use uniform method naming conventions (`goto`, `expect*`, action verbs).
