# Navbar Infinite Nested Tabs & NavigationMenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support arbitrary infinite nested navigation tabs (`navbar.tabs`) with a visual hierarchical tree editor in Studio project settings and render multi-level tabs with desktop cascading flyout submenus (`NavigationMenu`) and mobile accordion navigation in ChromeSite UI.

**Architecture:** Recursive Zod schema (`z.lazy`) in `@cms/validators` and shared types in `@cms/shared` define the data model. In Studio, pure tree manipulation utilities power a recursive `TabsTreeEditor` with depth badges, expand/collapse toggles, add-child actions, and reordering. In `@cms/site`, `SiteNavTabs` mounts beneath the main header in `SiteLayout.tsx` using `@cms/design-system`'s `NavigationMenu` with cascading flyout submenus and mobile accordion integration in `MobileNav`.

**Tech Stack:** React 19, TypeScript, Zod, `@base-ui/react/navigation-menu`, `@tanstack/react-form`, Tailwind CSS, Lucide React, Vitest.

## Global Constraints

- Exclusively for internal company deployment; no billing, plans, tiers, or public marketing landing pages.
- Preservation of backward compatibility: flat tabs arrays `[{ label, href, external }]` remain fully valid.
- Zero external package additions (all required primitives exist in `@base-ui/react` and workspace packages).
- Pure immutable operations for tree mutations in the Studio editor to ensure predictable TanStack Form state and dirty tracking.

---

### Task 1: Fix `NavigationMenu` Import in `@cms/design-system`

**Files:**
- Modify: `packages/design-system/src/components/ui/navigation-menu.tsx:1-10`

