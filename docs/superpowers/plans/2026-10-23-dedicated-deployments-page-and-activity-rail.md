# Dedicated Deployments Page and Activity Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated, full-featured Deployments & Publishing page (`/app/projects/$projectId/deployments`) and update the Left Activity Rail to navigate to it with active route styling and live building telemetry.

**Architecture:** The page is registered as a first-class route in TanStack Router sharing `ProjectLayout`'s clean header and navigation chrome. The page provides production domain status, pending draft diffs and preflight health, an inline non-blocking pipeline runner, failure diagnostics, and a complete deployment history table with one-click rollback. In `ActivityRail`, the rocket icon becomes an active router `<Link>` with a pulsing build indicator.

**Tech Stack:** React 19, TypeScript, TanStack Router, TanStack Query, Tailwind CSS v4, `@cms/design-system`, `@cms/sdk`, Lucide icons, Vitest.

## Global Constraints

- Platform is for internal company deployment only (strictly no plan, billing, or pricing features).
- Use Vanilla CSS / Tailwind utilities adhering to `@cms/design-system` tokens and components.
- Maintain full type safety with `@cms/sdk` and TanStack Router.
- Semantic HTML and accessible ARIA attributes on all interactive triggers.

---

### Task 1: Update ActivityRail and ProjectLayout for Deployments Route

**Files:**
- Modify: `apps/studio/src/features/workspace/components/ActivityRail.tsx:27-145`
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.tsx:20-60`
- Modify: `apps/studio/src/features/workspace/components/ActivityRail.test.tsx:40-98`
- Modify: `apps/studio/src/features/projects/components/ProjectLayout.test.tsx:170-198`

**Interfaces:**
- Consumes: `useDeployments(projectId)` from `@cms/sdk/react`, TanStack Router's `<Link>` and `useRouterState`.
- Produces: `isDeployments` route highlight, `<Link to="/app/projects/$projectId/deployments" />` in `ActivityRail`, and `{project.name} / Deployments` breadcrumb in `ProjectLayout`.

- [ ] **Step 1: Update ActivityRail tests to expect the link and active state**

Update `apps/studio/src/features/workspace/components/ActivityRail.test.tsx` to assert that the Publish button is a `<Link to="/app/projects/$projectId/deployments">` with `aria-label="project.publish"`, and that an active indicator or building dot renders when appropriate:

```tsx
    const deployLink = container.querySelector('a[aria-label="project.publish"]');
    expect(deployLink).not.toBeNull();
    expect(deployLink?.getAttribute('href')).toBe('/app/projects/test-project/deployments');
```

- [ ] **Step 2: Run ActivityRail test to verify failure**

Run: `pnpm --filter @cms/studio test src/features/workspace/components/ActivityRail.test.tsx`
Expected: FAIL because `ActivityRail` currently renders a `<Button onClick={onOpenDeploy}>`.

- [ ] **Step 3: Update ActivityRail.tsx and ProjectLayout.tsx**

In `ActivityRail.tsx`:
- Compute `const isDeployments = projectId ? pathname.startsWith(`/app/projects/${projectId}/deployments`) : false;`
- Query `const { data: deployments } = useDeployments(projectId ?? '', { enabled: Boolean(projectId) });`
- Check `const isBuilding = deployments?.[0]?.status === 'PENDING' || deployments?.[0]?.status === 'BUILDING';`
- Render the rocket icon as a `<Link to="/app/projects/$projectId/deployments" params={{ projectId }}>` with `isDeployments && 'bg-muted text-foreground font-medium'` and the optional building pulse dot.

In `ProjectLayout.tsx`:
- Add `const isDeployments = pathname.startsWith(`/app/projects/${projectId}/deployments`);`
- Include `isDeployments` in the top header breadcrumb condition:
  ```tsx
  {isDeployments && (
    <>
      <span className="text-muted-foreground/40 text-xs">/</span>
      <span className="font-semibold text-sm text-foreground">{t('project.publish')}</span>
    </>
  )}
  ```
- Also add a test in `ProjectLayout.test.tsx` for `isDeployments` mode rendering.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cms/studio test src/features/workspace/components/ActivityRail.test.tsx src/features/projects/components/ProjectLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add apps/studio/src/features/workspace/components/ActivityRail.tsx apps/studio/src/features/projects/components/ProjectLayout.tsx apps/studio/src/features/workspace/components/ActivityRail.test.tsx apps/studio/src/features/projects/components/ProjectLayout.test.tsx
git commit -m "feat(rail): link publish button to deployments page and align project layout"
```

---

### Task 2: Implement ProjectDeploymentsPage Component

**Files:**
- Create: `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx`
- Modify: `apps/studio/src/features/publishing/index.ts`

**Interfaces:**
- Consumes:
  - `useProject(projectId)`, `useDeployments(projectId)`, `usePendingChanges(projectId)`, `useDomains(projectId)`, `useRollback(projectId)`, `usePublish(projectId)` from `@cms/sdk/react`
  - `useConfirm()` from `@cms/design-system/components/ui/confirm`
  - `PublishModal` from `./PublishModal`
