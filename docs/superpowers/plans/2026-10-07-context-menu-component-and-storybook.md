# ContextMenu Component & Storybook Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Radix-based `ContextMenu` component in `@cms/ui` following the `@cms/ui-preset/theme.css` tokens and shadcn conventions, create comprehensive stories, configure Storybook with Tailwind CSS v4 support, and verify in the browser.

**Architecture:** Wrap Radix UI ContextMenu primitives with Tailwind CSS v4 design tokens (`bg-ui-bg-component`, `text-ui-fg-base`, `shadow-elevation-flyout`, `focus-visible:bg-ui-bg-component-hover`, etc.), provide both compound (`ContextMenu.Trigger`) and named (`ContextMenuTrigger`) exports. Setup Storybook using `@storybook/react-vite` and `@tailwindcss/vite` in `packages/ui`.

**Tech Stack:** React 19, TypeScript 7, Radix UI Primitives, Tailwind CSS v4, `@cms/icons`, `@cms/ui-preset`, Storybook 10 / Vite.

## Global Constraints

- Monorepo package: `packages/ui` (`@cms/ui`)
- Style system: Tailwind CSS v4 (`@import "tailwindcss"; @import "@cms/ui-preset/theme.css";`)
- Icons: `@cms/icons` (`CheckMini`, `ChevronRightMini`, `EllipseMiniSolid`)
- Runtime: Bun

---

### Task 1: Implement ContextMenu Component and Unit Test

**Files:**
- Create: `packages/ui/src/components/context-menu/context-menu.tsx`
- Create: `packages/ui/src/components/context-menu/index.ts`
- Create: `packages/ui/src/components/context-menu/context-menu.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes:
  - `radix-ui` (`ContextMenu as RadixContextMenu`)
  - `@cms/icons` (`CheckMini`, `ChevronRightMini`, `EllipseMiniSolid`)
  - `@/utils/clx` (`clx`)
- Produces:
  - `ContextMenu` compound component with `.Trigger`, `.Group`, `.SubMenu`, `.SubMenuContent`, `.SubMenuTrigger`, `.Content`, `.Item`, `.CheckboxItem`, `.RadioGroup`, `.RadioItem`, `.Label`, `.Separator`, `.Shortcut`, `.Hint`
  - Named exports: `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuCheckboxItem`, `ContextMenuRadioItem`, `ContextMenuLabel`, `ContextMenuSeparator`, `ContextMenuShortcut`, `ContextMenuHint`, `ContextMenuGroup`, `ContextMenuPortal`, `ContextMenuSub`, `ContextMenuSubContent`, `ContextMenuSubTrigger`, `ContextMenuRadioGroup`

- [ ] **Step 1: Write the failing unit test**

Create `packages/ui/src/components/context-menu/context-menu.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu';

