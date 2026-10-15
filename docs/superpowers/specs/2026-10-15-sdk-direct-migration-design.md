# Design Spec: Direct @cms/sdk & @cms/sdk/react Migration in Studio

- **Date**: 2026-10-15
- **Topic**: Elimination of Studio's `shared/hooks/api` Shim Layer in Favor of Direct SDK Consumption
- **Status**: Draft (Awaiting User Review)

---

## 1. Executive Summary

Following the unification of frontend API services into `@cms/sdk`, `apps/studio` currently maintains an intermediate shim layer in `apps/studio/src/shared/hooks/api/`. This layer contains:
- `query-keys.ts`: An exact 84-line duplicate of `packages/sdk/src/react/query-keys.ts`.
- `mutations.ts`: A 99-line pure re-export of `@cms/sdk/react/mutations`.
- `queries.ts`: A 114-line wrapper file manually applying UI generic types (`<Project>`, `<PageNode>`, etc.) over `@cms/sdk/react/queries` because SDK hooks defaulted to `<T = any>`.
- `types.ts`: A 497-line file defining UI-facing response interfaces (`Project`, `Language`, `PageNode`, `Deployment`, `PendingChange`, `ApiKey`, etc.) that belong in the canonical SDK.
- `client-helpers.ts`: A backward-compatibility subclass `ApiResponseError` extending `CmsApiError`.

This specification details the plan to:
1. Promote all UI-facing API response interfaces into `@cms/sdk`.
2. Provide canonical UI models as default generic types across all `@cms/sdk/react` query hooks.
3. Export `analyticsQueryKeys` from `@cms/sdk/react`.
4. Migrate all 75+ call sites across `apps/studio` (components, pages, context, and tests) to import directly from `@cms/sdk/react` and `@cms/sdk`.
5. Relocate hook unit tests into `packages/sdk/src/react/__tests__/`.
6. Completely remove `apps/studio/src/shared/hooks/api/` and clean up legacy tsconfig aliases.

---

## 2. Architecture & Data Flow

```mermaid
graph TD
    subgraph "apps/studio (Direct SDK Consumer)"
        A[Feature Pages & Components]
        B[Vitest Unit & Component Tests]
    end

    subgraph "@cms/sdk/react"
        C[Query Hooks with Default Types: useProjects, usePages, etc.]
        D[Mutation Hooks: usePublish, useCreateProject, etc.]
        E[Query Key Factories: queryKeys, analyticsQueryKeys]
        F[CmsClientProvider & useCmsClient]
    end

    subgraph "@cms/sdk (Core & Types)"
        G[Canonical UI & Wire Types: Project, PageNode, Deployment, etc.]
        H[HttpClient: Ky, CmsApiError, isHTTPError]
        I[Resource Clients: client.projects, client.pages, etc.]
    end

    A -->|useQuery / useMutation| C
    A -->|useMutation| D
    A -->|queryKeys / analyticsQueryKeys| E
    A -->|CmsApiError / isHTTPError| H
    A -.->|import type { Project, PageNode }| G
    B -->|vi.mock @cms/sdk/react| C
    C --> G
    C --> I
```

---

## 3. Detailed Design

### 3.1 SDK Dependencies & UI Types (`packages/sdk`)

1. **Workspace Dependencies**:
   Update `packages/sdk/package.json` to include `@cms/shared` and `@cms/validators`:
   ```json
   {
     "dependencies": {
       "@cms/shared": "workspace:*",
       "@cms/validators": "workspace:*",
       "ky": "^2.1.0"
     }
   }
   ```

2. **UI Models Module (`packages/sdk/src/types/ui.ts`)**:
   Create `packages/sdk/src/types/ui.ts` capturing all UI-facing response shapes:
   - `Language`: includes `LanguageConfig`, translation metadata, direction, coverage.
   - `Project`: includes `ProjectConfig`, `Language[]`, count summaries.
   - `ApiKey`, `ApiKeySecret`: includes scopes, lastFour, expiration/revocation states.
   - `OpenApiConfiguration`: includes upload/url/repository sources, contentHash.
   - `PageNode`, `Page`: includes hierarchy, status, `PageConfig`, content.
   - `Branch`: includes default flag, git branch identifiers.
   - `Deployment`, `DeploymentStatus`, `DeploymentIssue`: includes version, status, errorDetails.
   - `PendingChange`, `PendingChangesResponse`, `DeploymentDiffLine`, `RedirectIssue`.
   - `Domain`, `DnsRecord`: includes verification tokens, DNS/SSL status.
   - `Asset`: S3-backed asset representation.
   - `WorkspaceSettings`: notification, integration, and git settings map.
   - `ProjectAddon`: status, group, revision, config.
   - `Comment`, `CommentAnchor`: anchored inline and page-level comments.
   - `NotificationItem`, `NotificationList`: inbox notification payloads.
   - `SiteShell`, `SitePage`, `SiteSearchHit`, `SearchAnswer`: reader and search models.
   - `ReaderAccessData`: audience grants, reader members, JWT settings.
   - `GitWorkflowStatus`, `GitOperation`, `GitConflict`: full git connection telemetry.
   - `ProjectThemeImportResult`, `ContentImportSummary`.

3. **Re-exports**:
   Re-export all UI models from `packages/sdk/src/types/index.ts` and `packages/sdk/src/index.ts`.

