# Client Web Worker Change Detection Design

**Date**: 2026-10-22  
**Status**: Approved  
**Topic**: Move change detection and line diff computation to a background client Web Worker in `@cms/studio`

---

## 1. Context & Motivation

When documentation authors click the **Publish** button in `@cms/studio`, the confirmation dialog (`PublishModal`) previously queried `GET /api/app/projects/:projectId/deployments/changes`. While in flight, the dialog displayed a dashed banner with `<Loader2 className="animate-spin" /> Checking for changes...`.

Furthermore, the existing backend implementation only computed coarse page-level statuses (`added`, `modified`, `removed`), but left `lines: Vec::new()`. As a result, the rich line-by-line diff viewer inside `PublishModal` was unable to show colored line additions/deletions and displayed a fallback message (*"No line-by-line diff available for this change"*).

### Goals
1. **Instant Publish Modal**: Open `PublishModal` with 0ms delay and zero "Checking for changes..." loading spinners.
2. **Background Web Worker**: Compute change status and rich line diffs off the browser's main thread to prevent UI freezing or stuttering.
3. **Auto-Run on Edits**: Automatically run the worker when pages are edited (debounced after autosave), created, deleted, or reordered, proactively seeding TanStack Query's cache.
4. **Rich Line-by-Line Diffs**: Generate accurate Myers diff lines (`DeploymentDiffLine[]`) with `+additions` and `-deletions` so authors can review exact markdown changes before publishing.
5. **Graceful Fallbacks**: Transparently fall back to synchronous calculation if Web Workers are unavailable, and fall back to the server API if baseline fetching fails.

---

## 2. Architecture & Components