describe('ContextMenu', () => {
  it('renders trigger correctly', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger data-testid="trigger">Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
    expect(screen.getByText('Right click me')).toBeInTheDocument();
  });

  it('exposes compound subcomponents on ContextMenu', () => {
    expect(ContextMenu.Trigger).toBeDefined();
    expect(ContextMenu.Content).toBeDefined();
    expect(ContextMenu.Item).toBeDefined();
    expect(ContextMenu.CheckboxItem).toBeDefined();
    expect(ContextMenu.RadioItem).toBeDefined();
    expect(ContextMenu.SubMenu).toBeDefined();
    expect(ContextMenu.SubMenuTrigger).toBeDefined();
    expect(ContextMenu.SubMenuContent).toBeDefined();
    expect(ContextMenu.Separator).toBeDefined();
    expect(ContextMenu.Label).toBeDefined();
    expect(ContextMenu.Shortcut).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @cms/ui test context-menu.test.tsx`
Expected: FAIL with module `./context-menu` not found.

- [ ] **Step 3: Implement ContextMenu component**

Create `packages/ui/src/components/context-menu/context-menu.tsx`:
```tsx
'use client';

import { CheckMini, ChevronRightMini, EllipseMiniSolid } from '@cms/icons';
import { ContextMenu as RadixContextMenu } from 'radix-ui';
import * as React from 'react';
import { clx } from '@/utils/clx';

const Root = RadixContextMenu.Root;
Root.displayName = 'ContextMenu';

const Trigger = RadixContextMenu.Trigger;
Trigger.displayName = 'ContextMenu.Trigger';

const Group = RadixContextMenu.Group;
Group.displayName = 'ContextMenu.Group';

const Portal = RadixContextMenu.Portal;
Portal.displayName = 'ContextMenu.Portal';

const SubMenu = RadixContextMenu.Sub;
SubMenu.displayName = 'ContextMenu.SubMenu';

const RadioGroup = RadixContextMenu.RadioGroup;
RadioGroup.displayName = 'ContextMenu.RadioGroup';

const SubMenuTrigger = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <RadixContextMenu.SubTrigger
    ref={ref}
    className={clx(
      'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=open]:!bg-ui-bg-component-hover',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRightMini className="text-ui-fg-muted ml-auto" />
  </RadixContextMenu.SubTrigger>
));
SubMenuTrigger.displayName = 'ContextMenu.SubMenuTrigger';

const SubMenuContent = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.SubContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.SubContent>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.SubContent
      ref={ref}
      collisionPadding={collisionPadding}
      className={clx(
        'bg-ui-bg-component text-ui-fg-base shadow-elevation-flyout max-h-[var(--radix-popper-available-height)] min-w-[220px] overflow-hidden rounded-lg p-1',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
SubMenuContent.displayName = 'ContextMenu.SubMenuContent';

const Content = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.Content>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Content>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.Content
      ref={ref}
      collisionPadding={collisionPadding}
      className={clx(
        'bg-ui-bg-component text-ui-fg-base shadow-elevation-flyout max-h-[var(--radix-popper-available-height)] min-w-[220px] overflow-hidden rounded-lg p-1',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
Content.displayName = 'ContextMenu.Content';

const Item = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.Item>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Item> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
  }
>(({ className, inset, variant = 'default', ...props }, ref) => (
  <RadixContextMenu.Item
    ref={ref}
    className={clx(
      'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      variant === 'destructive' &&
        'text-ui-fg-error focus-visible:bg-ui-bg-subtle focus:bg-ui-bg-subtle active:bg-ui-bg-subtle focus:text-ui-fg-error',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
Item.displayName = 'ContextMenu.Item';

const CheckboxItem = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <RadixContextMenu.CheckboxItem
    ref={ref}
    className={clx(
      'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=checked]:txt-compact-small-plus',
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-[15px] items-center justify-center">
      <RadixContextMenu.ItemIndicator>
        <CheckMini />
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.CheckboxItem>
));
CheckboxItem.displayName = 'ContextMenu.CheckboxItem';

const RadioItem = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <RadixContextMenu.RadioItem
    ref={ref}
    className={clx(
      'bg-ui-bg-component txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=checked]:txt-compact-small-plus',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-[15px] items-center justify-center">
      <RadixContextMenu.ItemIndicator>
        <EllipseMiniSolid className="text-ui-fg-base" />
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.RadioItem>
));
RadioItem.displayName = 'ContextMenu.RadioItem';

const Label = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.Label>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <RadixContextMenu.Label
    ref={ref}
    className={clx('text-ui-fg-subtle txt-compact-xsmall-plus px-2 py-1.5', inset && 'pl-8', className)}
    {...props}
  />
));
Label.displayName = 'ContextMenu.Label';

const Separator = React.forwardRef<
  React.ElementRef<typeof RadixContextMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Separator
    ref={ref}
    className={clx(
      'bg-ui-border-component border-t-ui-border-menu-top border-b-ui-border-menu-bot -mx-1 my-1 h-0.5 border-b border-t',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'ContextMenu.Separator';

const Shortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={clx('text-ui-fg-subtle txt-compact-small ml-auto tracking-widest pl-4', className)} {...props} />
);
Shortcut.displayName = 'ContextMenu.Shortcut';

const Hint = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={clx('text-ui-fg-subtle txt-compact-small ml-auto tracking-widest pl-4', className)} {...props} />
);
Hint.displayName = 'ContextMenu.Hint';

const ContextMenu = Object.assign(Root, {
  Trigger,
  Group,
  Portal,
  SubMenu,
  SubMenuContent,
  SubMenuTrigger,
  Content,
  Item,
  CheckboxItem,
  RadioGroup,
  RadioItem,
  Label,
  Separator,
  Shortcut,
  Hint,
});

export {
  ContextMenu,
  Root as ContextMenuRoot,
  Trigger as ContextMenuTrigger,
  Portal as ContextMenuPortal,
  Group as ContextMenuGroup,
  RadioGroup as ContextMenuRadioGroup,
  SubMenu as ContextMenuSub,
  SubMenuTrigger as ContextMenuSubTrigger,
  SubMenuContent as ContextMenuSubContent,
  Content as ContextMenuContent,
  Item as ContextMenuItem,
  CheckboxItem as ContextMenuCheckboxItem,
  RadioItem as ContextMenuRadioItem,
  Label as ContextMenuLabel,
  Separator as ContextMenuSeparator,
  Shortcut as ContextMenuShortcut,
  Hint as ContextMenuHint,
};
```

Create `packages/ui/src/components/context-menu/index.ts`:
```ts
export * from './context-menu';
```

Export from `packages/ui/src/index.ts`:
Add:
```ts
export * from './components/context-menu';
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `bun --filter @cms/ui test context-menu.test.tsx`
Expected: PASS

- [ ] **Step 5: Verify build & typecheck**

Run: `bun --filter @cms/ui typecheck && bun --filter @cms/ui build`
Expected: Build succeeds with `tsdown`.

---

### Task 2: Create ContextMenu Stories

**Files:**
- Create: `packages/ui/src/components/context-menu/context-menu.stories.tsx`

**Interfaces:**
- Consumes:
  - `ContextMenu` from `./context-menu`
  - `@storybook/react`

- [ ] **Step 1: Write stories**

Create `packages/ui/src/components/context-menu/context-menu.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { ContextMenu } from './context-menu';

const meta: Meta<typeof ContextMenu> = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[200px] w-[350px] items-center justify-center rounded-lg border border-dashed select-none">
        Right click here
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item>
          Back <ContextMenu.Shortcut>⌘[</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item disabled>
          Forward <ContextMenu.Shortcut>⌘]</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item>
          Reload <ContextMenu.Shortcut>⌘R</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item>Save As…</ContextMenu.Item>
        <ContextMenu.Item>Print…</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item>View Source</ContextMenu.Item>
        <ContextMenu.Item>Inspect Element</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};

export const WithSubmenus: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[200px] w-[350px] items-center justify-center rounded-lg border border-dashed select-none">
        Right click for Submenus
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item>New Window</ContextMenu.Item>
        <ContextMenu.Item>New Tab</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.SubMenu>
          <ContextMenu.SubMenuTrigger>More Tools</ContextMenu.SubMenuTrigger>
          <ContextMenu.SubMenuContent>
            <ContextMenu.Item>Save Page As…</ContextMenu.Item>
            <ContextMenu.Item>Create Shortcut…</ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item>Developer Tools</ContextMenu.Item>
            <ContextMenu.Item>Task Manager</ContextMenu.Item>
          </ContextMenu.SubMenuContent>
        </ContextMenu.SubMenu>
        <ContextMenu.Separator />
        <ContextMenu.Item>Settings</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};

export const WithCheckboxesAndRadios: Story = {
  render: () => {
    const [bookmarksBar, setBookmarksBar] = React.useState(true);
    const [fullUrls, setFullUrls] = React.useState(false);
    const [theme, setTheme] = React.useState('system');

    return (
      <ContextMenu>
        <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[200px] w-[350px] items-center justify-center rounded-lg border border-dashed select-none">
          Right click for Options
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Label>View Options</ContextMenu.Label>
          <ContextMenu.CheckboxItem checked={bookmarksBar} onCheckedChange={(c) => setBookmarksBar(!!c)}>
            Show Bookmarks Bar
          </ContextMenu.CheckboxItem>
          <ContextMenu.CheckboxItem checked={fullUrls} onCheckedChange={(c) => setFullUrls(!!c)}>
            Show Full URLs
          </ContextMenu.CheckboxItem>
          <ContextMenu.Separator />
          <ContextMenu.Label>Appearance Mode</ContextMenu.Label>
          <ContextMenu.RadioGroup value={theme} onValueChange={setTheme}>
            <ContextMenu.RadioItem value="light">Light</ContextMenu.RadioItem>
            <ContextMenu.RadioItem value="dark">Dark</ContextMenu.RadioItem>
            <ContextMenu.RadioItem value="system">System Default</ContextMenu.RadioItem>
          </ContextMenu.RadioGroup>
        </ContextMenu.Content>
      </ContextMenu>
    );
  },
};

export const DestructiveAndDisabled: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[200px] w-[350px] items-center justify-center rounded-lg border border-dashed select-none">
        Right click for Destructive Actions
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item>Edit File</ContextMenu.Item>
        <ContextMenu.Item>Duplicate File</ContextMenu.Item>
        <ContextMenu.Item disabled>Download (Locked)</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item variant="destructive">
          Delete File <ContextMenu.Shortcut>⌫</ContextMenu.Shortcut>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};
```

---

### Task 3: Configure Storybook in packages/ui

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/.storybook/main.ts`
- Create: `packages/ui/.storybook/preview.tsx`

**Interfaces:**
- Consumes:
  - `@storybook/react-vite`
  - `@storybook/react`
  - `@tailwindcss/vite`
  - `packages/ui/src/styles.css`
- Produces:
  - Working Storybook dev server and build commands

- [ ] **Step 1: Install Storybook dependencies in `packages/ui`**

Add `@storybook/react-vite` and `@storybook/react` to `packages/ui/package.json` `devDependencies`:
```bash
bun --filter @cms/ui add -d @storybook/react-vite @storybook/react
```

- [ ] **Step 2: Add Storybook scripts in `packages/ui/package.json`**

Update `packages/ui/package.json`:
```json
"storybook": "storybook dev -p 6006",
"storybook:build": "storybook build"
```

- [ ] **Step 3: Create `.storybook/main.ts`**

Create `packages/ui/.storybook/main.ts`:
```ts
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins || [];
    viteConfig.plugins.push(tailwindcss());
    viteConfig.resolve = viteConfig.resolve || {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      '@': path.resolve(__dirname, '../src'),
      '@cms/ui': path.resolve(__dirname, '../src/index.ts'),
    };
    return viteConfig;
  },
};

export default config;
```

- [ ] **Step 4: Create `.storybook/preview.tsx`**

Create `packages/ui/.storybook/preview.tsx`:
```tsx
import type { Preview } from '@storybook/react';
import React from 'react';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#121212' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="font-sans antialiased p-6">
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

- [ ] **Step 5: Verify Storybook build**

Run: `bun --filter @cms/ui run storybook:build`
Expected: Storybook build succeeds and writes output to `storybook-static/`.

---

### Task 4: Launch Storybook and Verify Component in Browser

**Files:** None (testing and verification)

- [ ] **Step 1: Start Storybook dev server**

Run in background:
`bun --filter @cms/ui storybook`
Wait until it is listening on `http://localhost:6006`.

- [ ] **Step 2: Inspect ContextMenu in Browser**

Launch browser subagent with task:
"Navigate to http://localhost:6006/?path=/story/components-contextmenu--default, right click the dashed container, verify ContextMenu appears, hover items, open submenus, toggle checkboxes, inspect styling tokens."

- [ ] **Step 3: Shut down Storybook process**

Terminate the background Storybook dev task cleanly.
