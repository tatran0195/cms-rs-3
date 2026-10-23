# Topbar Live Site Access, Site Config Navigation, and Published DocsLayout Fixes

## 1. Context & Motivation

Users currently face three workflow friction points when editing and viewing documentation sites:
1. **Accessing the Live Published Site**: To access the live site, users must navigate down to either the Project Overview or Deployments page to find the "View Live Site" / "View Site" button. Moving this action into the persistent topbar gives users immediate 1-click access across all project surfaces (including the editor) and eliminates redundant action buttons from the Overview and Publish page headers.
2. **Returning from Site Configuration in the Editor**: Clicking "Site configuration" at the bottom of the editor's sidebar switches the view to configuration mode (`view = 'config'`), but provides no obvious return path in the sidebar (only a subtle "Done" button in the canvas), leaving users confused about how to get back to the markdown editor and page tree.
3. **Published Site Layout Synchronization**: When a user changes `docsLayout` (such as `notebook`, `glass`, or `spacious`) in project settings and publishes a release, the published site reader (`/sites/$projectId`) can still render the default layout due to missing query cache invalidation on publish, an un-normalized layout resolution in `DocumentationThemeProvider`, and missing CSS selectors in `styles.css`.

---

## 2. Architecture & Design

### 2.1 Reusable Live Site URL Hook (`useLiveSiteUrl`)

Create `useLiveSiteUrl(projectId: string)` in `@/features/projects/hooks/useLiveSiteUrl.ts` (and export from `@/features/projects`):
- Fetches project metadata via `useProject(projectId)` and domains via `useDomains(projectId)`.
- Resolves verified primary domain, fallback to base domain (`VITE_SITE_BASE_DOMAIN`) with project slug, and finally `/sites/${projectId}` fallback.
- Returns `{ liveHref: string, liveDomain: string | null, isReady: boolean }`.

### 2.2 Topbar Live Site Action Placement

1. **`ProjectLayout` Topbar (`apps/studio/src/features/projects/components/ProjectLayout.tsx`)**:
   - In both header variants (the standard overview/deployments/analytics header and the fallback sidebar-inset header), add a "Live Site" button right next to the "Preview" button:
   ```tsx
   <Button
     nativeButton={false}
     render={<a aria-label="View live published site" href={liveHref} target="_blank" rel="noreferrer" />}
     size="sm"
     variant="outline"
     className="h-7 text-xs font-normal gap-1.5"
   >
     <ExternalLink className="size-3.5" />
     <span>Live Site</span>
   </Button>
   ```

2. **`EditorPage` Topbar (`apps/studio/src/features/editor/EditorPage.tsx`)**:
   - In the right-hand action bar, insert the matching "Live Site" button next to the "Preview" button:
   ```tsx
   <Button
     nativeButton={false}
     render={<a aria-label="View live published site" href={liveHref} target="_blank" rel="noreferrer" />}
     size="sm"
     variant="outline"
     className="h-7 gap-1.5 text-xs font-normal"
   >
     <ExternalLink className="size-3.5" />
     <span className="hidden md:inline">Live Site</span>
   </Button>
   ```

### 2.3 Cleanup on Overview and Deployments Pages

1. **Overview Page (`apps/studio/src/features/projects/ProjectOverviewPage.tsx`)**:
   - Remove the `<Button ...><Eye /> View Site</Button>` button from the top-right header group (lines 139–147).
   - Retain the primary `<Button><PenLine /> Open Editor</Button>` button.
   - Retain the right-column "Live Site" status card with the copy-URL functionality and domain display.

2. **Deployments / Publish Page (`apps/studio/src/features/publishing/components/ProjectDeploymentsPage.tsx`)**:
   - Remove the `<Button ...><ExternalLink /> View Live Site</Button>` button from the top-right header group (lines 183–191).
   - Retain the primary `<Button><Rocket /> Publish New Version</Button>` button.
   - Retain the 3-column "Live Production" status card.

---

### 2.4 "Back to Editor" Navigation in Site Configuration

