# Navbar Section Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 713-line god file `apps/studio/src/features/project-settings/components/navbar-section.tsx` into a modular, clean, and testable `components/navbar/` directory following the architecture established in `components/theme/`, preserving 100% backward compatibility and type safety.

**Architecture:** Split responsibilities into focused sub-components under `apps/studio/src/features/project-settings/components/navbar/`: data contracts in `types.ts`, pure data sanitizers in `navbar-utils.ts`, recursive tree editing in `tab-tree-node-item.tsx` and `tabs-tree-editor.tsx`, array fields in `navbar-links-field.tsx` and `navbar-anchors-field.tsx`, scope form presentation in `navbar-scope-form.tsx`, scope containers in `project-navbar-form.tsx` and `language-navbar-form.tsx`, and section orchestration in `navbar-section.tsx`. A backward-compatible barrel in `components/navbar-section.tsx` guarantees existing consumers remain unbroken.

**Tech Stack:** React 19, `@tanstack/react-form`, TypeScript, Lucide Icons, Vitest, Bun.

## Global Constraints

- Deployed exclusively for internal company use (NO plan, billing, pricing, or public marketing pages).
- Preserve `FormNavTabItem = Omit<NavTabItem, 'items'> & { items?: unknown[] }` in form state typing to avoid TS2589 infinite recursion depth in TanStack Form `DeepKeys`.
- Use immutable tree operations from `../tabs-tree-utils.ts`.
- Maintain strict typecheck compliance with `bun run --filter @cms/studio typecheck`.
- Maintain 100% test pass rate with `bun run --filter @cms/studio test`.

---

### Task 1: Navbar Types & Data Normalization Utils

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/types.ts`
- Create: `apps/studio/src/features/project-settings/components/navbar/navbar-utils.ts`
- Test: `apps/studio/src/features/project-settings/components/navbar/navbar-utils.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `NavRow`, `AnchorRow`, `FormNavTabItem`, `NavbarValues`, `GlobalNavbarPreview`
  - `navbar-utils.ts`:
    - `cleanRows(rows: NavRow[]): Array<{ label: string; href: string; external?: boolean }>`
    - `cleanAnchorRows(rows: AnchorRow[]): Array<{ label: string; href: string; icon?: string; external?: boolean }>`
    - `normalizeTabs(items?: unknown[]): NavTabItem[]`

- [ ] **Step 1: Write the failing unit tests for navbar-utils**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-utils.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { cleanAnchorRows, cleanRows, normalizeTabs } from './navbar-utils';

