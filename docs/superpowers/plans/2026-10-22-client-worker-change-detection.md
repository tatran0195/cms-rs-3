# Client Web Worker Change Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move project change detection and rich line-by-line diff calculation to a background client Web Worker in `@cms/studio` to eliminate the "Checking for changes..." loading spinner and make the Publish modal open instantly with real line diffs.

**Architecture:** A dedicated Web Worker (`diff-worker.ts`) receives current project pages and baseline snapshot pages to compute added, modified, and removed pages along with Myers line-by-line diffs (`DeploymentDiffLine[]`) completely off the main thread. A React hook (`useChangeDetectionWorker`) automatically runs debounced on content edits/page mutations and pre-warms the TanStack Query cache (`queryKeys.deployments.changes`), so `PublishModal` has pre-computed diffs ready on frame 1.

**Tech Stack:** TypeScript, React 19, TanStack React Query v5, Vite Web Worker (`new URL(..., import.meta.url)`), Rust (Axum API), Vitest / Bun test.

---

## Global Constraints

- Platform is exclusively an internal company CMS deployment (no plan, billing, or marketing pages).
- All diff computation must run off the main UI thread via Web Worker, with synchronous fallback if `Worker` is unavailable.
- Line diffs capped at 1,000 lines per page (`truncated: true`) to avoid memory bloat.
- Code style must strictly comply with Biome rules (`bun x @biomejs/biome check`).

---

## Task 1: Backend Baseline Snapshot Endpoint

**Files:**
- Modify: `crates/cms-entity/src/deployment.rs`
- Modify: `crates/cms-api/src/project/handlers/deployments.rs`
- Modify: `crates/cms-api/src/project/mod.rs`
- Test: `crates/cms-api/tests/deployments_test.rs` or curl/test runner

**Interfaces:**
- Produces: `GET /api/app/projects/{project_id}/deployments/baseline` returning `ApiResponse<DeploymentBaselineResponse>`.
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
  #[serde(rename_all = "camelCase")]
  pub struct BaselinePageItem {
      pub id: String,
      pub title: String,
      pub path: String,
      pub slug: String,
      pub content: String,
      pub is_published: bool,
      pub language_code: String,
      pub kind: String,
  }

  #[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
  #[serde(rename_all = "camelCase")]
  pub struct DeploymentBaselineResponse {
      pub has_baseline: bool,
      pub deployment_id: Option<String>,
      pub version: Option<i64>,
      pub pages: Vec<BaselinePageItem>,
  }
  ```

- [ ] **Step 1: Define types in `crates/cms-entity/src/deployment.rs`**
  Add `BaselinePageItem` and `DeploymentBaselineResponse` structs with `#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]` and `#[serde(rename_all = "camelCase")]`.

- [ ] **Step 2: Implement handler in `crates/cms-api/src/project/handlers/deployments.rs`**
  Implement `pub async fn get_deployment_baseline_handler(...)`:
  1. Authorize viewer relation.
  2. Query `DeploymentService::list_deployments`.
  3. Find active deployment `baseline`.
  4. If `baseline.is_none()`, return `DeploymentBaselineResponse { has_baseline: false, deployment_id: None, version: None, pages: Vec::new() }`.
  5. If `baseline.is_some()`, call `cms_db::deployment::DeploymentQueries::get_snapshot_pages(&state.pool, &base.id, None)`.
  6. Map snapshot pages to `BaselinePageItem` and return `has_baseline: true`, `deployment_id: Some(base.id)`, `version: Some(base.version)`.

- [ ] **Step 3: Register route in `crates/cms-api/src/project/mod.rs`**
  Add `.route("/{project_id}/deployments/baseline", get(get_deployment_baseline_handler))`.

- [ ] **Step 4: Verify with `cargo check`**
  Run: `cargo check -p cms-api`
  Expected: Success with no compile errors.

- [ ] **Step 5: Commit**
  ```bash
  git add crates/cms-entity/src/deployment.rs crates/cms-api/src/project/handlers/deployments.rs crates/cms-api/src/project/mod.rs
  git commit -m "feat(api): add baseline deployment snapshot endpoint"
  ```

---

## Task 2: SDK Client & React Query Baseline Hook

**Files:**
- Modify: `packages/sdk/src/types/ui.ts`
- Modify: `packages/sdk/src/resources/deployments.ts`
- Modify: `packages/sdk/src/react/hooks/deployments.ts`
- Modify: `packages/sdk/src/react/keys.ts`

**Interfaces:**
- Consumes: `GET /api/app/projects/{project_id}/deployments/baseline`
- Produces: `client.deployments.getBaseline(projectId)` and `useBaselineSnapshot(projectId)`.
  ```ts
  export interface BaselinePageItem {
    id: string;
    title: string;
    path: string;
    slug: string;
    content: string;
    isPublished: boolean;
    languageCode: string;
    kind: 'PAGE' | 'GROUP';
  }

  export interface DeploymentBaselineResponse {
    hasBaseline: boolean;
    deploymentId: string | null;
    version: number | null;
    pages: BaselinePageItem[];
  }
  ```

