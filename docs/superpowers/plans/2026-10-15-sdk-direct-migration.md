# Direct @cms/sdk & @cms/sdk/react Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the intermediate `apps/studio/src/shared/hooks/api` shim layer by promoting UI response shapes to `@cms/sdk`, providing canonical UI models as default generic types in `@cms/sdk/react`, and migrating all 75+ call sites across Studio to consume `@cms/sdk/react` directly.

**Architecture:** Move all UI API response types from Studio into `@cms/sdk/src/types/ui.ts`. Update `@cms/sdk/react` query hooks to default to these types (`useProjects<T = Project>`), eliminating generic boilerplate. Move hook test suites into `@cms/sdk/react/__tests__/`. Systematically update Studio features, pages, components, and tests to import from `@cms/sdk/react` and `@cms/sdk`, then delete `apps/studio/src/shared/hooks/api/`.

**Tech Stack:** TypeScript, React 19, `@tanstack/react-query` v5, `@cms/sdk`, Bun, Vitest, Biome.

## Global Constraints

- Exclusively internal platform deployment; no plan, billing, or pricing code.
- No raw API route strings leaked in Studio.
- Exact type definitions preserved from `apps/studio/src/shared/hooks/api/types.ts`.
- All TypeScript compilation (`bun run typecheck`) and Vitest suites (`bun test`) must pass cleanly after each task.

---

### Task 1: Promote UI Types & Workspace Dependencies to `@cms/sdk`

**Files:**
- Modify: `packages/sdk/package.json`
- Create: `packages/sdk/src/types/ui.ts`
- Modify: `packages/sdk/src/types/index.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Consumes: `@cms/validators` (`LanguageConfig`, `PageConfig`, `ProjectConfig`, `AnalyticsRange`), `@cms/shared` (`AddonGroup`, `AddonId`, `ResolvedTheme`, `ThemeConfigChange`, `ThemeTemplateV1`), generated SDK types.
- Produces: Exported UI models from `@cms/sdk` (`Project`, `Language`, `PageNode`, `Page`, `Branch`, `Deployment`, `PendingChange`, `ApiKey`, `Domain`, `WorkspaceSettings`, `ProjectAddon`, `Comment`, `NotificationItem`, `NotificationList`, `SiteShell`, `SitePage`, `ReaderAccessData`, `GitWorkflowStatus`, etc.).

- [ ] **Step 1: Add workspace dependencies to `packages/sdk/package.json`**

In `packages/sdk/package.json`, update `dependencies`:
```json
  "dependencies": {
    "@cms/shared": "workspace:*",
    "@cms/validators": "workspace:*",
    "ky": "^2.1.0"
  },
```

- [ ] **Step 2: Create `packages/sdk/src/types/ui.ts`**

Copy the complete UI response types from `apps/studio/src/shared/hooks/api/types.ts` into `packages/sdk/src/types/ui.ts`, updating imports:
```typescript
import type { AddonGroup, AddonId } from '@cms/shared/addons';
import type { ResolvedTheme, ThemeConfigChange, ThemeTemplateV1 } from '@cms/shared/themes';
import type { LanguageConfig, PageConfig, ProjectConfig } from '@cms/validators';

export type { AnalyticsRange, LanguageConfig, PageConfig, ProjectConfig } from '@cms/validators';

type PublishedLanguageConfig = LanguageConfig & { name?: string; description?: string };

export interface Language {
  id: string;
  projectId: string;
  code: string;
  config?: LanguageConfig | null;
  translation?: { id: string; projectId: string; languageId: string; name: string | null; description: string | null } | null;
  label: string;
  direction: 'LTR' | 'RTL';
  isDefault: boolean;
  enabled?: boolean;
  position: number;
  coverage?: {
    pageCount: number;
    sourcePageCount: number;
    matchedPages: number;
    missingPages: number;
    extraPages: number;
    percentage: number | null;
  };
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  isPublic?: boolean;
  is_public?: boolean;
  config: ProjectConfig | null;
  languages?: Language[];
  createdAt: string;
  updatedAt: string;
  _count?: { pages: number; deployments: number; domains?: number };
}

export interface ApiKey {
  id: string;
  name: string;
  lastFour: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  legacy: boolean;
  state: 'active' | 'expired' | 'revoked' | 'rotation_required';
}