describe('navbar-utils', () => {
  describe('cleanRows', () => {
    it('filters out empty and whitespace-only rows', () => {
      const rows = [
        { label: 'Docs', href: '/docs', external: false },
        { label: '   ', href: '   ' },
        { label: 'Blog', href: 'https://example.com/blog', external: true },
      ];
      expect(cleanRows(rows)).toEqual([
        { label: 'Docs', href: '/docs', external: false },
        { label: 'Blog', href: 'https://example.com/blog', external: true },
      ]);
    });
  });

  describe('cleanAnchorRows', () => {
    it('filters empty rows and strips empty icon strings', () => {
      const rows = [
        { label: 'GitHub', href: 'https://github.com', icon: 'github', external: true },
        { label: 'Discord', href: '/chat', icon: '  ' },
        { label: '   ', href: '' },
      ];
      expect(cleanAnchorRows(rows)).toEqual([
        { label: 'GitHub', href: 'https://github.com', icon: 'github', external: true },
        { label: 'Discord', href: '/chat', icon: undefined, external: undefined },
      ]);
    });
  });

  describe('normalizeTabs', () => {
    it('normalizes raw json objects and recursively preserves items', () => {
      const raw = [
        {
          label: 'Guides',
          href: '/guides',
          external: false,
          items: [
            { label: 'Quickstart', href: '/guides/quickstart' },
            { label: 'Advanced', href: '/guides/advanced', external: true, items: [] },
          ],
        },
        null,
        { label: 'API Reference' },
      ];

      expect(normalizeTabs(raw)).toEqual([
        {
          label: 'Guides',
          href: '/guides',
          external: false,
          items: [
            { label: 'Quickstart', href: '/guides/quickstart', external: false, items: undefined },
            { label: 'Advanced', href: '/guides/advanced', external: true, items: undefined },
          ],
        },
        { label: '', href: '', external: false, items: undefined },
        { label: 'API Reference', href: '', external: false, items: undefined },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @cms/studio test src/features/project-settings/components/navbar/navbar-utils.test.ts`
Expected: FAIL with "Cannot find module './navbar-utils'"

- [ ] **Step 3: Write types.ts and navbar-utils.ts**

Create `apps/studio/src/features/project-settings/components/navbar/types.ts`:
```typescript
import type { NavTabItem } from '@cms/validators';

export interface NavRow {
  label: string;
  href: string;
  external?: boolean;
}

export interface AnchorRow extends NavRow {
  icon: string;
}

/** Prevent TanStack Form DeepKeys infinite recursion by breaking the cycle in the form state type */
export type FormNavTabItem = Omit<NavTabItem, 'items'> & {
  items?: unknown[];
};

/** The editable navbar values shared by project scope and language scopes */
export interface NavbarValues {
  ctaLabel: string;
  ctaUrl: string;
  links: NavRow[];
  tabs: FormNavTabItem[];
  anchors: AnchorRow[];
}

export interface GlobalNavbarPreview {
  ctaUrl: string;
  showSearch: boolean;
  changelog: boolean;
}
```

Create `apps/studio/src/features/project-settings/components/navbar/navbar-utils.ts`:
```typescript
import type { NavTabItem } from '@cms/validators';
import type { AnchorRow, NavRow } from './types';

export const cleanRows = (rows: NavRow[]): Array<{ label: string; href: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      external: row.external,
    }));

export const cleanAnchorRows = (rows: AnchorRow[]): Array<{ label: string; href: string; icon?: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      icon: row.icon.trim() || undefined,
      external: row.external,
    }));

export const normalizeTabs = (items?: unknown[]): NavTabItem[] =>
  (items ?? []).map((tab) => {
    const item = typeof tab === 'object' && tab !== null ? (tab as Record<string, unknown>) : {};
    return {
      label: typeof item.label === 'string' ? item.label : '',
      href: typeof item.href === 'string' ? item.href : '',
      external: Boolean(item.external),
      items: Array.isArray(item.items) && item.items.length > 0 ? normalizeTabs(item.items) : undefined,
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @cms/studio test src/features/project-settings/components/navbar/navbar-utils.test.ts`
Expected: PASS (3 tests passing)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/types.ts apps/studio/src/features/project-settings/components/navbar/navbar-utils.ts apps/studio/src/features/project-settings/components/navbar/navbar-utils.test.ts
git commit -m "feat(settings): add navbar types and normalization utilities"
```

---

### Task 2: Recursive Tab Tree Node Item & Tabs Tree Editor

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/tab-tree-node-item.tsx`
- Create: `apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.tsx`
- Test: `apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.test.tsx`

**Interfaces:**
- Consumes: `tabs-tree-utils.ts` (`insertTabChild`, `updateTabNode`, `removeTabNode`, `moveTabNode`)
- Produces:
  - `TabTreeNodeItem`: Individual recursive tree item with collapse, depth badge, inputs, and move controls.
  - `TabsTreeEditor`: Tree root container component.

- [ ] **Step 1: Write the failing component test for TabsTreeEditor**

Create `apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.test.tsx`:
```typescript
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { NavTabItem } from '@cms/validators';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TabsTreeEditor } from './tabs-tree-editor';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

describe('TabsTreeEditor', () => {
  afterEach(cleanup);

  it('renders root items and fires onChange on add root button click', () => {
    const onChange = vi.fn();
    const items: NavTabItem[] = [{ label: 'Docs', href: '/docs' }];

    render(<TabsTreeEditor onChange={onChange} value={items} />);

    expect(screen.getByDisplayValue('Docs')).toBeDefined();
    expect(screen.getByDisplayValue('/docs')).toBeDefined();

    const addBtn = screen.getByRole('button', { name: /settings.navbar.tabs.add/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith([
      { label: 'Docs', href: '/docs' },
      { label: '', href: '' },
    ]);
  });

  it('allows adding a sub-tab to an existing node', () => {
    const onChange = vi.fn();
    const items: NavTabItem[] = [{ label: 'Docs', href: '/docs' }];

    render(<TabsTreeEditor onChange={onChange} value={items} />);

    const subTabBtn = screen.getByRole('button', { name: /Add sub-tab/i });
    fireEvent.click(subTabBtn);

    expect(onChange).toHaveBeenCalledWith([
      {
        label: 'Docs',
        href: '/docs',
        items: [{ label: '', href: '' }],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @cms/studio test src/features/project-settings/components/navbar/tabs-tree-editor.test.tsx`
Expected: FAIL with "Cannot find module './tabs-tree-editor'"

- [ ] **Step 3: Implement TabTreeNodeItem and TabsTreeEditor**

Create `apps/studio/src/features/project-settings/components/navbar/tab-tree-node-item.tsx`:
```typescript
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { ChevronDown, ChevronRight, ChevronUp, CornerDownRight, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO } from '../shared';
import { insertTabChild, moveTabNode, removeTabNode, updateTabNode } from '../tabs-tree-utils';

export interface TabTreeNodeProps {
  item: NavTabItem;
  path: number[];
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  direction?: 'ltr' | 'rtl';
  tree: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
}

export function TabTreeNodeItem({ item, path, depth, isFirst, isLast, direction, tree, onChange }: TabTreeNodeProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(item.items && item.items.length > 0);

  const handleUpdate = (patch: Partial<NavTabItem>) => {
    onChange(updateTabNode(tree, path, patch));
  };

  const handleAddChild = () => {
    onChange(insertTabChild(tree, path, { label: '', href: '' }));
    setExpanded(true);
  };

  const handleRemove = () => {
    onChange(removeTabNode(tree, path));
  };

  const handleMove = (dir: 'up' | 'down') => {
    onChange(moveTabNode(tree, path, dir));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2 text-xs transition-colors hover:border-border">
        {hasChildren ? (
          <Button
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center font-bold text-muted-foreground/40">•</span>
        )}

        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">L{depth + 1}</span>

        <Input
          className={cn(FIELD_COMPACT, 'min-w-[130px] flex-1')}
          dir={direction ?? 'auto'}
          onChange={(e) => handleUpdate({ label: e.target.value })}
          placeholder={t('settings.navbar.tabs.labelPlaceholder')}
          value={item.label}
        />

        <Input
          className={cn(FIELD_COMPACT_MONO, 'min-w-[140px] flex-1')}
          dir="ltr"
          onChange={(e) => handleUpdate({ href: e.target.value })}
          placeholder={hasChildren ? '(Optional for group)' : '/guides'}
          value={item.href ?? ''}
        />

        <Button
          aria-label={item.external ? 'External link enabled' : 'External link disabled'}
          className={cn(
            'size-7 shrink-0 text-xs',
            item.external ? 'border border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleUpdate({ external: !item.external })}
          size="icon-xs"
          title="Open in new window (external)"
          type="button"
          variant="ghost"
        >
          <ExternalLink className="size-3.5" />
        </Button>

        <div className="flex items-center gap-0.5 border-border/50 border-s ps-1.5">
          <Button
            aria-label="Add sub-tab"
            className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleAddChild}
            size="sm"
            title="Add sub-tab"
            type="button"
            variant="ghost"
          >
            <CornerDownRight className="me-1 size-3" />
            <span>Sub-tab</span>
          </Button>

          <Button
            aria-label="Move up"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isFirst}
            onClick={() => handleMove('up')}
            size="icon-xs"
            title="Move up"
            type="button"
            variant="ghost"
          >
            <ChevronUp className="size-3.5" />
          </Button>

          <Button
            aria-label="Move down"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isLast}
            onClick={() => handleMove('down')}
            size="icon-xs"
            title="Move down"
            type="button"
            variant="ghost"
          >
            <ChevronDown className="size-3.5" />
          </Button>

          <Button
            aria-label={t('settings.navbar.tabs.remove')}
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            size="icon-xs"
            title="Remove tab"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="mt-1.5 ms-4 space-y-1.5 border-border/60 border-s ps-3">
          {item.items?.map((child, index) => (
            <TabTreeNodeItem
              depth={depth + 1}
              direction={direction}
              isFirst={index === 0}
              isLast={index === (item.items?.length ?? 1) - 1}
              item={child}
              key={`${path.join('-')}-${child.href || child.label || index}`}
              onChange={onChange}
              path={[...path, index]}
              tree={tree}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.tsx`:
```typescript
import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { Plus } from 'lucide-react';
import { TabTreeNodeItem } from './tab-tree-node-item';

export function TabsTreeEditor({
  value,
  onChange,
  direction,
}: {
  value: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  const handleAddRoot = () => {
    onChange([...value, { label: '', href: '' }]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="space-y-2 overflow-hidden rounded-xl border border-border/80 bg-muted/20 p-2.5">
          {value.map((item, index) => (
            <TabTreeNodeItem
              depth={0}
              direction={direction}
              isFirst={index === 0}
              isLast={index === value.length - 1}
              item={item}
              key={`root-${item.href || item.label || index}`}
              onChange={onChange}
              path={[index]}
              tree={value}
            />
          ))}
        </div>
      ) : null}
      <Button className="mb-1.5 border-dashed text-muted-foreground" onClick={handleAddRoot} type="button" variant="outline">
        <Plus className="size-3.5" /> {t('settings.navbar.tabs.add')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @cms/studio test src/features/project-settings/components/navbar/tabs-tree-editor.test.tsx`
Expected: PASS (2 tests passing)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/tab-tree-node-item.tsx apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.tsx apps/studio/src/features/project-settings/components/navbar/tabs-tree-editor.test.tsx
git commit -m "feat(settings): extract recursive tabs tree editor components"
```

---

### Task 3: Navbar Links Field & Anchors Field Components

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/navbar-links-field.tsx`
- Create: `apps/studio/src/features/project-settings/components/navbar/navbar-anchors-field.tsx`

**Interfaces:**
- Consumes: `types.ts` (`NavRow`, `AnchorRow`, `NavbarValues`)
- Produces:
  - `NavbarLinksField`: Form subcomponent rendering header link inputs and add/remove buttons.
  - `NavbarAnchorsField`: Form subcomponent rendering header anchor inputs (including icon) and add/remove buttons.

- [ ] **Step 1: Create NavbarLinksField**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-links-field.tsx`:
```typescript
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { AnyFormApi } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO, GroupLabel } from '../shared';
import type { NavbarValues } from './types';

export function NavbarLinksField({
  form,
  direction,
}: {
  form: AnyFormApi;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  return (
    <>
      <GroupLabel className="mb-2.5">{t('settings.navbar.links.label')}</GroupLabel>
      <form.Field mode="array" name="links">
        {(field: { state: { value: NavbarValues['links'] }; removeValue: (i: number) => void; pushValue: (row: NavbarValues['links'][number]) => void }) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border">
                {field.state.value.map((_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
                  <div className="flex items-center gap-2.5 border-border border-b p-3 last:border-b-0" key={index}>
                    <form.Field name={`links[${index}].label`}>
                      {(sub: { state: { value: string }; handleChange: (val: string) => void }) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'flex-1')}
                          dir={direction ?? 'auto'}
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.links.labelPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`links[${index}].href`}>
                      {(sub: { state: { value: string }; handleChange: (val: string) => void }) => (
                        <Input
                          className={cn(FIELD_COMPACT_MONO, 'flex-1')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder="/docs"
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <Button
                      aria-label={t('settings.navbar.links.remove')}
                      className="text-muted-foreground"
                      onClick={() => field.removeValue(index)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button
              className="mb-1.5 border-dashed text-muted-foreground"
              onClick={() => field.pushValue({ label: '', href: '', external: undefined })}
              type="button"
              variant="outline"
            >
              <Plus className="size-3.5" /> {t('settings.navbar.links.add')}
            </Button>
          </>
        )}
      </form.Field>
    </>
  );
}
```

- [ ] **Step 2: Create NavbarAnchorsField**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-anchors-field.tsx`:
```typescript
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { AnyFormApi } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO, GroupLabel } from '../shared';
import type { NavbarValues } from './types';

export function NavbarAnchorsField({
  form,
  direction,
}: {
  form: AnyFormApi;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  return (
    <>
      <GroupLabel className="mt-6 mb-1">{t('settings.navbar.anchors.label')}</GroupLabel>
      <p className="mb-2.5 text-[12px] text-muted-foreground leading-snug">{t('settings.navbar.anchors.hint')}</p>
      <form.Field mode="array" name="anchors">
        {(field: { state: { value: NavbarValues['anchors'] }; removeValue: (i: number) => void; pushValue: (row: NavbarValues['anchors'][number]) => void }) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border">
                {field.state.value.map((_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
                  <div className="flex items-center gap-2.5 border-border border-b p-3 last:border-b-0" key={index}>
                    <form.Field name={`anchors[${index}].label`}>
                      {(sub: { state: { value: string }; handleChange: (val: string) => void }) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'flex-1')}
                          dir={direction ?? 'auto'}
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.anchors.labelPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`anchors[${index}].href`}>
                      {(sub: { state: { value: string }; handleChange: (val: string) => void }) => (
                        <Input
                          className={cn(FIELD_COMPACT_MONO, 'flex-1')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder="https://community.example.com"
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`anchors[${index}].icon`}>
                      {(sub: { state: { value: string }; handleChange: (val: string) => void }) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'w-[104px] shrink-0')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.anchors.iconPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <Button
                      aria-label={t('settings.navbar.anchors.remove')}
                      className="text-muted-foreground"
                      onClick={() => field.removeValue(index)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button
              className="mb-1.5 border-dashed text-muted-foreground"
              onClick={() =>
                field.pushValue({
                  label: '',
                  href: '',
                  icon: '',
                  external: undefined,
                })
              }
              type="button"
              variant="outline"
            >
              <Plus className="size-3.5" /> {t('settings.navbar.anchors.add')}
            </Button>
          </>
        )}
      </form.Field>
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck passes on newly added field components**

Run: `bun run --filter @cms/studio typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/navbar-links-field.tsx apps/studio/src/features/project-settings/components/navbar/navbar-anchors-field.tsx
git commit -m "feat(settings): extract navbar links and anchors field components"
```

---

### Task 4: Shared Scope Form (`NavbarScopeForm`)

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx`

**Interfaces:**
- Consumes:
  - `types.ts` (`NavbarValues`, `GlobalNavbarPreview`)
  - `tabs-tree-editor.tsx` (`TabsTreeEditor`)
  - `navbar-links-field.tsx` (`NavbarLinksField`)
  - `navbar-anchors-field.tsx` (`NavbarAnchorsField`)
- Produces:
  - `NavbarScopeForm`: Form presentation and submission orchestrator with TanStack Form.

- [ ] **Step 1: Create NavbarScopeForm**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx`:
```typescript
import { Input } from '@cms/design-system/components/ui/input';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { useForm } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import {
  DirtyStateReporter,
  FIELD_INPUT,
  Field,
  GroupLabel,
  SaveBar,
  ToggleRow,
} from '../shared';
import { NavbarAnchorsField } from './navbar-anchors-field';
import { NavbarLinksField } from './navbar-links-field';
import { TabsTreeEditor } from './tabs-tree-editor';
import type { GlobalNavbarPreview, NavbarValues } from './types';

export function NavbarScopeForm({
  initial,
  onSave,
  showGlobalFields = false,
  extraToggles,
  ctaLabelPlaceholder,
  globalPreview,
  onDirtyChange,
  extraDirty = false,
  direction,
}: {
  initial: NavbarValues;
  direction?: 'ltr' | 'rtl';
  onSave: (value: NavbarValues) => Promise<void>;
  showGlobalFields?: boolean;
  extraToggles?: ReactNode;
  ctaLabelPlaceholder?: string;
  globalPreview?: GlobalNavbarPreview;
  onDirtyChange?: (dirty: boolean) => void;
  extraDirty?: boolean;
}) {
  const t = useT();
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await onSave(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="ctaLabel">
        {(field) => (
          <Field hint={t('settings.navbar.ctaLabel.hint')} label={t('settings.navbar.ctaLabel.label')}>
            <Input
              className={FIELD_INPUT}
              dir={direction ?? 'auto'}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={ctaLabelPlaceholder ?? t('settings.navbar.ctaLabel.placeholder')}
              value={field.state.value}
            />
          </Field>
        )}
      </form.Field>

      {showGlobalFields ? (
        <form.Field name="ctaUrl">
          {(field) => (
            <Field hint={t('settings.navbar.ctaUrl.hint')} label={t('settings.navbar.ctaUrl.label')}>
              <Input
                className={FIELD_INPUT}
                dir="ltr"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://example.com/demo"
                value={field.state.value}
              />
            </Field>
          )}
        </form.Field>
      ) : globalPreview ? (
        <Field hint={t('settings.chrome.scope.globalField')} label={t('settings.navbar.ctaUrl.label')}>
          <Input className={FIELD_INPUT} dir="ltr" disabled placeholder="https://example.com/demo" value={globalPreview.ctaUrl} />
        </Field>
      ) : null}

      <NavbarLinksField direction={direction} form={form} />

      <GroupLabel className="mt-6 mb-1">{t('settings.navbar.tabs.label')}</GroupLabel>
      <p className="mb-2.5 text-[12px] text-muted-foreground leading-snug">{t('settings.navbar.tabs.hint')}</p>
      <form.Field name="tabs">
        {(field) => <TabsTreeEditor direction={direction} onChange={(next) => field.handleChange(next)} value={field.state.value as NavTabItem[]} />}
      </form.Field>

      <NavbarAnchorsField direction={direction} form={form} />

      {extraToggles}
      {globalPreview ? (
        <>
          <ToggleRow
            checked={globalPreview.showSearch}
            disabled
            hint={t('settings.chrome.scope.globalField')}
            title={t('settings.navbar.showSearch.title')}
          />
          <ToggleRow
            checked={globalPreview.changelog}
            disabled
            hint={t('settings.chrome.scope.globalField')}
            title={t('settings.navbar.changelog.title')}
          />
        </>
      ) : null}

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => <DirtyStateReporter dirty={isDirty || extraDirty} onDirtyChange={onDirtyChange} />}
      </form.Subscribe>

      <div className="mt-4">
        <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
          {([isSubmitting, isDirty]) => <SaveBar disabled={!isDirty && !extraDirty} isSubmitting={isSubmitting} />}
        </form.Subscribe>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run --filter @cms/studio typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/navbar-scope-form.tsx
git commit -m "feat(settings): extract shared NavbarScopeForm component"
```

---

### Task 5: Project Scope & Language Scope Forms

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx`
- Create: `apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx`

**Interfaces:**
- Consumes:
  - `types.ts`, `navbar-utils.ts`
  - `navbar-scope-form.tsx`
  - `@cms/sdk`, `@cms/sdk/react`
  - `../tabs-tree-utils.ts` (`cleanTabItems`)
  - `../shared.ts` (`saveConfigSection`, `ToggleRow`)
- Produces:
  - `ProjectNavbarForm`: Project-level scope form container.
  - `LanguageNavbarForm`: Language-override scope form container.

- [ ] **Step 1: Create ProjectNavbarForm**

Create `apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx`:
```typescript
import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useUpdateProjectConfig } from '@cms/sdk/react';
import type { NavTabItem } from '@cms/validators';
import { useState } from 'react';
import { ToggleRow, saveConfigSection } from '../shared';
import { cleanTabItems } from '../tabs-tree-utils';
import { NavbarScopeForm } from './navbar-scope-form';
import { cleanAnchorRows, cleanRows, normalizeTabs } from './navbar-utils';

export function ProjectNavbarForm({ project, onDirtyChange }: { project: Project; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useT();
  const update = useUpdateProjectConfig(project.id);
  const navbar = project.config?.navbar ?? {};
  const [showSearch, setShowSearch] = useState<boolean>(navbar.showSearch ?? true);
  const [showChangelog, setShowChangelog] = useState<boolean>(navbar.changelog ?? false);

  return (
    <NavbarScopeForm
      extraDirty={showSearch !== (navbar.showSearch ?? true) || showChangelog !== (navbar.changelog ?? false)}
      extraToggles={
        <>
          <ToggleRow
            checked={showSearch}
            hint={t('settings.navbar.showSearch.hint')}
            onCheckedChange={setShowSearch}
            title={t('settings.navbar.showSearch.title')}
          />
          <ToggleRow
            checked={showChangelog}
            hint={t('settings.navbar.changelog.hint')}
            onCheckedChange={setShowChangelog}
            title={t('settings.navbar.changelog.title')}
          />
        </>
      }
      initial={{
        ctaLabel: navbar.ctaLabel ?? '',
        ctaUrl: navbar.ctaUrl ?? '',
        links: (navbar.links ?? []).map((link) => ({
          label: link.label,
          href: link.href,
          external: link.external,
        })),
        tabs: normalizeTabs(navbar.tabs),
        anchors: (navbar.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onDirtyChange={onDirtyChange}
      onSave={(value) =>
        saveConfigSection(update, {
          navbar: {
            ctaLabel: value.ctaLabel.trim() || undefined,
            ctaUrl: value.ctaUrl.trim() || undefined,
            links: cleanRows(value.links),
            tabs: cleanTabItems(value.tabs as NavTabItem[]),
            anchors: cleanAnchorRows(value.anchors),
            showSearch,
            changelog: showChangelog,
          },
        })
      }
      showGlobalFields
    />
  );
}
```

- [ ] **Step 2: Create LanguageNavbarForm**

Create `apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx`:
```typescript
import { useT } from '@cms/i18n/react';
import type { Language, Project } from '@cms/sdk';
import { useUpdateLanguage } from '@cms/sdk/react';
import type { LanguageConfig, NavTabItem } from '@cms/validators';
import { toast } from 'sonner';
import { cleanTabItems } from '../tabs-tree-utils';
import { NavbarScopeForm } from './navbar-scope-form';
import { cleanAnchorRows, cleanRows, normalizeTabs } from './navbar-utils';

export function LanguageNavbarForm({
  project,
  language,
  onDirtyChange,
}: {
  project: Project;
  language: Language;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const update = useUpdateLanguage(project.id);
  const override: NonNullable<LanguageConfig['navbar']> = language.config?.navbar ?? {};

  return (
    <NavbarScopeForm
      ctaLabelPlaceholder={project.config?.navbar?.ctaLabel || undefined}
      direction={language.direction === 'RTL' ? 'rtl' : 'ltr'}
      globalPreview={{
        ctaUrl: project.config?.navbar?.ctaUrl ?? '',
        showSearch: project.config?.navbar?.showSearch ?? true,
        changelog: project.config?.navbar?.changelog ?? false,
      }}
      initial={{
        ctaLabel: override.ctaLabel ?? '',
        ctaUrl: '',
        links: (override.links ?? []).map((link) => ({
          label: link.label,
          href: link.href,
          external: link.external,
        })),
        tabs: normalizeTabs(override.tabs),
        anchors: (override.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onDirtyChange={onDirtyChange}
      onSave={async (value) => {
        const navbar: NonNullable<LanguageConfig['navbar']> = {};
        if (value.ctaLabel.trim()) {
          navbar.ctaLabel = value.ctaLabel.trim();
        }
        const links = cleanRows(value.links);
        if (links.length > 0) {
          navbar.links = links;
        }
        const tabs = cleanTabItems(value.tabs as NavTabItem[]);
        if (tabs.length > 0) {
          navbar.tabs = tabs;
        }
        const anchors = cleanAnchorRows(value.anchors);
        if (anchors.length > 0) {
          navbar.anchors = anchors;
        }
        try {
          await update.mutateAsync({
            id: language.id,
            body: {
              config: {
                navbar: Object.keys(navbar).length > 0 ? navbar : null,
              },
            },
          });
          toast.success(t('common.saved'));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('settings.saveError'));
        }
      }}
    />
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `bun run --filter @cms/studio typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/project-navbar-form.tsx apps/studio/src/features/project-settings/components/navbar/language-navbar-form.tsx
git commit -m "feat(settings): extract ProjectNavbarForm and LanguageNavbarForm scope containers"
```

---

### Task 6: Top-Level Section Orchestrator & Barrel Exports

**Files:**
- Create: `apps/studio/src/features/project-settings/components/navbar/navbar-section.tsx`
- Create: `apps/studio/src/features/project-settings/components/navbar/index.ts`
- Modify: `apps/studio/src/features/project-settings/components/navbar-section.tsx`

**Interfaces:**
- Consumes:
  - `project-navbar-form.tsx` (`ProjectNavbarForm`)
  - `language-navbar-form.tsx` (`LanguageNavbarForm`)
  - `../shared.ts` (`LanguageScopePicker`, `SectionHeader`, `sortLanguagesDefaultFirst`, `useScopeDirtyGuard`)
- Produces:
  - `NavbarSection`: Top-level orchestrator.
  - `components/navbar/index.ts`: Re-exports `NavbarSection`, `TabsTreeEditor`, `TabTreeNodeItem`, `ProjectNavbarForm`, `LanguageNavbarForm`, `NavbarScopeForm`, and types.
  - `components/navbar-section.tsx`: Backward-compatibility barrel re-exporting from `./navbar`.

- [ ] **Step 1: Create NavbarSection component under navbar/**

Create `apps/studio/src/features/project-settings/components/navbar/navbar-section.tsx`:
```typescript
import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useLanguages } from '@cms/sdk/react';
import { PanelTop } from 'lucide-react';
import { useState } from 'react';
import {
  LanguageScopePicker,
  SectionHeader,
  sortLanguagesDefaultFirst,
  useScopeDirtyGuard,
} from '../shared';
import { LanguageNavbarForm } from './language-navbar-form';
import { ProjectNavbarForm } from './project-navbar-form';

export function NavbarSection({ project }: { project: Project }) {
  const t = useT();
  const { data: languages } = useLanguages(project.id);
  const orderedLanguages = sortLanguagesDefaultFirst(languages ?? []);
  const defaultLanguage = orderedLanguages.find((language) => language.isDefault);
  const extraLanguages = orderedLanguages.filter((language) => !language.isDefault);
  const [scope, setScope] = useState<string>('default');
  const activeLanguage = extraLanguages.find((language) => language.id === scope);
  const { guard, setDirty } = useScopeDirtyGuard();

  return (
    <div>
      <SectionHeader icon={<PanelTop className="size-4" />} title={t('settings.navbar.title')} />
      <LanguageScopePicker
        defaultLanguage={defaultLanguage}
        guard={guard}
        hint={t('settings.navbar.scope.hint')}
        languages={extraLanguages}
        onChange={setScope}
        value={scope}
      />
      {/* Keyed per scope so switching re-seeds the form from that scope's config. */}
      {activeLanguage ? (
        <LanguageNavbarForm key={activeLanguage.id} language={activeLanguage} onDirtyChange={setDirty} project={project} />
      ) : (
        <ProjectNavbarForm key="default" onDirtyChange={setDirty} project={project} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create index.ts under navbar/**

Create `apps/studio/src/features/project-settings/components/navbar/index.ts`:
```typescript
export { NavbarSection } from './navbar-section';
export { TabsTreeEditor } from './tabs-tree-editor';
export { TabTreeNodeItem, type TabTreeNodeProps } from './tab-tree-node-item';
export { NavbarScopeForm } from './navbar-scope-form';
export { ProjectNavbarForm } from './project-navbar-form';
export { LanguageNavbarForm } from './language-navbar-form';
export { NavbarLinksField } from './navbar-links-field';
export { NavbarAnchorsField } from './navbar-anchors-field';
export { cleanRows, cleanAnchorRows, normalizeTabs } from './navbar-utils';
export type {
  NavRow,
  AnchorRow,
  FormNavTabItem,
  NavbarValues,
  GlobalNavbarPreview,
} from './types';
```

- [ ] **Step 3: Replace existing navbar-section.tsx with clean barrel re-export**

Replace `apps/studio/src/features/project-settings/components/navbar-section.tsx`:
```typescript
export {
  NavbarSection,
  TabsTreeEditor,
  TabTreeNodeItem,
  NavbarScopeForm,
  ProjectNavbarForm,
  LanguageNavbarForm,
  NavbarLinksField,
  NavbarAnchorsField,
  cleanRows,
  cleanAnchorRows,
  normalizeTabs,
  type TabTreeNodeProps,
  type NavRow,
  type AnchorRow,
  type FormNavTabItem,
  type NavbarValues,
  type GlobalNavbarPreview,
} from './navbar';
```

- [ ] **Step 4: Verify typecheck passes across the workspace**

Run: `bun run --filter @cms/studio typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/navbar/navbar-section.tsx apps/studio/src/features/project-settings/components/navbar/index.ts apps/studio/src/features/project-settings/components/navbar-section.tsx
git commit -m "refactor(settings): modularize navbar-section into dedicated navbar components"
```

---

### Task 7: Comprehensive Regression Verification

**Files:**
- Verify: Entire `@cms/studio` package and tests

- [ ] **Step 1: Run all vitest tests in @cms/studio**

Run: `bun run --filter @cms/studio test`
Expected: All tests pass with 0 failures

- [ ] **Step 2: Run full studio typecheck**

Run: `bun run --filter @cms/studio typecheck`
Expected: 0 errors

- [ ] **Step 3: Run git status check**

Run: `git status -s`
Expected: Working tree clean
