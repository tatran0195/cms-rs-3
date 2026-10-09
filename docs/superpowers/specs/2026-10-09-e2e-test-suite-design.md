# E2E Test Suite Architecture & Best Practices Design

**Date**: 2026-10-09  
**Status**: Approved  
**Scope**: Complete end-to-end testing modernization across `@cms/studio` and published site interfaces.

---

## 1. Problem Statement & Motivation

During recent testing cycles, temporary standalone Node.js scripts (`scratch-check.mjs`, `test-workspace-flow.mjs`, `verify-endpoints.mjs`, etc.) were created to validate routes and backend endpoints. While functional for immediate verification, this approach exhibits several shortcomings:
1. **Lack of Type Safety & Reusability**: Selectors, API fetch requests, and credentials are hardcoded across separate `.mjs` files without shared abstractions.
2. **Brittle Navigation & Timing**: Standalone scripts rely on primitive polling or arbitrary timeouts instead of Playwright's automatic waiting, web-first assertions, and tracing.
3. **Inconsistent Test Coverage**: Route checks, auth flows, and CRUD operations are fragmented rather than organized by domain.
4. **Maintenance Overhead**: Loose scripts at the repository root create noise and do not integrate into standard CI/test runners.

The goal of this design is to establish a unified, modular, production-grade Playwright E2E test suite in `e2e/` following modern best practices: Page Object Models (POM), custom Playwright fixtures with session caching, typed assertions, and clear domain separation.

---

## 2. Architectural Overview

### 2.1 Stack & Environment
- **Runner**: `@playwright/test`
- **Default Base URL**: `http://localhost:4310` (active Vite Studio dev server, which proxies `/api` requests to the Rust backend at `http://localhost:3000`). Overridable via `E2E_BASE_URL`.
- **Backend API**: `http://localhost:3000` (`cms-server`) backed by PostgreSQL.
- **Reporting**: List reporter + HTML report + automatic screenshot & trace on failure.

---

## 3. Page Object Models (`e2e/src/pages/`)

Each application surface is modeled as a strongly typed class that encapsulates selectors, user interactions, and assertions:

### 3.1 `SignInPage` (`e2e/src/pages/signin.page.ts`)
- **Route**: `/(auth)/sign-in`, `/(auth)/sign-up`
- **Responsibilities**:
  - Email + Password login (`signInWithPassword(email, password)`)
  - Email OTP / verification flow (`requestCode(email)`, `enterOtp(code)`)
  - New user registration (`signUp(name, email, password)`)
  - Error state verifications (`expectInvalidCredentials()`, `expectValidationError()`)
  - Session sign-out (`signOut()`)

### 3.2 `AcceptInvitationPage` (`e2e/src/pages/invitation.page.ts`)
- **Route**: `/accept-invitation?token={token}`
- **Responsibilities**:
  - Navigation with invite token
  - Verification of displayed workspace name, inviter name, and invitee email
  - Acceptance action and redirect to workspace

### 3.3 `DashboardPage` (`e2e/src/pages/dashboard.page.ts`)
- **Route**: `/app`
- **Responsibilities**:
  - Global navigation shell (Sidebar, breadcrumbs, user profile trigger)
  - Quick search trigger (Ctrl+K modal)
  - Workspace stats & recent projects summary
  - Direct links to project creation and site listings

### 3.4 `SitesPage` (`e2e/src/pages/sites.page.ts`)
- **Route**: `/app/sites`
- **Responsibilities**:
  - Listing all user documentation sites
  - Filter/search input
  - Opening "Create new site" modal and creating a project
  - Navigating to specific site dashboards

### 3.5 `AnalyticsPage` (`e2e/src/pages/analytics.page.ts`)
- **Route**: `/app/analytics`
- **Responsibilities**:
  - Cross-project traffic overview
  - Verification of metrics cards (total views, visitors, average duration)
  - Date range filters and timeseries chart visibility

### 3.6 `WorkspaceSettingsPage` (`e2e/src/pages/workspace-settings.page.ts`)
- **Route**: `/app/settings`
- **Responsibilities**:
  - Workspace settings editing (workspace name, description)
  - Members tab navigation
  - Listing existing members with roles (`owner`, `admin`, `member`)
  - Member invitation modal (input email, select role, submit)
  - Role management (promoting to admin, demoting to member)
  - Pending invitation revocation
  - Member deletion (with owner and last-admin protection verification)

### 3.7 `ProjectWorkspacePage` (`e2e/src/pages/project-workspace.page.ts`)
- **Route**: `/app/projects/$projectId`
- **Responsibilities**:
  - Project overview cards (pages count, published versions, deployments)
  - Navigation bar to Editor, Preview, Analytics, and Settings

