# Design Specification: Overview, Analytics & UI Alignment

- **Date:** 2026-10-23
- **Status:** Approved
- **Scope:** CMS Studio Frontend (`apps/studio`, `packages/site`)

---

## 1. Problem Statement & User Requirements

1. **Overview & Analytics Pages**: Currently lack content depth and operational utility. Need to be transformed into a high-density operational dashboard featuring content health (broken links, unindexed drafts, translation completeness across locales) and author activity alongside traffic trends.
2. **Topbar Vertical Divider Line**: The divider next to the branch switcher in `EditorPage.tsx` is too short (`h-4`, 16px) and does not cover the height of sibling items (`Search` button, `BranchSwitcher`, which are `h-7`, 28px).
3. **Publish Dropdown Split Button**: In `PublishControl.tsx`, the dropdown chevron trigger button renders shorter (28px) than the main Publish button (32px) because of inconsistent component usage (`Button` primitive with `min-h` token vs raw `<button>`).
4. **Preview Sidebar & Palette Alignment**: The Project Preview page (`/app/projects/$projectId/preview`) renders a custom flat button list with missing theme CSS tokens rather than matching the published sites reader (`/sites/$projectId`). It must use the real `SiteNav` tree structure and inject the full project theme CSS and layout palette.

---

## 2. Technical Architecture & Component Changes

### 2.1 Topbar Divider Line (`EditorPage.tsx`)
- **Location**: `apps/studio/src/features/editor/EditorPage.tsx`
- **Issue**: `<Separator orientation="vertical" className="hidden h-4 sm:block" />` is only 16px tall.
- **Fix**: Update separator className to `"hidden h-7 sm:block self-center mx-0.5"`.
- **Outcome**: Divider visually aligns with the 28px height of the sibling Search pill button and BranchSwitcher dropdown trigger.

### 2.2 Publish Split Dropdown Button (`PublishControl.tsx`)
- **Location**: `apps/studio/src/features/publishing/components/PublishControl.tsx`
- **Issue**: `<DropdownMenuTrigger>` renders a raw button with `h-7`, whereas the main Publish button uses `<Button size="sm" variant="outline" className="h-7 ...">` which applies `min-h-(--control-size-compact)` (32px).
- **Fix**: Wrap `<DropdownMenuTrigger>` with the same `<Button>` primitive using Base UI's `render` prop:
  ```tsx
  <DropdownMenuTrigger
    render={
      <Button
        size="sm"
        variant="outline"
        className="h-7 rounded-s-none border-s-0 px-1.5 hover:bg-muted/60"
        aria-label="Publish options"
      >
        <ChevronDown className="size-3 opacity-70" />
      </Button>
    }
  />
  ```
- **Outcome**: Both buttons share identical `size="sm"`, `variant="outline"`, borders, line-height, and padding, ensuring exact matching height.

### 2.3 Project Preview 1:1 Alignment (`ProjectPreviewPage.tsx`)
- **Location**: `apps/studio/src/features/projects/ProjectPreviewPage.tsx`
- **Navigation Structure**:
  - Use `buildNavTree(pages ?? [], activeLanguage?.code)` from `@cms/site` (or `@cms/shared`) to construct a real hierarchical `NavNode[]` tree from the project's pages.
  - Render `SiteNav` from `@cms/site` in the sidebar instead of the flat custom button list.
  - Display collapsible section headers, railed active indicators, page tags, and Lucide/custom page icons.
- **Palette & Styling**:
  - Generate theme CSS using `projectThemeCss(theme, previewMode)`.
  - Pass `css={projectThemeCss(theme, previewMode)}` to `DocumentationThemeProvider`.
  - Provide `style={{ ...projectThemeVariables(project?.config, previewMode), ...projectThemeStyle(project?.config) }}`.
  - Render the published documentation header (brand logo/title, search trigger, theme switcher, language selector, version selector) so the preview experience mirrors `/sites/$projectId` exactly.

### 2.4 High-Density Operational Overview (`ProjectOverviewPage.tsx`)
- **Location**: `apps/studio/src/features/projects/ProjectOverviewPage.tsx`
- **Key Metrics Row (5 KPI cards)**:
  1. *Total Pages*: Count of published & draft pages vs group categories.
  2. *Translation Coverage*: Percentage of default language pages localized across active languages.
  3. *Content Health*: Count of issues (broken links, grammar warnings) with 1-click triage link.
  4. *Deployments & Authors*: Total successful deploys and active contributors.
  5. *30d Pageviews*: Total views with positive/negative trend badge.
- **Content Health & Translation Completeness Hub**:
  - Per-locale completion bars (e.g., English: 100%, Spanish: 75%, Japanese: 40%).
  - Content audit card highlighting any broken links or hidden drafts with direct navigation to the editor.
- **Operational Two-Column Hub**:
  - *Left Column (Recent Document Updates)*: High-density list/table of recently modified pages with icon, title, relative timestamp, and instant edit action.
  - *Right Column (Deploy & Site Status)*: Live site preview banner with verified domain, latest deployment version badge, author commit message, and one-click "Publish Changes" button.

### 2.5 High-Density Analytics Page (`ProjectAnalyticsPage.tsx`)
- **Location**: `apps/studio/src/features/analytics/ProjectAnalyticsPage.tsx`
- **KPI Metrics Bar**:
  1. Total Pageviews
  2. Unique Visitors
  3. Total Searches
  4. Zero-Results Rate (%)
  5. Search Average Latency (ms)
- **Traffic Timeseries Chart**: Views over time with RangeTabs (7d, 30d, 90d, 12m) and interactive trend tooltip.
- **4-Panel Operational Grid**:
  1. *Top Reading Paths*: High-density path table with relative view percentage bars.
  2. *Search Insights*: Search queries & zero-result search terms.
  3. *Language Distribution*: Traffic breakdown by locale.
  4. *AI Assistant Telemetry*: Answers completed vs failed, estimated cost, and unhandled query reasons.

---

## 3. Verification & Testing Strategy

1. **Unit & Component Tests**:
   - `ProjectOverviewPage.test.tsx`: Verify all 5 KPI cards render, translation completeness calculates accurately, and recent updates table functions.
   - `ProjectAnalyticsPage.test.tsx`: Verify latency KPI, zero-results rate, and timeseries chart render without crashing.
   - `PublishControl.test.tsx`: Verify split button dropdown trigger renders with matching Button primitive and accessible label.
   - `ProjectPreviewPage.test.tsx`: Verify `SiteNav` is rendered with `buildNavTree` nodes, and theme CSS is injected into the provider.
2. **Type Checking & Linting**:
   - Run `pnpm tsc --noEmit` across `apps/studio` and packages.
   - Run `pnpm biome check` to ensure clean code style.
3. **Visual Verification**:
   - Verify topbar divider covers full height of sibling items.
   - Verify publish dropdown button matches main button height pixel-for-pixel.
   - Verify preview sidebar matches the published site sidebar layout and color palette.