### 3.2 Strongly-Typed Defaults in `@cms/sdk/react`

Update each hook in `packages/sdk/src/react/hooks/*.ts` to substitute `<T = any>` with the appropriate canonical type:

| Hook | Default Generic Type | Source Resource Call |
| :--- | :--- | :--- |
| `useProjects` | `<T = Project>` | `client.projects.list()` |
| `useProject` | `<T = Project>` | `client.projects.get(id)` |
| `useProjectMembers` | `<T = ProjectMembersResponse>` | `client.projects.getMembers(id)` |
| `usePages` | `<T = PageNode>` | `client.pages.list(id, ...)` |
| `usePage` | `<T = Page>` | `client.pages.get(id, pageId)` |
| `useBranches` | `<T = Branch>` | `client.branches.list(id)` |
| `useLanguages` | `<T = Language>` | `client.languages.list(id)` |
| `useComments` | `<T = Comment>` | `client.comments.list(id, ...)` |
| `useDeployments` | `<T = Deployment>` | `client.deployments.list(id, ...)` |
| `usePendingChanges` | `<T = PendingChangesResponse>` | `client.deployments.getPendingChanges(id)` |
| `useDomains` | `<T = Domain>` | `client.domains.list(id)` |
| `useApiKeys` | `<T = ApiKey>` | `client.apiKeys.list(id)` |
| `useOpenApiConfiguration`| `<T = OpenApiConfiguration>` | `client.openapi.get(id)` |
| `useProjectAddons` | `<T = ProjectAddon>` | `client.addons.list(id)` |
| `useWorkspaceSettings` | `<T = WorkspaceSettings>` | `client.workspace.getSettings()` |
| `useMembers` | `<T = WorkspaceMembersResponse>` | `client.workspace.getMembers()` |
| `useNotifications` | `<T = NotificationList>` | `client.notifications.list(...)` |
| `useReaderAccess` | `<T = ReaderAccessData>` | `client.readerAccess.get(id)` |
| `useGitWorkflow` | `<T = GitWorkflowStatus \| null>`| `client.gitWorkflow.getStatus(id)` |
| `useProjectIntegrations` | `<T = IntegrationCatalogEntry>` | `client.integrations.list(id)` |

Callers needing custom shapes can still supply an explicit type parameter (e.g. `useProjects<CustomProject>()`), but Studio components will default to fully typed models out of the box with zero generic boilerplate.

### 3.3 Query Keys Factory Export

In `packages/sdk/src/react/query-keys.ts` and `packages/sdk/src/react/index.ts`:
- Ensure `analyticsQueryKeys` is re-exported alongside `queryKeys` so consumers can import `import { queryKeys, analyticsQueryKeys } from '@cms/sdk/react';`.

### 3.4 Hook Unit Tests Relocation

Move the hook unit tests currently located in `apps/studio/src/shared/hooks/api/`:
- `integrations.test.ts` → `packages/sdk/src/react/__tests__/integrations.test.tsx`
- `mutations.addons.test.ts` → `packages/sdk/src/react/__tests__/mutations.addons.test.tsx`
- `optimistic-reorder.test.ts` → `packages/sdk/src/react/__tests__/optimistic-reorder.test.tsx`

This ensures `@cms/sdk/react` contains its own full test suite validating mutation conflict recovery and optimistic tree updates.

### 3.5 Studio Migration (75+ files)

1. **Imports Replacement**:
   - Update imports in all features (`projects`, `editor`, `publishing`, `project-settings`, `workspace`, `analytics`, `auth`):
     - Replace `from '@/hooks/api'` with `from '@cms/sdk/react'` (for hooks and query keys).
     - Replace type imports `from '@/hooks/api'` or `from '@/hooks/api/types'` with `from '@cms/sdk'`.
     - Replace `from '@/hooks/api/analytics'` with `from '@cms/sdk/react'`.
     - Replace `ApiResponseError` from `client-helpers` with `CmsApiError` from `@cms/sdk`.
2. **Vitest Mocks Replacement**:
   - In test files (e.g., `CommandPalette.test.tsx`, `ProjectAccessBoundary.test.tsx`, `WorkspaceSettingsPage.test.tsx`, etc.):
     - Change `vi.mock('@/hooks/api', () => ...)` to `vi.mock('@cms/sdk/react', () => ...)`.
3. **Delete Studio API Hooks Folder**:
   - Remove directory `apps/studio/src/shared/hooks/api/`.
   - Remove `apps/studio/src/shared/hooks/index.ts` if no other hooks exist in that directory.
4. **Clean up `apps/studio/tsconfig.json`**:
   - Remove `"@/hooks/*": ["./src/shared/hooks/*"]` from `compilerOptions.paths`.

---

## 4. Verification & Testing

1. **Compilation & Type-Check**:
   - Run `bun run typecheck` across all workspace packages (`@cms/sdk`, `@cms/studio`, `@cms/site`, etc.).
2. **Unit Tests**:
   - Run `bun --filter @cms/sdk test` to verify moved hook unit tests pass.
   - Run `bun --filter @cms/studio test` to verify all Studio page/component tests and mocks pass.
3. **Linter & Formatting**:
   - Run `bun run check` and `bun run lint:md` to verify code quality and formatting.