export interface ApiKeySecret extends ApiKey {
  secret: string;
}

export interface OpenApiConfiguration {
  title: string;
  path: string;
  contentHash: string;
  updatedAt: string;
  source: { type: 'upload' } | { type: 'url'; url: string } | { type: 'repository'; path: string };
}

export interface PublishedOpenApi {
  title: string;
  path: string;
  contentHash: string;
  updatedAt: string;
}

export type PageKind = 'PAGE' | 'GROUP';

export interface PageNode {
  id: string;
  parentId: string | null;
  languageId: string;
  kind: PageKind;
  title: string;
  slug: string;
  path: string;
  icon: string | null;
  description: string | null;
  config?: PageConfig | null;
  translationKey?: string | null;
  position: number;
  hidden: boolean;
  updatedAt: string;
}

export interface Page extends PageNode {
  content: string;
  projectId: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentStatus = 'PENDING' | 'BUILDING' | 'READY' | 'FAILED';

export interface DeploymentIssue {
  type: 'broken-link' | 'grammar';
  pageTitle: string;
  pagePath: string;
  detail: string;
}

export interface Deployment {
  id: string;
  version: number;
  status: DeploymentStatus;
  pagesCount: number;
  commitMessage: string | null;
  error: string | null;
  errorDetails?: DeploymentIssue[] | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DeploymentDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface PendingChange {
  id: string;
  title: string;
  path: string;
  languageCode: string;
  kind: 'PAGE' | 'GROUP';
  status: 'added' | 'modified' | 'removed';
  fields: string[];
  additions: number;
  deletions: number;
  lines: DeploymentDiffLine[];
  truncated: boolean;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: number;
}

export interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  isPrimary: boolean;
  dnsStatus: 'PENDING' | 'VERIFIED' | 'ERROR';
  sslStatus: 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'ERROR';
  verificationToken: string;
  createdAt: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  records?: DnsRecord[];
}

export interface Asset {
  id: string;
  key: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface WorkspaceSettings {
  notifications: Record<string, boolean>;
  integrations: Record<string, unknown>;
  git: Record<string, unknown>;
  name: string;
  slug: string | null;
  projectCount: number;
  memberCount: number;
  [key: string]: unknown;
}

export interface ProjectAddon {
  id: AddonId;
  group: AddonGroup;
  enabled: boolean;
  config: Record<string, unknown>;
  revision: number;
  updatedAt: string | null;
  status: 'active' | 'inactive' | 'needs_configuration';
}

export interface CommentAnchor {
  quote: string;
  from?: number;
  to?: number;
}

export interface Comment {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  anchor?: CommentAnchor | null;
  user: { id: string; name: string; image: string | null };
}

export interface ChangelogEntry {
  version: number;
  date: string | null;
  title: string;
  pages: number;
}

export interface NotificationItem {
  id: string;
  projectId: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NavNode {
  id: string;
  kind: PageKind;
  title: string;
  path: string;
  icon: string | null;
  tag: string | null;
  children: NavNode[];
}

export interface SiteShell {
  project: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    config: ProjectConfig | null;
    primaryDomain: string | null;
  };
  nav: NavNode[];
  languages: Array<{ code: string; label: string; direction: 'LTR' | 'RTL'; isDefault: boolean; enabled?: boolean }>;
  versions: Array<{ id: string; name: string; slug: string; isDefault: boolean }>;
  activeLanguage: string;
  activeVersion: string;
  languageConfig: PublishedLanguageConfig | null;
  version: number;
  generatedAt: string;
  openapi?: PublishedOpenApi | null;
}

export interface SiteHeading {
  depth: number;
  text: string;
  id: string;
}

export interface SitePage {
  project: SiteShell['project'];
  page: {
    id: string;
    createdAt: string;
    updatedAt: string;
    title: string;
    description: string | null;
    excerpt: string;
    icon: string | null;
    path: string;
    content: string;
    headings: SiteHeading[];
    config: PageConfig | null;
  };
  activeLanguage: string;
  activeVersion: string;
  versions: SiteShell['versions'];
  languageConfig: PublishedLanguageConfig | null;
  languages: Array<{ code: string; isDefault: boolean; path: string | null }>;
  breadcrumbs: Array<{ title: string; path: string }>;
  prev: { title: string; path: string } | null;
  next: { title: string; path: string } | null;
}

export interface SearchCitation {
  id: string;
  pageId: string;
  title: string;
  path: string;
  heading?: string;
  snippet: string;
  direction: 'ltr' | 'rtl';
}

export interface SiteSearchHit {
  id: string;
  title: string;
  path: string;
  description: string;
  icon?: string;
  snippet: string;
  score: number;
  language: string;
}

export interface SearchAnswer {
  status: 'answered' | 'no_answer';
  answer: string;
  confidence: number;
  citations: SearchCitation[];
  model?: string;
  cacheHit: boolean;
  quotaRemaining: number;
}

export interface ProjectThemeImportResult {
  applied: boolean;
  mode: 'merge' | 'replace';
  migratedFrom?: 0;
  changes: ThemeConfigChange[];
  theme: ResolvedTheme;
  template: ThemeTemplateV1;
  publishedChangesPending: boolean;
}

export interface ContentImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  assetsImported?: number;
  assetsSkipped?: number;
  warnings: string[];
}

export interface RedirectIssue {
  code: string;
  rowIndexes: number[];
  sequence: string[];
  message: string;
}

export interface PendingChangesResponse {
  changes: PendingChange[];
  hasBaseline?: boolean;
  lastVersion?: number;
  redirectIssues?: RedirectIssue[];
}

export interface ReaderAccessData {
  accessMode: 'PUBLIC' | 'WORKSPACE' | 'READERS';
  readers: Array<{
    id: string;
    email: string | null;
    name: string | null;
    status: string;
    audiences: Array<{ audience: { id: string; name: string } }>;
    _count: { sessions: number };
  }>;
  audiences: Array<{
    id: string;
    name: string;
    grants: Array<{ pageId: string | null }>;
    _count: { readers: number };
  }>;
  jwt: {
    enabled: boolean;
    issuer: string;
    audience: string;
    jwksUrl: string | null;
    publicJwks: unknown;
    groupsClaim: string;
    claimMapping: unknown;
    sessionTtlMinutes: number;
    maxTokenAgeSeconds: number;
    clockToleranceSecs: number;
  } | null;
  audit: Array<{ id: string; action: string; createdAt: string }>;
}

export interface GitConflict {
  id: string;
  path: string;
  status: string;
  baseContent: string | null;
  oursContent: string | null;
  theirsContent: string | null;
}

export interface GitOperation {
  id: string;
  kind: string;
  status: string;
  commitMessage: string | null;
  changedFiles: Array<{ path: string; status: string }> | null;
  pullRequestNo: number | null;
  pullRequestUrl: string | null;
  error: string | null;
  createdAt: string;
  conflicts: GitConflict[];
}

export interface GitWorkflowStatus {
  id: string;
  repository: string;
  baseBranch: string;
  headBranch: string;
  contentPath: string;
  credentialConfigured: boolean;
  webhookConfigured: boolean;
  lastSyncStatus: string;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  operations: GitOperation[];
  pullRequests: Array<{
    id: string;
    number: number;
    url: string;
    title: string;
    draft: boolean;
    state: string;
    previews: Array<{ id: string; status: string; url: string | null; error: string | null }>;
  }>;
  files: Array<{ path: string }>;
}
```

- [ ] **Step 3: Export UI types in `packages/sdk/src/types/index.ts`**

In `packages/sdk/src/types/index.ts`, append:
```typescript
export * from './ui';
```

- [ ] **Step 4: Verify typecheck passes in `@cms/sdk`**

Run: `bun --filter @cms/sdk run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/
git commit -m "feat(sdk): export canonical UI-facing response types from @cms/sdk"
```

---

### Task 2: Default Canonical UI Types & Query Keys in `@cms/sdk/react`

**Files:**
- Modify: `packages/sdk/src/react/query-keys.ts`
- Modify: `packages/sdk/src/react/index.ts`
- Modify: `packages/sdk/src/react/hooks/projects.ts`
- Modify: `packages/sdk/src/react/hooks/pages.ts`
- Modify: `packages/sdk/src/react/hooks/deployments.ts`
- Modify: `packages/sdk/src/react/hooks/settings.ts`
- Modify: `packages/sdk/src/react/hooks/site.ts`
- Modify: `packages/sdk/src/react/hooks/git-workflow.ts`
- Modify: `packages/sdk/src/react/hooks/integrations.ts`

**Interfaces:**
- Consumes: UI types from `../../types/ui`, resource clients from `../../client`.
- Produces: Fully typed React Query hooks defaulting to canonical models (`useProjects<T = Project>`, `usePages<T = PageNode>`, etc.), exported `queryKeys` and `analyticsQueryKeys`.

- [ ] **Step 1: Export `analyticsQueryKeys` in query-keys and root react index**

In `packages/sdk/src/react/hooks/analytics.ts`: verify `analyticsQueryKeys` export.
In `packages/sdk/src/react/query-keys.ts`, re-export:
```typescript
export { analyticsQueryKeys } from './hooks/analytics';
```
In `packages/sdk/src/react/index.ts`, verify `export * from './query-keys';` exposes `analyticsQueryKeys`.

- [ ] **Step 2: Update `packages/sdk/src/react/hooks/projects.ts` defaults**

Import `Project`, `ProjectMembersResponse` from `../../types`:
```typescript
import type { Project, ProjectMembersResponse } from '../../types';

export const useProjects = <T = Project>(options?: { enabled?: boolean }) => { ... }
export const useProject = <T = Project>(projectId: string | undefined, options?: { enabled?: boolean }) => { ... }
export const useProjectMembers = <T = ProjectMembersResponse>(projectId: string | undefined, options?: { enabled?: boolean }) => { ... }
```

- [ ] **Step 3: Update `packages/sdk/src/react/hooks/pages.ts` defaults**

Import `PageNode`, `Page`, `Branch`, `Language`, `Comment` from `../../types`:
```typescript
import type { Branch, Comment, Language, Page, PageNode } from '../../types';

export const usePages = <T = PageNode>(projectId: string | undefined, languageId?: string, branchId?: string) => { ... }
export const usePage = <T = Page>(projectId: string | undefined, pageId: string | undefined) => { ... }
export const useBranches = <T = Branch>(projectId: string | undefined) => { ... }
export const useLanguages = <T = Language>(projectId: string | undefined) => { ... }
export const useComments = <T = Comment>(projectId: string | undefined, pageId?: string) => { ... }
```

- [ ] **Step 4: Update `packages/sdk/src/react/hooks/deployments.ts` defaults**

Import `Deployment`, `PendingChangesResponse` from `../../types`:
```typescript
import type { Deployment, PendingChangesResponse } from '../../types';

export const useDeployments = <T = Deployment>(projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) => { ... }
export const usePendingChanges = <T = PendingChangesResponse>(projectId: string | undefined, options?: { enabled?: boolean }) => { ... }
```

- [ ] **Step 5: Update `packages/sdk/src/react/hooks/settings.ts` defaults**

Import `ApiKey`, `Domain`, `NotificationList`, `OpenApiConfiguration`, `ProjectAddon`, `WorkspaceMembersResponse`, `WorkspaceSettings` from `../../types`:
```typescript
import type {
  ApiKey,
  Domain,
  NotificationList,
  OpenApiConfiguration,
  ProjectAddon,
  WorkspaceMembersResponse,
  WorkspaceSettings,
} from '../../types';

export const useDomains = <T = Domain>(projectId: string | undefined) => { ... }
export const useApiKeys = <T = ApiKey>(projectId: string | undefined) => { ... }
export const useOpenApiConfiguration = <T = OpenApiConfiguration>(projectId: string | undefined) => { ... }
export const useProjectAddons = <T = ProjectAddon>(projectId: string) => { ... }
export const useWorkspaceSettings = <T = WorkspaceSettings>(projectId?: string) => { ... }
export const useMembers = <T = WorkspaceMembersResponse>() => { ... }
export const useNotifications = <T = NotificationList>(options?: { enabled?: boolean }) => { ... }
```

- [ ] **Step 6: Update `site.ts`, `git-workflow.ts`, `integrations.ts` defaults**

In `packages/sdk/src/react/hooks/site.ts`:
```typescript
import type { ReaderAccessData } from '../../types';
export const useReaderAccess = <T = ReaderAccessData>(projectId: string | undefined) => { ... }
```
In `packages/sdk/src/react/hooks/git-workflow.ts`:
```typescript
import type { GitWorkflowStatus } from '../../types';
export const useGitWorkflow = <T = GitWorkflowStatus | null>(projectId: string) => { ... }
```
In `packages/sdk/src/react/hooks/integrations.ts`:
```typescript
import type { IntegrationCatalogEntry } from '@cms/shared/integrations';
export const useProjectIntegrations = <T = IntegrationCatalogEntry>(projectId: string) => { ... }
```

- [ ] **Step 7: Verify typecheck in `@cms/sdk`**

Run: `bun --filter @cms/sdk run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/react/
git commit -m "feat(sdk): provide canonical UI default generic types for @cms/sdk/react query hooks"
```

---

### Task 3: Relocate Hook Unit Tests to `@cms/sdk/react/__tests__`

**Files:**
- Create: `packages/sdk/src/react/__tests__/integrations.test.tsx`
- Create: `packages/sdk/src/react/__tests__/mutations.addons.test.tsx`
- Create: `packages/sdk/src/react/__tests__/optimistic-reorder.test.tsx`
- Delete: `apps/studio/src/shared/hooks/api/integrations.test.ts`
- Delete: `apps/studio/src/shared/hooks/api/mutations.addons.test.ts`
- Delete: `apps/studio/src/shared/hooks/api/optimistic-reorder.test.ts`

**Interfaces:**
- Consumes: `@cms/sdk/react` hooks, `CmsClientProvider`, `CmsClient`.
- Produces: Self-contained Vitest suite for `@cms/sdk`.

- [ ] **Step 1: Move & adapt `integrations.test.ts` to `packages/sdk/src/react/__tests__/integrations.test.tsx`**

Update imports to resolve local `../mutations`, `../query-keys`, and construct a mock `CmsClient` for `CmsClientProvider`.

- [ ] **Step 2: Move & adapt `mutations.addons.test.ts` to `packages/sdk/src/react/__tests__/mutations.addons.test.tsx`**

Update imports to resolve local `../mutations` and `../query-keys`.

- [ ] **Step 3: Move & adapt `optimistic-reorder.test.ts` to `packages/sdk/src/react/__tests__/optimistic-reorder.test.tsx`**

Update imports to resolve local `../mutations` and `../query-keys`.

- [ ] **Step 4: Run SDK unit tests**

Run: `bun --filter @cms/sdk test`
Expected: All tests pass.

- [ ] **Step 5: Remove old test files from Studio**

```bash
rm apps/studio/src/shared/hooks/api/integrations.test.ts
rm apps/studio/src/shared/hooks/api/mutations.addons.test.ts
rm apps/studio/src/shared/hooks/api/optimistic-reorder.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/react/__tests__/ apps/studio/src/shared/hooks/api/
git commit -m "test(sdk): relocate hook unit tests into @cms/sdk/react"
```

---

### Task 4: Migrate Studio Core Features & Auth to Direct SDK Imports

**Files:**
- Modify: `apps/studio/src/routes/(auth)/route.tsx`
- Modify: `apps/studio/src/features/auth/SignInPage.tsx`, `SignUpPage.tsx`
- Modify: `apps/studio/src/features/onboarding/OnboardingWizard.tsx`
- Modify: `apps/studio/src/features/analytics/ProjectAnalyticsPage.tsx`, `WorkspaceAnalyticsPage.tsx`, `components/RangeTabs.tsx`, `components/ViewsAreaChart.tsx`
- Modify: `apps/studio/src/features/workspace/WorkspaceMembersPage.tsx`, `components/SiteSwitcher.tsx`, `components/NotificationsPopover.tsx`, `components/CommandPalette.tsx`
- Modify: `apps/studio/src/features/publishing/components/PublishModal.tsx`, `PublishControl.tsx`, `DeployPipeline.tsx`
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`, `components/comments-panel.tsx`, `branch-switcher.tsx`, `sortable-page-tree.tsx`, `site-config-panel.tsx`, `language-settings-dialog.tsx`, `page-settings-dialog.tsx`, `add-language-dialog.tsx`
- Modify: `apps/studio/src/features/projects/ProjectsOverviewPage.tsx`, `ProjectPreviewPage.tsx`, `ProjectOverviewPage.tsx`, `components/ProjectLayout.tsx`, `components/ProjectAccessBoundary.tsx`, `components/NewProjectDialog.tsx`, `context/active-project-context.tsx`

**Interfaces:**
- Consumes: `@cms/sdk/react` (`useProjects`, `usePage`, `usePublish`, `queryKeys`, etc.), `@cms/sdk` (`Project`, `PageNode`, `CmsApiError`, etc.).
- Produces: Direct SDK integration with zero `@/hooks/api` imports in these modules.

- [ ] **Step 1: Migrate `routes/(auth)` and `features/auth`**
Replace:
```typescript
// From
import { useSetupStatus } from '@/hooks/api';
// To
import { useSetupStatus } from '@cms/sdk/react';
```

- [ ] **Step 2: Migrate `features/analytics`**
Replace:
```typescript
// From
import { useProjectAnalytics, useWorkspaceAnalytics } from '@/hooks/api/analytics';
import type { AnalyticsRange } from '@/hooks/api';
// To
import { useProjectAnalytics, useWorkspaceAnalytics } from '@cms/sdk/react';
import type { AnalyticsRange } from '@cms/sdk';
```

- [ ] **Step 3: Migrate `features/workspace`**
Replace `@/hooks/api` and `@/hooks/api/types` with `@cms/sdk/react` and `@cms/sdk`.
In `NotificationsPopover.tsx`:
```typescript
import { useMarkNotificationsRead, useNotifications, useUnreadNotificationCount } from '@cms/sdk/react';
import type { NotificationItem } from '@cms/sdk';
```

- [ ] **Step 4: Migrate `features/publishing`**
In `PublishModal.tsx`, `PublishControl.tsx`, `DeployPipeline.tsx`:
```typescript
import { useDeployments, usePendingChanges, usePublish, useRollback } from '@cms/sdk/react';
import type { Deployment, DeploymentStatus, PendingChange, Project } from '@cms/sdk';
```

- [ ] **Step 5: Migrate `features/editor`**
Replace `@/hooks/api` imports with `@cms/sdk/react` and `@cms/sdk`.
In `sortable-page-tree.tsx`, `comments-panel.tsx`, `branch-switcher.tsx`:
```typescript
import { queryKeys, useBranches, useComments, useLanguages, usePages, useReorderPages } from '@cms/sdk/react';
import type { Branch, Comment, Language, PageNode } from '@cms/sdk';
```

- [ ] **Step 6: Migrate `features/projects`**
In `ProjectAccessBoundary.tsx`:
```typescript
import { useProject } from '@cms/sdk/react';
import { CmsApiError } from '@cms/sdk';
```
In `ProjectOverviewPage.tsx`, `ProjectPreviewPage.tsx`, `ProjectsOverviewPage.tsx`:
```typescript
import { useDeployments, useDomains, usePages, useProject, useProjectMembers, useProjects, usePublishAnyway, useWorkspaceAnalytics } from '@cms/sdk/react';
import type { AnalyticsRange, Deployment, PageNode, Project } from '@cms/sdk';
```

- [ ] **Step 7: Verify typecheck in Studio for migrated files**

Run: `bun --filter @cms/studio run typecheck`
Expected: Only remaining errors (if any) are in `project-settings` and tests.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/routes/ apps/studio/src/features/auth/ apps/studio/src/features/analytics/ apps/studio/src/features/workspace/ apps/studio/src/features/publishing/ apps/studio/src/features/editor/ apps/studio/src/features/projects/ apps/studio/src/features/onboarding/
git commit -m "refactor(studio): migrate core features to direct @cms/sdk and @cms/sdk/react imports"
```

---

### Task 5: Migrate Project Settings & Workspace Settings to Direct SDK Imports

**Files:**
- Modify: `apps/studio/src/features/project-settings/ProjectSettingsPage.tsx`
- Modify: `apps/studio/src/features/project-settings/WorkspaceSettingsPage.tsx`
- Modify: `apps/studio/src/features/project-settings/components/*.tsx` (all 31 settings components)

**Interfaces:**
- Consumes: `@cms/sdk/react` hooks and `queryKeys`, `@cms/sdk` types and `CmsApiError`.
- Produces: Direct SDK consumption across all project settings and workspace tabs.

- [ ] **Step 1: Migrate `ProjectSettingsPage.tsx` and `WorkspaceSettingsPage.tsx`**

Replace:
```typescript
import type { Project } from '@cms/sdk';
import { useMembers, useProject } from '@cms/sdk/react';
```

- [ ] **Step 2: Migrate workspace settings tabs**
- `workspace-general-tab.tsx`: `useUpdateWorkspaceSettings, useWorkspaceSettings` from `@cms/sdk/react`.
- `workspace-members-tab.tsx`: `useInviteMember, useMembers, useRemoveMember, useUpdateMemberRole` from `@cms/sdk/react`.
- `workspace-danger-tab.tsx`: `useDeleteWorkspace, useMembers, useTransferWorkspaceOwnership, useWorkspaceSettings` from `@cms/sdk/react`.

- [ ] **Step 3: Migrate project settings sections (General, Languages, Domains, Git, OpenAPI, Integrations, etc.)**
- In `addons-section.tsx`: `useActivateProjectAddon, useDeactivateProjectAddon, useProjectAddons, useUpdateProjectAddon` from `@cms/sdk/react`; `type Project, type ProjectAddon` from `@cms/sdk`.
- In `api-keys-tab.tsx`: `useApiKeys, useCreateApiKey, useRevokeApiKey, useRotateApiKey` from `@cms/sdk/react`; `type ApiKey, type ApiKeySecret, type Project` from `@cms/sdk`.
- In `domain-section.tsx`: `useAddDomain, useDeleteDomain, useDomains, useSetPrimaryDomain, useVerifyDomain` from `@cms/sdk/react`; `type Domain, type Project` from `@cms/sdk`.
- In `git-tab.tsx` & `git-workflow.tsx`: `useGitWorkflow, useAuthorizeGitWorkflow, useConnectGitWorkflow, useDisconnectGitWorkflow, useQueueGitOperation, useResolveGitConflict, useRotateGitWorkflowWebhookSecret` from `@cms/sdk/react`; `type GitWorkflowStatus, type Project` from `@cms/sdk`.
- In `import-tab.tsx`: `useImportFromGhost, useImportFromGit, useImportFromMintlify` from `@cms/sdk/react`; replace `ApiResponseError` with `CmsApiError` from `@cms/sdk`.
- In `integrations-tab.tsx`: `useActivateProjectIntegration, useCreateProjectIntegration, useDeactivateProjectIntegration, useDeleteProjectIntegration, useProjectIntegrations, useUpdateProjectIntegration, useVerifyProjectIntegration` from `@cms/sdk/react`.
- In `languages-section.tsx`: `useCreateLanguage, useDeleteLanguage, useLanguages, useUpdateLanguage` from `@cms/sdk/react`; `type Language, type Project` from `@cms/sdk`.
- In `members-section.tsx`: `useCancelProjectInvitation, useInviteProjectMember, useProjectMembers, useRemoveProjectMember, useTransferProjectOwnership, useUpdateProjectMemberRole` from `@cms/sdk/react`.
- In `notifications-tab.tsx`: `useUpdateWorkspaceSettings, useWorkspaceSettings` from `@cms/sdk/react`.
- In `openapi-section.tsx`: `useDeleteOpenApi, useOpenApiConfiguration, useSyncOpenApi, useUpsertOpenApi` from `@cms/sdk/react`; `type OpenApiConfiguration, type Project` from `@cms/sdk`.
- In `search-section.tsx` & `search-index-diagnostics.tsx`: `useCreateProjectSearchReindex, useProjectSearchConfiguration, useProjectSearchIndexDiagnostics, useUpdateProjectSearchConfiguration` from `@cms/sdk/react`.
- In `seo-section.tsx`, `styling-section.tsx`, `theme-section.tsx`, `typography-section.tsx`, `variables-section.tsx`, `redirects-section.tsx`, `navbar-section.tsx`, `footer-section.tsx`, `danger-section.tsx`, `branding-section.tsx`, `banner-section.tsx`, `analytics-section.tsx`, `usage-tab.tsx`:
  Replace all `@/hooks/api` imports with `@cms/sdk/react` and `@cms/sdk`.

- [ ] **Step 4: Verify typecheck in Studio for settings**

Run: `bun --filter @cms/studio run typecheck`
Expected: 0 errors in `src/features/project-settings/`.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/
git commit -m "refactor(studio): migrate project and workspace settings to direct SDK imports"
```

---

### Task 6: Update Vitest Mocks & Studio Shared Utilities

**Files:**
- Modify: `apps/studio/src/shared/lib/deployment-status.ts`
- Modify: `apps/studio/src/shared/lib/deployment-status.test.ts`
- Modify: All `*.test.tsx` files in `apps/studio/src/` mocking `@/hooks/api`:
  - `apps/studio/src/features/workspace/components/CommandPalette.test.tsx`
  - `apps/studio/src/features/projects/components/ProjectAccessBoundary.test.tsx`
  - `apps/studio/src/features/project-settings/WorkspaceSettingsPage.test.tsx`
  - `apps/studio/src/features/project-settings/components/workspace-general-tab.test.tsx`
  - `apps/studio/src/features/project-settings/components/workspace-danger-tab.test.tsx`
  - `apps/studio/src/features/project-settings/components/theme-section.test.tsx`
  - `apps/studio/src/features/project-settings/components/members-section.test.tsx`
  - `apps/studio/src/features/project-settings/components/notifications-tab.test.tsx`
  - `apps/studio/src/features/project-settings/components/api-keys-tab.test.tsx`
  - `apps/studio/src/features/project-settings/components/addons-section.test.ts`
  - `apps/studio/src/features/editor/components/sortable-page-tree.test.tsx`
  - `apps/studio/src/features/editor/components/add-language-dialog.test.tsx`

**Interfaces:**
- Consumes: `@cms/sdk/react`, `@cms/sdk`.
- Produces: Passing Vitest test suite in Studio.

- [ ] **Step 1: Update `shared/lib/deployment-status.ts` and test**
Replace:
```typescript
import type { DeploymentStatus } from '@/hooks/api/types';
// With
import type { DeploymentStatus } from '@cms/sdk';
```

- [ ] **Step 2: Update `vi.mock('@/hooks/api', ...)` in all unit tests**
Change:
```typescript
vi.mock('@/hooks/api', () => ({ ... }));
// To
vi.mock('@cms/sdk/react', () => ({ ... }));
```
And change any `import type { Project } from '@/hooks/api'` to `import type { Project } from '@cms/sdk'`.

- [ ] **Step 3: Run Studio test suite**

Run: `bun --filter @cms/studio test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/
git commit -m "test(studio): update vitest mocks from @/hooks/api to @cms/sdk/react"
```

---

### Task 7: Delete Studio API Hooks Directory & Final Verification

**Files:**
- Delete: `apps/studio/src/shared/hooks/api/` (all files: `index.ts`, `queries.ts`, `mutations.ts`, `query-keys.ts`, `types.ts`, `client-helpers.ts`, `analytics/`)
- Delete: `apps/studio/src/shared/hooks/index.ts`
- Modify: `apps/studio/tsconfig.json`

**Interfaces:**
- Consumes: Cleaned workspace.
- Produces: Zero shim files, clean tsconfig paths.

- [ ] **Step 1: Verify zero occurrences of `@/hooks/api` remain**

Run: `git grep '@/hooks/api' apps/studio/src`
Expected: Only files in `apps/studio/src/shared/hooks/api/` itself (if not yet removed).

- [ ] **Step 2: Delete `apps/studio/src/shared/hooks/api` directory and `shared/hooks/index.ts`**

```bash
rm -rf apps/studio/src/shared/hooks/api
rm -f apps/studio/src/shared/hooks/index.ts
```

- [ ] **Step 3: Update `apps/studio/tsconfig.json`**

Remove `"@/hooks/*"` from `compilerOptions.paths`:
```json
{
  "extends": "@cms/tsconfig/react.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@cms/ui": ["../../packages/ui/dist/index.d.ts"]
    }
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist", ".output", ".nitro"]
}
```

- [ ] **Step 4: Full Workspace Verification**

Run the full verification suite:
1. `bun run typecheck`
   Expected: 0 errors across all packages and apps.
2. `bun --filter @cms/sdk test`
   Expected: All SDK tests pass.
3. `bun --filter @cms/studio test`
   Expected: All Studio tests pass.
4. `bun run check`
   Expected: Ultracite and Biome checks pass.

- [ ] **Step 5: Commit final changes**

```bash
git add apps/studio/
git commit -m "refactor(studio): remove shared/hooks/api shim layer and update tsconfig"
```