1. **Left Sidebar Header (`apps/studio/src/features/editor/EditorPage.tsx`)**:
   - When `view === 'config'`, replace the static `<span>{t('editor.config.heading')}</span>` with an interactive back action:
   ```tsx
   <Button
     variant="ghost"
     size="sm"
     onClick={() => setView('content')}
     className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
     aria-label="Back to editor"
   >
     <ArrowLeft className="size-3.5 rtl:rotate-180" />
     <span>Back to editor</span>
   </Button>
   ```

2. **Main Canvas Header in Config Mode (`apps/studio/src/features/editor/EditorPage.tsx`)**:
   - In the config subheader (`view === 'config'`), replace the text-only "Done" button with:
   ```tsx
   <Button
     variant="outline"
     size="sm"
     onClick={() => setView('content')}
     className="h-7 gap-1.5 text-xs font-medium"
   >
     <ArrowLeft className="size-3.5 rtl:rotate-180" />
     <span>Back to editor</span>
   </Button>
   ```
   - In the top action bar (Column 3 header), when `view === 'config'`, conditionally hide markdown-editing specific controls (SaveStatusIndicator, Mode Switcher) and show the "Back to editor" shortcut or clear site settings context.

---

### 2.5 Published Site `docsLayout` Application & Cache Sync

1. **Query Cache Invalidation on Publish**:
   - In `packages/sdk/src/react/hooks/deployments.ts` (`usePublish`, `usePublishAnyway`, `useRollback`), add query cache invalidation for the published site shell and pages:
   ```ts
   qc.invalidateQueries({ queryKey: ['site', projectId] });
   qc.invalidateQueries({ queryKey: ['site-page', projectId] });
   ```
   - In `apps/studio/src/features/publishing/components/DeployPipeline.tsx` and `ProjectDeploymentsPage.tsx`, ensure the query client invalidates `['site', projectId]` and `['site-page', projectId]` when a deploy completes or rolls back.

2. **Published Route Loader Freshness (`apps/studio/src/routes/sites/$projectId/route.tsx`)**:
   - Remove `staleTime: 'static'` from `route.tsx` and `$.tsx` in favor of a standard fresh interval (e.g. `staleTime: 5000` or refetch-on-mount), ensuring navigating to `/sites/$projectId` immediately reflects recently published layout snapshots.
   - Guard `candidate` resolution against setting non-version path slugs as version query keys when `knownVersions` is not yet populated.

3. **Robust Theme Resolution in `DocumentationThemeProvider` (`packages/site/src/components/documentation-theme-provider.tsx`)**:
   - Change `const docsLayout = theme.layout.docsLayout ?? 'docs';` to use `resolveDocsLayout(theme.layout)`, ensuring that full layouts, preset fallbacks, and shell aliases (`editorial` -> `notebook`, `console` -> `flux`) are resolved uniformly.

4. **CSS Width Normalization for Glass & Flux Layouts (`apps/studio/src/styles.css`)**:
   - Include `#fd-glass-layout`, `#fd-flux-layout`, `[data-documentation-layout="glass"]`, and `[data-documentation-layout="flux"]` in the layout container width normalization rule.

---

## 3. Verification Plan

1. **Automated Tests**:
   - Run existing unit tests across `@cms/site`, `@cms/studio`, and `@cms/sdk`.
   - Update `ProjectLayout.test.tsx`, `ProjectOverviewPage.test.tsx`, and `ProjectDeploymentsPage.test.tsx` to verify presence/absence of header actions.
   - Verify layout template resolution in `@cms/site/layouts.test.tsx`.
2. **End-to-End & Browser Verification**:
   - Navigate to `/app/projects/$projectId/editor`: Verify "Live Site" button is present and points to the correct live site href in a new tab.
   - Click "Site configuration" in the editor: Verify "Back to editor" button appears in the sidebar header and returns user cleanly to page tree.
   - Navigate to `/app/projects/$projectId` (Overview): Verify header "View Site" is removed while the "Live Site" right card remains functional.
   - Navigate to `/app/projects/$projectId/deployments`: Verify header "View Live Site" is removed while "Publish New Version" remains.
   - Open `/sites/$projectId`: Verify `docsLayout` matches the published configuration (`notebook`, `glass`, etc.) with correct DOM attributes and styles.