- [ ] **Step 1: Add types to `packages/sdk/src/types/ui.ts`**
  Export `BaselinePageItem` and `DeploymentBaselineResponse`.

- [ ] **Step 2: Add query key in `packages/sdk/src/react/keys.ts`**
  Add `baseline: (projectId: string) => ['deployments', projectId, 'baseline'] as const` to `queryKeys.deployments`.

- [ ] **Step 3: Add resource method to `packages/sdk/src/resources/deployments.ts`**
  ```ts
  async getBaseline(projectId: ProjectId): Promise<DeploymentBaselineResponse> {
    return this.http.get<DeploymentBaselineResponse>(`/api/app/projects/${projectId}/deployments/baseline`);
  }
  ```

- [ ] **Step 4: Add hook `useBaselineSnapshot` in `packages/sdk/src/react/hooks/deployments.ts`**
  ```ts
  export const useBaselineSnapshot = <T = DeploymentBaselineResponse>(projectId: string | undefined, options?: { enabled?: boolean }) => {
    const client = useCmsClient();
    return useQuery({
      queryKey: queryKeys.deployments.baseline(projectId ?? ''),
      enabled: Boolean(projectId) && (options?.enabled ?? true),
      staleTime: 60_000,
      queryFn: async () => {
        if (!projectId) throw new Error('projectId is required');
        return (await client.deployments.getBaseline(projectId)) as unknown as T;
      },
    });
  };
  ```

- [ ] **Step 5: Verify SDK typecheck**
  Run: `bun run --filter @cms/sdk check` or `bun run build` in `packages/sdk`
  Expected: Clean build.

- [ ] **Step 6: Commit**
  ```bash
  git add packages/sdk/src/types/ui.ts packages/sdk/src/resources/deployments.ts packages/sdk/src/react/hooks/deployments.ts packages/sdk/src/react/keys.ts
  git commit -m "feat(sdk): add getBaseline and useBaselineSnapshot hook"
  ```

---

## Task 3: Diff Worker & Myers Line-Diff Algorithm

**Files:**
- Create: `apps/studio/src/features/publishing/utils/diff-worker.ts`
- Create: `apps/studio/src/features/publishing/utils/diff-worker-client.ts`
- Create: `apps/studio/src/features/publishing/utils/diff-worker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ComputeChangesPayload {
    currentPages: BaselinePageItem[];
    baselinePages: BaselinePageItem[];
    hasBaseline: boolean;
    lastVersion?: number;
  }
  export function computeChangesSync(payload: ComputeChangesPayload): PendingChangesResponse;
  export class DiffWorkerClient {
    computeChanges(payload: ComputeChangesPayload): Promise<PendingChangesResponse>;
  }
  export const diffWorkerClient: DiffWorkerClient;
  ```

- [ ] **Step 1: Write failing unit test in `apps/studio/src/features/publishing/utils/diff-worker.test.ts`**
  Test cases:
  1. `detects added pages when hasBaseline is true`: Page in current but not baseline is returned as `status: 'added'` with additions equal to line count.
  2. `detects removed pages when hasBaseline is true`: Page in baseline but missing in current is returned as `status: 'removed'` with deletions equal to line count.
  3. `detects modified pages and produces line diff`: Modifying a line produces `{ type: 'removed', text: 'old', oldLine: 1 }` and `{ type: 'added', text: 'new', newLine: 1 }`.
  4. `truncates diffs beyond 1000 lines`: Files with 1500 modified lines have diff truncated with `truncated: true`.
  5. `first publish (no baseline)`: When `hasBaseline: false`, all published pages return as `added` and `hasBaseline: false`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun test apps/studio/src/features/publishing/utils/diff-worker.test.ts`
  Expected: FAIL with module not found.

- [ ] **Step 3: Implement `diff-worker.ts`**
  Implement:
  - Myers / LCS line-diff algorithm returning `DeploymentDiffLine[]`, `additions`, `deletions`.
  - Page comparison loop (`currentPages` vs `baselinePages`).
  - Worker message handler `self.onmessage` for worker execution.
  - Exported `computeChangesSync` for direct fallback.

- [ ] **Step 4: Implement `diff-worker-client.ts`**
  Implement `DiffWorkerClient` class with:
  - Vite Worker instantiation: `new Worker(new URL('./diff-worker.ts', import.meta.url), { type: 'module' })`.
  - Fallback to `computeChangesSync` if `typeof Worker === 'undefined'` or initialization throws.
  - Promise dispatch with message counter ID.

- [ ] **Step 5: Run unit tests to verify they pass**
  Run: `bun test apps/studio/src/features/publishing/utils/diff-worker.test.ts`
  Expected: All tests PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/studio/src/features/publishing/utils/diff-worker.ts apps/studio/src/features/publishing/utils/diff-worker-client.ts apps/studio/src/features/publishing/utils/diff-worker.test.ts
  git commit -m "feat(studio): add diff-worker and client with Myers line diff"
  ```