```
┌───────────────────────────────────────────────────────────┐
│                     Studio Main Thread                    │
│                                                           │
│  ┌────────────────────────┐    ┌────────────────────────┐ │
│  │ EditorPage / Autosave  │    │ Page Operations        │ │
│  │ (title/content edit)   │    │ (add/delete/reorder)   │ │
│  └───────────┬────────────┘    └───────────┬────────────┘ │
│              │                             │              │
│              └──────────────┬──────────────┘              │
│                             ▼                             │
│             ┌───────────────────────────────┐             │
│             │   useChangeDetectionWorker    │             │
│             └───────────────┬───────────────┘             │
│                             │ postMessage                 │
│                             ▼                             │
│             ┌───────────────────────────────┐             │
│             │      diffWorkerClient         │             │
│             └───────────────┬───────────────┘             │
└─────────────────────────────┼─────────────────────────────┘
                              │ postMessage
                              ▼
┌───────────────────────────────────────────────────────────┐
│              Dedicated diff-worker (Web Worker)           │
│                                                           │
│  1. Compare currentPages vs baselinePages                 │
│  2. Identify 'added', 'modified', 'removed'               │
│  3. Run Myers line-diff algorithm for modified pages      │
│  4. Compute additions, deletions, DeploymentDiffLine[]    │
└─────────────────────────────┬─────────────────────────────┘
                              │ postMessage (result)
                              ▼
┌───────────────────────────────────────────────────────────┐
│                     Studio Main Thread                    │
│                                                           │
│  queryClient.setQueryData(                                │
│    queryKeys.deployments.changes(projectId),              │
│    pendingChanges                                         │
│  )                                                        │
│                             │                             │
│                             ▼                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ PublishModal (reads from TanStack Query cache)      │  │
│  │ -> Instant render, 0ms loading, rich line diffs     │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Specifications

### 3.1 Backend Baseline Endpoint (`/api/app/projects/:id/deployments/baseline`)

* **Endpoint**: `GET /api/app/projects/{project_id}/deployments/baseline`
* **Handler**: `get_deployment_baseline_handler` in `crates/cms-api/src/project/handlers/deployments.rs`
* **Response Type**:
  ```ts
  export interface DeploymentBaselineResponse {
    hasBaseline: boolean;
    deploymentId: string | null;
    version: number | null;
    pages: Array<{
      id: string;
      title: string;
      path: string;
      slug: string;
      content: string;
      isPublished: boolean;
      languageCode: string;
      kind: 'PAGE' | 'GROUP';
    }>;
  }
  ```
* **Behavior**:
  * Finds the latest `Active` deployment for the project.
  * If found, loads snapshot pages via `DeploymentQueries::get_snapshot_pages(&state.pool, &base.id, None)`.
  * If no baseline exists (site never published), returns `hasBaseline: false` and empty `pages: []`.

### 3.2 Web Worker (`apps/studio/src/features/publishing/utils/diff-worker.ts`)

* Offloads heavy comparison and string diffing from the main UI thread.
* **Message Request**:
  ```ts
  export interface DiffWorkerRequest {
    id: string;
    type: 'compute-changes';
    payload: {
      currentPages: PageSnapshot[];
      baselinePages: PageSnapshot[];
      hasBaseline: boolean;
      lastVersion?: number;
    };
  }
  ```
* **Diff Algorithm**:
  * Fast set lookup of baseline pages by ID.
  * **Added**: Pages present in `currentPages` with `isPublished === true`, but not in `baselinePages`.
  * **Removed**: Pages present in `baselinePages` with `isPublished === true`, but missing from `currentPages` or marked unpublished.
  * **Modified**: Present in both, but `title`, `path`, `slug`, or `content` changed.
  * **Line Diffs**:
    * Implements an optimized Myers / LCS diff on line arrays (`split(/\r?\n/)`).
    * Produces `DeploymentDiffLine[]`:
      ```ts
      {
        type: 'added' | 'removed' | 'unchanged',
        text: string,
        oldLine: number | null,
        newLine: number | null
      }
      ```
    * Counts total `additions` and `deletions`.
    * Limits line diffs to 1,000 lines per page (`truncated: true` if exceeded) to ensure stable memory consumption.
* **Synchronous Fallback**:
  * Exports `computeChangesSync(payload)` so that main thread or test runners without `Worker` can execute the exact same logic.

### 3.3 Worker Client (`diff-worker-client.ts`)

* Singleton `diffWorkerClient` instantiated with Vite's worker syntax:
  ```ts
  new Worker(new URL('./diff-worker.ts', import.meta.url), { type: 'module' });
  ```
* Dispatches requests with promise mapping (`Map<string, Deferred>`).
* Graceful fallback to `computeChangesSync` if `typeof Worker === 'undefined'`.

### 3.4 React Hook (`useChangeDetectionWorker.ts`)

* **Signature**:
  ```ts
  export function useChangeDetectionWorker(options: {
    projectId: string;
    pages?: PageNode[];
    activeDraft?: { id: string; title: string; content: string } | null;
  }): {
    isComputing: boolean;
    recompute: () => Promise<void>;
  }
  ```
* **Trigger Conditions**:
  * On initial load when `pages` and baseline snapshot resolve.
  * Debounced (300ms) when `activeDraft` changes during editing.
  * Whenever `pages` change (create, delete, reorder).
* **Cache Seeding**:
  * Calls `queryClient.setQueryData(queryKeys.deployments.changes(projectId), pendingChanges)`.
  * Guarantees that opening `PublishModal` finds pre-warmed cache data immediately.

### 3.5 Publish Modal Experience (`PublishModal.tsx`)

* `usePendingChanges(project.id, { enabled: open })` immediately resolves with cached data.
* `loadingChanges` is `false` instantly.
* The review diff tab renders rich green additions and red deletions using `DeploymentDiffLine[]`.
* If worker cache is somehow empty, `usePendingChanges` queryFn still fetches from the backend as a reliable fallback.

---

## 4. Error Handling & Edge Cases

1. **No Baseline (First Publish)**:
   * When `hasBaseline === false`, all published pages are classified as `added`.
   * Lines diff displays all lines as `added` lines.
2. **Very Large Files**:
   * Line diffs exceeding 1,000 lines are capped with `truncated: true`.
   * `PublishModal` displays its built-in banner: *"Diff truncated"*.
3. **Worker Crash or Browser Disablement**:
   * If `worker.onerror` fires, the client logs a warning and falls back to `computeChangesSync` or server query.
4. **Publish Execution**:
   * When `usePublish` triggers a new deployment, on deployment completion the baseline cache `queryKeys.deployments.baseline(projectId)` is invalidated.
   * Re-fetching the baseline resets pending changes to 0.

---

## 5. Verification & Testing

1. **Unit Tests**:
   * `diff-worker.test.ts`:
     - Test addition of new pages.
     - Test deletion of removed pages.
     - Test modified page detection and attribute differences.
     - Test Myers diff line numbers and tokens (`added`, `removed`, `unchanged`).
     - Test diff truncation boundary (> 1,000 lines).
   * `use-change-detection-worker.test.ts`:
     - Verify debounced computation.
     - Verify `queryClient` cache updates.
2. **Static Analysis**:
   * Run `bun run check` and Biome linter across `apps/studio` and `packages/sdk`.
   * Verify cargo check on `crates/cms-api`.
3. **Manual Verification**:
   * Open Studio editor at `http://localhost:4310/app/projects/:id/editor`.
   * Edit a page title and content.
   * Click **Publish** button: verify modal opens instantly without loading spinner and displays line diffs in review mode.