**Interfaces:**
- Produces: Correctly exported `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, `NavigationMenuLink`, `NavigationMenuPositioner` consuming the internal `@cms/design-system/lib/utils` `cn` helper.

- [ ] **Step 1: Inspect and fix the `cn` import**

In `packages/design-system/src/components/ui/navigation-menu.tsx`, change:
```tsx
import { cn } from "cn"
```
to:
```tsx
import { cn } from '../../lib/utils'
```

- [ ] **Step 2: Verify typecheck passes in `@cms/design-system`**

Run: `bun run typecheck` in `packages/design-system`
Expected: Exited with code 0.

- [ ] **Step 3: Commit the change**

```bash
git add packages/design-system/src/components/ui/navigation-menu.tsx
git commit -m "fix(design-system): use local cn utility in navigation-menu"
```

---

### Task 2: Implement Recursive `navTabItemSchema` in `@cms/validators` with Tests

**Files:**
- Modify: `packages/validators/src/index.ts:80-90, 285-300, 420-435`
- Test: `packages/validators/src/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NavTabItem = {
    label: string;
    href?: string;
    external?: boolean;
    items?: NavTabItem[];
  };
  export const navTabItemSchema: z.ZodType<NavTabItem>;
  ```
  Updated `projectConfigSchema.navbar.tabs` and `languageConfigSchema.navbar.tabs` accepting `z.array(navTabItemSchema).max(30).optional()`.

- [ ] **Step 1: Write failing schema tests in `packages/validators/src/schema.test.ts`**

Add tests to `packages/validators/src/schema.test.ts`:
```ts
describe('navTabItemSchema & navbar.tabs recursive validation', () => {
  it('validates a flat list of tabs for backward compatibility', () => {
    const flatTabs = [
      { label: 'Guides', href: '/guides' },
      { label: 'API', href: 'https://api.example.com', external: true },
    ];
    const parsed = projectConfigSchema.safeParse({ navbar: { tabs: flatTabs } });
    expect(parsed.success).toBe(true);
  });

  it('validates infinite nested tabs with arbitrary depth', () => {
    const nestedTabs: NavTabItem[] = [
      {
        label: 'Products',
        items: [
          {
            label: 'Cloud',
            href: '/products/cloud',
            items: [
              {
                label: 'Storage',
                href: '/products/cloud/storage',
                items: [
                  { label: 'S3 Compatible', href: '/products/cloud/storage/s3' },
                ],
              },
            ],
          },
        ],
      },
    ];
    const parsed = projectConfigSchema.safeParse({ navbar: { tabs: nestedTabs } });
    expect(parsed.success).toBe(true);
  });

  it('allows parent tab items with empty or omitted href', () => {
    const parsed = projectConfigSchema.safeParse({
      navbar: {
        tabs: [
          { label: 'Docs', items: [{ label: 'Overview', href: '/overview' }] },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects tab item without label', () => {
    const parsed = projectConfigSchema.safeParse({
      navbar: {
        tabs: [{ href: '/test' } as any],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/validators/src/schema.test.ts`
Expected: Fails because `NavTabItem` is not yet defined or `projectConfigSchema` rejects `items`.

- [ ] **Step 3: Implement `navTabItemSchema` in `packages/validators/src/index.ts`**

Add `NavTabItem` and `navTabItemSchema`:
```ts
export type NavTabItem = {
  label: string;
  href?: string;
  external?: boolean;
  items?: NavTabItem[];
};

export const navTabItemSchema: z.ZodType<NavTabItem> = z.lazy(() =>
  z
    .object({
      label: z.string().trim().min(1).max(80),
      href: z.string().trim().max(500).optional().or(z.literal('')),
      external: z.boolean().optional(),
      items: z.array(navTabItemSchema).max(30).optional(),
    })
    .strict()
);
```

Update `projectConfigSchema` navbar section:
```ts
tabs: z.array(navTabItemSchema).max(30).optional(),
```

Update `languageConfigSchema` navbar section:
```ts
tabs: z.array(navTabItemSchema).max(30).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/validators/src/schema.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/index.ts packages/validators/src/schema.test.ts
git commit -m "feat(validators): support recursive navTabItemSchema for infinite nested tabs"
```

---

### Task 3: Update Snapshot Types in `@cms/shared`

**Files:**
- Modify: `packages/shared/src/site.ts:20-45`
- Test: `packages/shared/src/site.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SnapshotNavTabItem {
    label: string;
    href?: string;
    external?: boolean;
    items?: SnapshotNavTabItem[];
  }
  ```
  Updated `SnapshotLanguageConfig.navbar.tabs?: SnapshotNavTabItem[]`.

- [ ] **Step 1: Write test for `mergeLanguageChrome` with nested tabs in `packages/shared/src/site.test.ts`**

Add a test case in `packages/shared/src/site.test.ts`:
```ts
it('merges localized nested navbar tabs wholesale', () => {
  const baseConfig = {
    navbar: {
      tabs: [
        { label: 'Docs', items: [{ label: 'Quickstart', href: '/docs/quickstart' }] },
      ],
    },
  };
  const langConfig = {
    navbar: {
      tabs: [
        { label: 'Tài liệu', items: [{ label: 'Bắt đầu', href: '/vi/docs/quickstart' }] },
      ],
    },
  };
  const merged = mergeLanguageChrome(baseConfig, langConfig);
  expect(merged?.navbar).toEqual({
    tabs: [
      { label: 'Tài liệu', items: [{ label: 'Bắt đầu', href: '/vi/docs/quickstart' }] },
    ],
  });
});
```

- [ ] **Step 2: Update `packages/shared/src/site.ts`**

Export `SnapshotNavTabItem` and update `SnapshotLanguageConfig`:
```ts
export interface SnapshotNavTabItem {
  label: string;
  href?: string;
  external?: boolean;
  items?: SnapshotNavTabItem[];
}
```
Update line 38 of `packages/shared/src/site.ts`:
```ts
navbar?: { ctaLabel?: string; links?: SnapshotNavLink[]; tabs?: SnapshotNavTabItem[]; anchors?: SnapshotNavAnchor[] } | null;
```

- [ ] **Step 3: Run shared package tests**

Run: `bun test packages/shared/src/site.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/site.ts packages/shared/src/site.test.ts
git commit -m "feat(shared): define SnapshotNavTabItem with recursive items support"
```

---

### Task 4: Implement Pure Tree Helpers & Tests in Studio (`tabs-tree-utils.ts`)

**Files:**
- Create: `apps/studio/src/features/project-settings/components/tabs-tree-utils.ts`
- Create: `apps/studio/src/features/project-settings/components/tabs-tree-utils.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function insertTabChild(tree: NavTabItem[], path: number[], newChild: NavTabItem): NavTabItem[];
  export function updateTabNode(tree: NavTabItem[], path: number[], patch: Partial<NavTabItem>): NavTabItem[];
  export function removeTabNode(tree: NavTabItem[], path: number[]): NavTabItem[];
  export function moveTabNode(tree: NavTabItem[], path: number[], direction: 'up' | 'down'): NavTabItem[];
  export function cleanTabItems(items: NavTabItem[]): NavTabItem[];
  ```

- [ ] **Step 1: Write unit tests in `tabs-tree-utils.test.ts`**

Create `apps/studio/src/features/project-settings/components/tabs-tree-utils.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { NavTabItem } from '@cms/validators';
import {
  cleanTabItems,
  insertTabChild,
  moveTabNode,
  removeTabNode,
  updateTabNode,
} from './tabs-tree-utils';

describe('tabs-tree-utils', () => {
  const sampleTree: NavTabItem[] = [
    {
      label: 'Tab 1',
      href: '/tab-1',
      items: [
        { label: 'Sub 1.1', href: '/sub-1-1' },
        { label: 'Sub 1.2', href: '/sub-1-2' },
      ],
    },
    { label: 'Tab 2', href: '/tab-2' },
  ];

  it('updates a nested tab node', () => {
    const updated = updateTabNode(sampleTree, [0, 1], { label: 'Sub 1.2 Renamed' });
    expect(updated[0].items?.[1].label).toBe('Sub 1.2 Renamed');
    expect(sampleTree[0].items?.[1].label).toBe('Sub 1.2'); // immutability
  });

  it('inserts a child node at deep path', () => {
    const updated = insertTabChild(sampleTree, [0, 1], { label: 'Deep 1.2.1', href: '/deep' });
    expect(updated[0].items?.[1].items?.[0].label).toBe('Deep 1.2.1');
  });

  it('removes a nested node', () => {
    const updated = removeTabNode(sampleTree, [0, 0]);
    expect(updated[0].items?.length).toBe(1);
    expect(updated[0].items?.[0].label).toBe('Sub 1.2');
  });

  it('moves siblings up and down', () => {
    const movedDown = moveTabNode(sampleTree, [0, 0], 'down');
    expect(movedDown[0].items?.[0].label).toBe('Sub 1.2');
    expect(movedDown[0].items?.[1].label).toBe('Sub 1.1');

    const movedUp = moveTabNode(movedDown, [0, 1], 'up');
    expect(movedUp[0].items?.[0].label).toBe('Sub 1.1');
  });

  it('cleans empty nodes and trims whitespace recursively', () => {
    const dirtyTree: NavTabItem[] = [
      { label: '  Valid  ', href: ' /valid ', items: [{ label: '   ', href: '' }] },
      { label: '', href: '' },
    ];
    const cleaned = cleanTabItems(dirtyTree);
    expect(cleaned).toEqual([
      { label: 'Valid', href: '/valid' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/studio/src/features/project-settings/components/tabs-tree-utils.test.ts`
Expected: Fails with "cannot find module `./tabs-tree-utils`".

- [ ] **Step 3: Implement `tabs-tree-utils.ts`**

Create `apps/studio/src/features/project-settings/components/tabs-tree-utils.ts`:
```ts
import type { NavTabItem } from '@cms/validators';

export function updateTabNode(tree: NavTabItem[], path: number[], patch: Partial<NavTabItem>): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== index) return node;
    if (rest.length === 0) {
      return { ...node, ...patch };
    }
    return {
      ...node,
      items: updateTabNode(node.items ?? [], rest, patch),
    };
  });
}

export function insertTabChild(tree: NavTabItem[], path: number[], newChild: NavTabItem): NavTabItem[] {
  if (path.length === 0) {
    return [...tree, newChild];
  }
  const [index, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== index) return node;
    if (rest.length === 0) {
      return {
        ...node,
        items: [...(node.items ?? []), newChild],
      };
    }
    return {
      ...node,
      items: insertTabChild(node.items ?? [], rest, newChild),
    };
  });
}

export function removeTabNode(tree: NavTabItem[], path: number[]): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    return tree.filter((_, i) => i !== index);
  }
  return tree.map((node, i) => {
    if (i !== index) return node;
    return {
      ...node,
      items: removeTabNode(node.items ?? [], rest),
    };
  });
}

export function moveTabNode(tree: NavTabItem[], path: number[], direction: 'up' | 'down'): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tree.length) return tree;
    const next = [...tree];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    return next;
  }
  return tree.map((node, i) => {
    if (i !== index) return node;
    return {
      ...node,
      items: moveTabNode(node.items ?? [], rest, direction),
    };
  });
}

export function cleanTabItems(items: NavTabItem[]): NavTabItem[] {
  return items
    .map((item) => {
      const cleanedLabel = item.label?.trim() ?? '';
      const cleanedHref = item.href?.trim() ?? '';
      const cleanedChildren = item.items ? cleanTabItems(item.items) : [];

      if (!cleanedLabel && !cleanedHref && cleanedChildren.length === 0) {
        return null;
      }

      const res: NavTabItem = {
        label: cleanedLabel,
        href: cleanedHref || undefined,
        external: item.external ? true : undefined,
      };

      if (cleanedChildren.length > 0) {
        res.items = cleanedChildren;
      }

      return res;
    })
    .filter((item): item is NavTabItem => item !== null && item.label.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/studio/src/features/project-settings/components/tabs-tree-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/tabs-tree-utils.ts apps/studio/src/features/project-settings/components/tabs-tree-utils.test.ts
git commit -m "feat(studio): add immutable tree manipulation utilities and tests for navbar tabs"
```

---

### Task 5: Build `TabsTreeEditor` in `navbar-section.tsx` in Studio

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/navbar-section.tsx`

**Interfaces:**
- Consumes: `NavTabItem` from `@cms/validators`, `insertTabChild`, `updateTabNode`, `removeTabNode`, `moveTabNode`, `cleanTabItems` from `./tabs-tree-utils`.
- Produces: Visual hierarchical editor for infinite nested tabs supporting label, URL, external toggle, depth badges, add-child, reordering, and expand/collapse.

- [ ] **Step 1: Update `NavbarValues` and form interfaces in `navbar-section.tsx`**

In `navbar-section.tsx`:
Change `tabs: NavRow[]` to `tabs: NavTabItem[]` in `NavbarValues`.
In `ProjectNavbarForm`:
Replace `tabs: cleanRows(value.tabs)` with `tabs: cleanTabItems(value.tabs)`.
In `LanguageNavbarForm`:
Replace `tabs: cleanRows(value.tabs)` with `tabs: cleanTabItems(value.tabs)`.

- [ ] **Step 2: Implement the `TabsTreeEditor` and recursive `TabTreeNodeItem` components**

In `navbar-section.tsx`, replace the flat `form.Field mode="array" name="tabs"` block with `TabsTreeEditor`:
```tsx
interface TabsTreeEditorProps {
  value: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
  direction?: 'ltr' | 'rtl';
}

function TabsTreeEditor({ value, onChange, direction }: TabsTreeEditorProps) {
  const t = useT();

  const handleAddRoot = () => {
    onChange([...value, { label: '', href: '' }]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="space-y-1.5 overflow-hidden rounded-xl border border-border p-2">
          {value.map((item, index) => (
            <TabTreeNodeItem
              key={index}
              item={item}
              path={[index]}
              depth={0}
              isFirst={index === 0}
              isLast={index === value.length - 1}
              onChange={onChange}
              tree={value}
              direction={direction}
            />
          ))}
        </div>
      ) : null}
      <Button
        className="mb-1.5 border-dashed text-muted-foreground"
        onClick={handleAddRoot}
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" /> {t('settings.navbar.tabs.add')}
      </Button>
    </div>
  );
}
```

Implement `TabTreeNodeItem`:
- Renders indentation line guides based on `depth * 20px`.
- Renders level badge: `L${depth + 1}`.
- If `item.items && item.items.length > 0`: renders expand/collapse button (`ChevronDown` / `ChevronRight`).
- Renders `Input` for label and `Input` for href (`placeholder={item.items?.length ? '(Dropdown group)' : '/guides'}`).
- Renders `ExternalLink` toggle button.
- Action buttons:
  - Add Sub-tab (`Plus` with title `Add sub-tab`).
  - Move Up (`ChevronUp`).
  - Move Down (`ChevronDown`).
  - Delete (`X`).
- If expanded and `item.items.length > 0`: recursively renders `item.items.map((child, childIdx) => <TabTreeNodeItem ... />)`.

- [ ] **Step 3: Verify Studio compiles and tests pass**

Run: `bun run typecheck` in `apps/studio`
Expected: Exited with code 0.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar-section.tsx
git commit -m "feat(studio): integrate recursive TabsTreeEditor in navbar settings"
```

---

### Task 6: Build `SiteNavTabs` with Cascading Flyout Submenus in `@cms/site` with Tests

**Files:**
- Create: `packages/site/src/components/site-nav-tabs.tsx`
- Create: `packages/site/src/components/site-nav-tabs.test.tsx`

**Interfaces:**
- Consumes: `SnapshotNavTabItem` from `@cms/shared`, `NavigationMenu` primitives from `@cms/design-system/components/ui/navigation-menu`.
- Produces: `<SiteNavTabs tabs={tabs} currentPath={currentPath} projectId={projectId} lang={lang} version={version} basePath={basePath} />`.

- [ ] **Step 1: Write component tests in `packages/site/src/components/site-nav-tabs.test.tsx`**

Create `packages/site/src/components/site-nav-tabs.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteNavTabs } from './site-nav-tabs';
import type { SnapshotNavTabItem } from '@cms/shared';

describe('SiteNavTabs', () => {
  const tabs: SnapshotNavTabItem[] = [
    { label: 'Overview', href: '/overview' },
    {
      label: 'Products',
      items: [
        { label: 'Cloud DB', href: '/products/db' },
        {
          label: 'Storage',
          items: [
            { label: 'Block Storage', href: '/products/storage/block' },
          ],
        },
      ],
    },
  ];

  it('renders top-level tab links and triggers', () => {
    const { container } = render(
      <SiteNavTabs tabs={tabs} currentPath="/overview" projectId="proj-1" />
    );
    expect(screen.getByText('Overview')).toBeDefined();
    expect(screen.getByText('Products')).toBeDefined();
  });

  it('marks active tab link', () => {
    const { container } = render(
      <SiteNavTabs tabs={tabs} currentPath="/overview" projectId="proj-1" />
    );
    const overviewLink = screen.getByText('Overview').closest('a');
    expect(overviewLink?.getAttribute('data-active')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- packages/site/src/components/site-nav-tabs.test.tsx`
Expected: Fails with "cannot find module `./site-nav-tabs`".

- [ ] **Step 3: Implement `SiteNavTabs` in `packages/site/src/components/site-nav-tabs.tsx`**

Implement `SiteNavTabs` utilizing:
- `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, `NavigationMenuLink`, `NavigationMenuPositioner` from `@cms/design-system/components/ui/navigation-menu`.
- Top-level items:
  - If leaf: `<NavigationMenuLink asChild><a href={resolveHref(tab.href)} ...>{tab.label}</a></NavigationMenuLink>`.
  - If branch: `<NavigationMenuItem><NavigationMenuTrigger>{tab.label}</NavigationMenuTrigger><NavigationMenuContent><CascadingSubmenu items={tab.items} ... /></NavigationMenuContent></NavigationMenuItem>`.
- `CascadingSubmenu`:
  - Recursively renders child items.
  - For items with sub-items, renders a button with `ChevronRight` and reveals a floating flyout on hover/focus (`relative group/sub`).
  - Active detection highlights items matching `currentPath`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- packages/site/src/components/site-nav-tabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/components/site-nav-tabs.tsx packages/site/src/components/site-nav-tabs.test.tsx
git commit -m "feat(site): build SiteNavTabs component with cascading flyout submenus"
```

---

### Task 7: Integrate `SiteNavTabs` into `SiteLayout.tsx`

**Files:**
- Modify: `packages/site/src/views/SiteLayout.tsx:180-210, 310-330`

**Interfaces:**
- Consumes: `SiteNavTabs` from `../components/site-nav-tabs`.
- Produces: SiteLayout rendering secondary tab row in sticky header shell when `navTabs.length > 0`.

- [ ] **Step 1: Update `SiteLayout.tsx`**

Import `SiteNavTabs`:
```tsx
import { SiteNavTabs } from '../components/site-nav-tabs';
```
In `SiteLayout.tsx` header shell:
```tsx
header={
  <div
    ref={observeHeader}
    className="sticky top-0 z-30 border-border/70 border-b bg-background/80 backdrop-blur-md"
    data-theme-region="header-shell"
  >
    <header ...>
      ...
    </header>
    {navTabs.length > 0 && (
      <div className="border-border/60 border-t">
        <div className="mx-auto flex max-w-[90rem] items-center px-4 sm:px-6">
          <SiteNavTabs
            tabs={navTabs}
            currentPath={effectiveCurrentPath}
            projectId={projectId}
            lang={navigationLanguage}
            version={activeVersionPrefix}
            basePath={basePrefix}
          />
        </div>
      </div>
    )}
  </div>
}
```

- [ ] **Step 2: Run site tests to ensure no regressions**

Run: `bun run test` in `packages/site`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/views/SiteLayout.tsx
git commit -m "feat(site): render SiteNavTabs in secondary header row in SiteLayout"
```

---

### Task 8: Update `MobileNav.tsx` with Nested Tabs Accordion

**Files:**
- Modify: `packages/site/src/components/mobile-nav.tsx`

**Interfaces:**
- Consumes: `SnapshotNavTabItem` from `@cms/shared`.
- Produces: Collapsible mobile navigation accordion tree for multi-level tabs inside mobile drawer Sheet.

- [ ] **Step 1: Pass `tabs?: SnapshotNavTabItem[]` to `MobileNav`**

In `packages/site/src/views/SiteLayout.tsx`:
Pass `tabs={navTabs}` to `<MobileNav ... />`.

In `packages/site/src/components/mobile-nav.tsx`:
Add `tabs?: SnapshotNavTabItem[]` to props.
When `tabs && tabs.length > 0`, render a "Navigation" group with recursive collapsible accordion items for nested tabs so all sub-tabs are accessible on mobile devices.

- [ ] **Step 2: Run tests in `packages/site`**

Run: `bun run test` in `packages/site`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/components/mobile-nav.tsx packages/site/src/views/SiteLayout.tsx
git commit -m "feat(site): render nested tabs accordion in MobileNav drawer"
```

---

### Task 9: Full Workspace Typecheck & Test Suite Verification

**Files:**
- Workspace-wide verification across `@cms/validators`, `@cms/shared`, `@cms/design-system`, `@cms/site`, and `apps/studio`.

- [ ] **Step 1: Typecheck packages**

Run:
- `bun run typecheck` in `packages/design-system`
- `bun run typecheck` in `packages/validators`
- `bun run typecheck` in `packages/shared`
- `bun run typecheck` in `packages/site`
- `bun run typecheck` in `apps/studio`
Expected: All exit with code 0.

- [ ] **Step 2: Run all workspace tests**

Run:
- `bun test` in `packages/validators`
- `bun test` in `packages/shared`
- `bun test` in `packages/site`
Expected: All tests pass.

- [ ] **Step 3: Commit any final polish and update implementation log**

```bash
git add -A
git commit -m "chore: verify navbar infinite nested tabs and navigation menu integration"
```