---

## Task 4: React Auto-Trigger Hook (`useChangeDetectionWorker`)

**Files:**
- Create: `apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.ts`
- Create: `apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.test.ts`
- Modify: `apps/studio/src/features/publishing/index.ts`

**Interfaces:**
- Consumes: `diffWorkerClient`, `useBaselineSnapshot(projectId)`, `queryClient`.
- Produces:
  ```ts
  export function useChangeDetectionWorker(params: {
    projectId: string;
    pages?: PageNode[] | BaselinePageItem[];
    activeDraft?: { id: string; title: string; content: string } | null;
    enabled?: boolean;
  }): {
    isComputing: boolean;
    recompute: () => Promise<void>;
  };
  ```

- [ ] **Step 1: Write failing unit test in `useChangeDetectionWorker.test.ts`**
  Test cases:
  1. Calls `diffWorkerClient.computeChanges` when pages or draft change.
  2. Sets query data in `queryKeys.deployments.changes(projectId)`.
  3. Debounces rapid draft edits.

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun test apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.test.ts`
  Expected: FAIL with module not found.

- [ ] **Step 3: Implement `useChangeDetectionWorker.ts`**
  Implement:
  - TanStack Query client access via `useQueryClient()`.
  - Subscribes to `useBaselineSnapshot(projectId)`.
  - Merges `pages` with `activeDraft` if currently open page has pending edits.
  - Debounced trigger (`useDebouncedCallback` with 300ms wait).
  - On worker return, calls `queryClient.setQueryData(queryKeys.deployments.changes(projectId), pendingChanges)`.

- [ ] **Step 4: Export hook from `apps/studio/src/features/publishing/index.ts`**

- [ ] **Step 5: Run unit tests to verify they pass**
  Run: `bun test apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.ts apps/studio/src/features/publishing/hooks/useChangeDetectionWorker.test.ts apps/studio/src/features/publishing/index.ts
  git commit -m "feat(studio): add useChangeDetectionWorker hook"
  ```

---

## Task 5: Integrate Worker into EditorPage and PublishModal

**Files:**
- Modify: `apps/studio/src/features/editor/EditorPage.tsx`
- Modify: `apps/studio/src/features/publishing/components/PublishModal.tsx`
- Modify: `apps/studio/src/features/publishing/components/DeployPipeline.tsx`

**Interfaces:**
- Integrates `useChangeDetectionWorker` into `EditorPage`.
- Ensures `PublishModal` consumes pre-warmed cache with 0ms loading state.
- Ensures baseline snapshot is invalidated on deploy completion.

- [ ] **Step 1: Wire `useChangeDetectionWorker` in `EditorPage.tsx`**
  In `EditorPage.tsx`:
  - Pass `projectId`, `allPages`, and `{ id: activeId, title, content }` to `useChangeDetectionWorker`.
  - When autosave completes or pages are modified, the worker recomputes automatically in background.

- [ ] **Step 2: Update `PublishModal.tsx`**
  - Verify `usePendingChanges(project.id, { enabled: open })` immediately reads cached data.
  - Ensure `lines` from worker renders accurately in line diff view.

- [ ] **Step 3: Invalidate baseline on deploy success in `DeployPipeline.tsx`**
  - When deployment transitions to `READY` or completes, invalidate `queryKeys.deployments.baseline(project.id)` so the baseline updates to the newly released snapshot.

- [ ] **Step 4: Lint and Typecheck**
  Run: `bun run check`
  Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/studio/src/features/editor/EditorPage.tsx apps/studio/src/features/publishing/components/PublishModal.tsx apps/studio/src/features/publishing/components/DeployPipeline.tsx
  git commit -m "feat(studio): integrate background change detection worker in editor and publish modal"
  ```

---

## Task 6: End-to-End Verification

**Files:**
- Test: Studio editor in browser (`http://localhost:4310`)
- Test: Existing Playwright publish workflow

- [ ] **Step 1: Run unit tests**
  Run: `bun test apps/studio`
  Expected: All tests pass.

- [ ] **Step 2: Verify in browser**
  1. Open Studio editor on an active project.
  2. Edit a page title and body content.
  3. Verify autosave completes without any main thread lag.
  4. Click **Publish** button:
     - Verify `PublishModal` opens instantly without the "Checking for changes..." spinner.
     - Verify the edited page appears with the correct status chip.
     - Click the change item: verify line-by-line diff shows green additions and red deletions.
  5. Close modal without publishing.
  6. Re-open modal: verify instant render remains intact.

- [ ] **Step 3: Commit and tag completion**
  ```bash
  git commit --allow-empty -m "chore: verify client worker change detection end-to-end"
  ```