### 3.8 `EditorPage` (`e2e/src/pages/editor.page.ts`)
- **Route**: `/app/projects/$projectId/editor`
- **Responsibilities**:
  - Page tree navigation and hierarchy
  - "New page" creation
  - Title editing and TipTap visual/markdown content editing
  - Save status indicators and auto-save persistence
  - Language selection

### 3.9 `PreviewPage` (`e2e/src/pages/preview.page.ts`)
- **Route**: `/app/projects/$projectId/preview`
- **Responsibilities**:
  - Real-time rendered documentation preview
  - Viewport switcher (Desktop, Tablet, Mobile)
  - Language switcher

### 3.10 `ProjectAnalyticsPage` (`e2e/src/pages/project-analytics.page.ts`)
- **Route**: `/app/projects/$projectId/analytics`
- **Responsibilities**:
  - Project-specific analytics (pageviews, visitor breakdown, top routes)

### 3.11 `ProjectSettingsPage` (`e2e/src/pages/project-settings.page.ts`)
- **Route**: `/app/projects/$projectId/settings`
- **Responsibilities**:
  - General settings (project name, slug, description)
  - Languages configuration
  - Custom domains and git integration tabs
  - Danger zone (delete project)
  - *Strict adherence to platform rules*: No billing, plan, or pricing sections.

### 3.12 `PublicSitePage` (`e2e/src/pages/site.page.ts`)
- **Route**: `/sites/$projectId`
- **Responsibilities**:
  - Reader view for published documentation
  - Sidebar table of contents
  - Search within published documentation
  - Language dropdown

---

## 4. Test Fixtures & Shared Setup (`e2e/src/fixtures/test.ts`)

To avoid performing slow UI logins before every individual test, the fixture architecture leverages pre-authenticated contexts:

1. **`session` / `authenticatedPage`**:
   - Authenticates once via API session creation (`POST /api/auth/login`) or storage state cookie injection (`cms_session`).
   - Injects the authenticated cookie directly into the browser context.
   - Saves 5–10 seconds per test case.
2. **`adminPage`**:
   - An authenticated browser context signed in with `admin@example.com` (platform admin).
3. **`testProject`**:
   - Ensures an active documentation project exists (creates one via API or UI if absent).
4. **`diagnostics`**:
   - Captures console errors, uncaught exceptions, and unhandled promise rejections.
   - Takes screenshots and traces on assertion failure.

---

## 5. Test Specifications (`e2e/tests/pages/`)

Tests are divided cleanly into cohesive test specs:

1. **`auth.spec.ts`**:
   - Password login with valid credentials -> redirects to `/app`
   - Invalid credentials -> shows error alert
   - Registration flow -> creates account and lands on dashboard
   - Accept invitation -> loads invite metadata and accepts
   - Logout -> clears session and redirects to `/sign-in`

2. **`workspace.spec.ts`**:
   - Root `/` redirects to `/app`
   - Sidebar navigation between Overview, Sites, Analytics, and Settings
   - Quick Search modal (`Ctrl+K` or search trigger button)
   - Cross-project Analytics page rendering

3. **`workspace-members.spec.ts`**:
   - `/app/settings` General workspace information update
   - Members list displays owner and members with proper badges
   - Invite member modal creates invitation
   - Role promotion (member -> admin) and demotion
   - Canceling pending invitation
   - Safety checks: owner cannot be removed or demoted; last admin cannot be removed

4. **`projects.spec.ts`**:
   - Site creation from `/app/sites`
   - Navigation into project workspace (`/app/projects/$id`)
   - TipTap Editor (`/editor`): create new page, type markdown, verify live update
   - Preview (`/preview`): rendered documentation and responsive switches
   - Project Analytics (`/analytics`)
   - Project Settings (`/settings`): tabs, configuration updates, strictly no billing

5. **`public-site.spec.ts`**:
   - Public viewer (`/sites/$id`): table of contents navigation, page content rendering, search

---

## 6. Deprecation & Cleanup

The following loose `.mjs` scripts at the root of `e2e/` will be cleanly retired:
- `e2e/scratch-check.mjs`
- `e2e/test-workspace-flow.mjs`
- `e2e/capture-screenshots.mjs`
- `e2e/check-db.mjs`
- `e2e/debug-network.mjs`

The official test command for local development and CI will be:
```bash
# In e2e directory:
npx playwright test

# Or from workspace root:
pnpm --filter @cms/e2e test
```
