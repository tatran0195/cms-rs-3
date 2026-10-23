# Dedicated Publishing & Deployments Page Design Specification

## 1. Overview & Objective

Previously, clicking the Publish (Rocket) button in the Left Activity Rail (`ActivityRail.tsx`) opened an intrusive modal dialog (`DeployPipeline.tsx`) containing basic deployment status and history. This provided limited visibility into pending changes, production health, or comprehensive deployment logs.

This specification defines the implementation of a dedicated **Deployments & Publishing Page** (`/app/projects/$projectId/deployments`) and the corresponding navigation update in the Activity Rail.

---

## 2. Shell & Navigation Architecture

### 2.1 Route Definition
- **Route File**: `apps/studio/src/routes/app/projects/$projectId/deployments.tsx`
- **Route Path**: `/app/projects/$projectId/deployments`
- Uses TanStack Router's `createFileRoute` to mount `<ProjectDeploymentsPage projectId={projectId} />`.

### 2.2 Activity Rail Update (`ActivityRail.tsx`)
- Detects the active route:
  ```tsx
  const isDeployments = projectId ? pathname.startsWith(`/app/projects/${projectId}/deployments`) : false;
  ```
- Subscribes to deployments telemetry to detect if any deployment is actively running (`PENDING` or `BUILDING`):
  ```tsx
  const deployments = useDeployments(projectId, { enabled: Boolean(projectId) });
  const isBuilding = deployments.data?.[0]?.status === 'PENDING' || deployments.data?.[0]?.status === 'BUILDING';
  ```
- Replaces the callback button with a first-class route `<Link>`:
  ```tsx
  <Tooltip>
    <TooltipTrigger render={<span />}>
      <Link
        to="/app/projects/$projectId/deployments"
        params={{ projectId }}
        aria-label={t('project.publish')}
        className={cn(
          'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground relative',
          isDeployments && 'bg-muted text-foreground font-medium',
        )}
      >
        <Rocket className="size-4" />
        {isBuilding && (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-500 animate-pulse" />
        )}
      </Link>
    </TooltipTrigger>
    <TooltipContent side="right">{t('project.publish')}</TooltipContent>
  </Tooltip>
  ```

### 2.3 Project Layout Alignment (`ProjectLayout.tsx`)
- Includes `isDeployments` alongside `isOverview` and `isAnalytics` to render the clean project header:
  ```tsx
  const isDeployments = pathname.startsWith(`/app/projects/${projectId}/deployments`);
  ```
- Displays the header breadcrumb `{project.name} / Deployments` when on `/deployments`.
- Removes obsolete modal trigger prop pass-down while preserving existing top-bar controls.

---

## 3. Page Layout & Component Architecture

### 3.1 Component Hierarchy
```
ProjectDeploymentsPage
├── DeploymentsHeader (Title, subtitle, "Publish New Version" button)
├── HighDensityStatusCards
│   ├── LiveProductionCard (Status badge, domain URL, copy link, version)
│   ├── PendingChangesCard (Added, modified, removed stats, preflight health)
│   └── DeploymentHealthCard (Total deploys, latest duration, success rate)
├── ActivePipelineBanner (Rendered when latest is PENDING/BUILDING)
├── FailureDiagnosticsCard (Rendered when latest is FAILED, broken links, grammar)
└── DeploymentHistorySection
    ├── FilterBar (Search by version or release message)
    └── DeploymentTable
        ├── Rows (vX, StatusBadge, Message, Date, Duration, Actions)
        └── Actions (Rollback confirm, View site, Inspect details)
```

### 3.2 Key States & Behaviors
1. **Live Production Status**:
   - Queries `useDomains(projectId)` to find the verified primary custom domain or fallback `/sites/${projectId}`.
   - Shows status pill: `Live` (green) if a ready deployment exists, `Building` (amber) if deploying, or `Failed` (red).
2. **Pending Changes & Diff**:
   - Queries `usePendingChanges(projectId)` for counts of added, modified, and removed pages.
   - Displays preflight validation issues (e.g., circular redirect chains).
   - "Publish New Version" button triggers `PublishModal` to allow reviewing line-by-line diffs before confirming.
3. **Active Pipeline Banner**:
   - When a deployment is in progress (`PENDING` or `BUILDING`), displays a live step-by-step progress bar (`Queued` → `Building` → `Indexing` → `Live`) without blocking the author.
   - Polls every 1.5 seconds until resolution.
4. **Failure Diagnostics**:
   - If a build failed, surfaces broken links or syntax/grammar errors clearly.
   - Provides "Publish Anyway" action when failure consists solely of non-fatal grammar warnings.
5. **Instant Rollback**:
   - Rollback button available on any previous `READY` version.
   - Prompts for confirmation via `useConfirm`.
   - On confirmation, executes `useRollback` mutation and automatically invalidates React Query caches.

---

## 4. Internationalization & Accessibility

- Uses existing translation keys in `@cms/i18n` where applicable (`deploy.*`, `overview.*`, `project.*`).
- Semantic table elements with accessible ARIA labels for buttons and links.
- Keyboard navigable controls with visible focus rings.

---

## 5. Verification Plan

1. **Unit Tests**:
   - `ActivityRail.test.tsx`: Test that the Rocket icon navigates to `/app/projects/$projectId/deployments` and applies active styling.
   - `ProjectDeploymentsPage.test.tsx`: Test rendering of live site card, pending changes card, history table, and rollback action.
2. **Typecheck & Linting**:
   - Run `tsc --noEmit` and Biome linter across `@cms/studio`.
3. **Vitest Execution**:
   - Run full unit test suite for the studio package to ensure no regressions.