- Produces: `export function ProjectDeploymentsPage({ projectId }: { projectId: string })` exported from `@/features/publishing`.

- [ ] **Step 1: Write ProjectDeploymentsPage implementation**

Create `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx` featuring:
1. **Header**: Title, subtitle, and primary `Publish New Version` button with badge indicating pending draft changes count.
2. **Top Metric Cards**:
   - *Live Production*: Status badge (`Live` / `Building` / `No live version`), live URL link with copy action, current version `v{version}`.
   - *Pending Changes*: Count of added, modified, removed pages, preflight health (redirect and link checks). Includes button to trigger change review modal.
   - *Build Health*: Total deploy count, last deployed timestamp, and average duration.
3. **Active Pipeline Banner**:
   - Embedded progress stepper (`Queued` → `Building` → `Indexing` → `Live`) when the latest deployment is `PENDING` or `BUILDING`, with auto-polling.
4. **Failure Diagnostics Banner**:
   - Displayed if the latest deployment is `FAILED`. Shows build errors, broken links, and grammar issues, with a "Publish Anyway" option when applicable.
5. **Deployment History Table**:
   - Filter input by commit message or version number.
   - Table columns: Version, Status, Commit Message, Triggered At, Actions.
   - Rollback button on any previous `READY` version, initiating `useConfirm` before triggering `useRollback.mutate(deployment.id)`.
   - Site preview action (`/sites/${projectId}`).
   - Integration with `PublishModal` for triggering new publishes.

- [ ] **Step 2: Export ProjectDeploymentsPage in `publishing/index.ts`**

Update `apps/studio/src/features/publishing/index.ts` to export `ProjectDeploymentsPage`.

- [ ] **Step 3: Commit changes**

```bash
git add apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx apps/studio/src/features/publishing/index.ts
git commit -m "feat(publishing): create comprehensive ProjectDeploymentsPage component"
```

---

### Task 3: Register TanStack Router Route for Deployments

**Files:**
- Create: `apps/studio/src/routes/app/projects/$projectId/deployments.tsx`

**Interfaces:**
- Consumes: `ProjectDeploymentsPage` from `@/features/publishing`, `createFileRoute` from `@tanstack/react-router`.
- Produces: Route `/app/projects/$projectId/deployments`.

- [ ] **Step 1: Create route file**

Create `apps/studio/src/routes/app/projects/$projectId/deployments.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { ProjectDeploymentsPage } from '@/features/publishing';

export const Route = createFileRoute('/app/projects/$projectId/deployments')({
  component: ProjectDeploymentsRoute,
});

function ProjectDeploymentsRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDeploymentsPage projectId={projectId} />;
}
```

- [ ] **Step 2: Verify route generation and typechecking**

Run: `pnpm --filter @cms/studio typecheck`
Expected: Route tree is automatically synchronized or valid, zero type errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/studio/src/routes/app/projects/$projectId/deployments.tsx
git commit -m "feat(routes): register deployments route for project workspace"
```

---

### Task 4: Comprehensive Tests for ProjectDeploymentsPage

**Files:**
- Create: `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.test.tsx`

**Interfaces:**
- Consumes: `ProjectDeploymentsPage` component, Vitest, React Testing Environment.
- Produces: Unit and interaction tests covering:
  1. Live production status rendering and copy URL.
  2. Pending changes banner and trigger.
  3. Active pipeline progress when status is `BUILDING`.
  4. Failure diagnostics display when status is `FAILED`.
  5. Deployment history list and rollback trigger with confirmation.

- [ ] **Step 1: Create test suite**

Create `apps/studio/src/features/publishing/components/ProjectDeploymentsPage.test.tsx` with mocked `@cms/sdk/react` (`useProject`, `useDeployments`, `usePendingChanges`, `useDomains`, `useRollback`, `useConfirm`).

- [ ] **Step 2: Run test suite**

Run: `pnpm --filter @cms/studio test src/features/publishing/components/ProjectDeploymentsPage.test.tsx`
Expected: All tests pass.

- [ ] **Step 3: Commit changes**

```bash
git add apps/studio/src/features/publishing/components/ProjectDeploymentsPage.test.tsx
git commit -m "test(publishing): add unit and interaction tests for ProjectDeploymentsPage"
```

---

### Task 5: Full Integration & Verification

**Files:**
- Any touched files in previous tasks

- [ ] **Step 1: Run complete typecheck**

Run: `pnpm --filter @cms/studio typecheck`
Expected: 0 errors.

- [ ] **Step 2: Run complete unit test suite**

Run: `pnpm --filter @cms/studio test`
Expected: All tests in studio pass.

- [ ] **Step 3: Biome lint and format check**

Run: `pnpm lint` or `pnpm format` across studio.
Expected: Clean linting.

- [ ] **Step 4: Commit any cleanup and finalize branch**

```bash
git status
git commit -m "chore(publishing): complete verification and formatting for deployments page"
```
