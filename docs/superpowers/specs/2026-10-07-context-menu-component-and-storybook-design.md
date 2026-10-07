# Design Specification: ContextMenu Component & Storybook Integration

**Status:** Approved  
**Author:** Antigravity AI Systems Architect  
**Date:** 2026-10-07  
**Target:** `packages/ui` (`@cms/ui`)

---

## 1. Executive Summary

This specification outlines the implementation of the `ContextMenu` component in `@cms/ui` adhering to design tokens (`@cms/ui-preset/theme.css`), blending the existing `@cms/ui` component patterns (e.g., `DropdownMenu`, `Popover`) with modern shadcn conventions. Additionally, it establishes a functional Storybook environment in `packages/ui` with Tailwind CSS v4 support, creates rich interactive stories for `ContextMenu`, and verifies component behavior in the browser.

---

## 2. ContextMenu Component Architecture

### 2.1 Primitives and Dependencies
- **Core Primitives:** `@radix-ui/react-context-menu` exported via `radix-ui` package (`import { ContextMenu as RadixContextMenu } from 'radix-ui'`).
- **Icons:** `CheckMini`, `ChevronRightMini`, and `EllipseMiniSolid` from `@cms/icons`.
- **Utilities:** `clx` from `@/utils/clx`.

### 2.2 Component Parts & Token Mapping
The component will be located at `packages/ui/src/components/context-menu/context-menu.tsx`.

1. **`ContextMenu` (Root):** `RadixContextMenu.Root`.
2. **`ContextMenuTrigger`:** `RadixContextMenu.Trigger`.
3. **`ContextMenuPortal`:** `RadixContextMenu.Portal`.
4. **`ContextMenuGroup`:** `RadixContextMenu.Group`.
5. **`ContextMenuRadioGroup`:** `RadixContextMenu.RadioGroup`.
6. **`ContextMenuSub`:** `RadixContextMenu.Sub`.
7. **`ContextMenuContent`:**
   - Classes:
     - `bg-ui-bg-component text-ui-fg-base shadow-elevation-flyout rounded-lg p-1 min-w-[220px] max-h-[var(--radix-popper-available-height)] overflow-hidden outline-none`
     - Animations: `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2`
8. **`ContextMenuItem`:**
   - Props: `React.ComponentPropsWithoutRef<typeof RadixContextMenu.Item> & { inset?: boolean; variant?: 'default' | 'destructive' }`
   - Classes:
     - Base: `bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors`
     - Hover/Focus: `focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover active:bg-ui-bg-component-hover`
     - Disabled: `data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none`
     - Inset: `pl-8` when `inset` is true.
     - Destructive variant: `text-ui-fg-error focus:text-ui-fg-error focus:bg-ui-bg-subtle`
9. **`ContextMenuCheckboxItem`:**
   - Classes: `bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors focus-visible:bg-ui-bg-component-hover active:bg-ui-bg-component-hover data-[disabled]:text-ui-fg-disabled data-[state=checked]:txt-compact-small-plus`
   - Indicator: `CheckMini` centered at `left-2`.
10. **`ContextMenuRadioItem`:**
    - Classes: `bg-ui-bg-component txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors focus-visible:bg-ui-bg-component-hover active:bg-ui-bg-component-hover data-[disabled]:text-ui-fg-disabled data-[state=checked]:txt-compact-small-plus`
    - Indicator: `EllipseMiniSolid` centered at `left-2`.
11. **`ContextMenuSubTrigger`:**
    - Classes: `bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors focus-visible:bg-ui-bg-component-hover active:bg-ui-bg-component-hover data-[disabled]:text-ui-fg-disabled data-[state=open]:!bg-ui-bg-component-hover`
    - Inset: `pl-8` when `inset` is true.
    - Icon: `ChevronRightMini` with `ml-auto text-ui-fg-muted`.
12. **`ContextMenuSubContent`:**
    - Matches styling and animation of `ContextMenuContent`.
13. **`ContextMenuLabel`:**
    - Classes: `text-ui-fg-subtle txt-compact-xsmall-plus px-2 py-1.5`, with `pl-8` when `inset` is true.
14. **`ContextMenuSeparator`:**
    - Classes: `bg-ui-border-component border-t-ui-border-menu-top border-b-ui-border-menu-bot -mx-1 my-1 h-0.5 border-b border-t`.
15. **`ContextMenuShortcut` & `ContextMenuHint`:**
    - Classes: `text-ui-fg-subtle txt-compact-small ml-auto tracking-widest pl-4`.

### 2.3 Export Interface
The module `packages/ui/src/components/context-menu/index.ts` and `src/index.ts` will provide:
- **Compound Object Export:**
  ```ts
  const ContextMenu = Object.assign(Root, {
    Trigger,
    Group,
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
  export { ContextMenu };
  ```
- **Named Exports:**
  ```ts
  export {
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

---

## 3. Storybook Setup & Configuration

### 3.1 Dependencies
Install devDependencies in `packages/ui`:
- `@storybook/react-vite`
- `@storybook/react`

### 3.2 Configuration Files (`packages/ui/.storybook/`)
1. **`.storybook/main.ts`**:
   - Framework: `@storybook/react-vite`
   - Stories pattern: `['../src/**/*.stories.@(ts|tsx)']`
   - Vite configuration with `@tailwindcss/vite` and path aliases resolving `@/` to `../src/`.
2. **`.storybook/preview.tsx`**:
   - Imports `../src/styles.css` containing Tailwind CSS v4 and `@cms/ui-preset/theme.css`.
   - Sets up dark mode / light mode preview container and viewport configurations.

### 3.3 TypeScript Configuration
Update `packages/ui/tsconfig.json` or configure Storybook's Vite TS config so stories resolve `@storybook/react` types without interfering with workspace builds.

### 3.4 Scripts in `packages/ui/package.json`
- `"storybook": "storybook dev -p 6006"`
- `"storybook:build": "storybook build"`

---

## 4. Stories & Validation Scenarios

Location: `packages/ui/src/components/context-menu/context-menu.stories.tsx`

1. **Default**:
   - Area: Dashed rounded border box ("Right click here").
   - Menu: Back (`⌘[`), Forward (`⌘]`), Reload (`⌘R`), separator, Bookmarks submenu, Inspect item.
2. **WithSubmenus**:
   - Multi-level nested menus showcasing `ContextMenuSub`, `ContextMenuSubTrigger`, and `ContextMenuSubContent`.
3. **WithCheckboxesAndRadios**:
   - Checkbox items for toggle options ("Show Bookmarks Bar", "Show Full URLs").
   - Radio group for selection modes ("Compact", "Standard", "Relaxed").
4. **DestructiveAndDisabled**:
   - Demonstrating disabled menu items and destructive action ("Delete file" with `variant="destructive"`).

---

## 5. Verification Plan

1. **Typecheck & Lint**:
   - Run `bun --filter @cms/ui typecheck`.
   - Run `bun run check`.
2. **Storybook Execution**:
   - Launch Storybook via `bun --filter @cms/ui storybook`.
   - Ensure the dev server starts and listens on `http://localhost:6006`.
3. **Browser Testing with Browser Subagent**:
   - Open browser subagent to `http://localhost:6006/?path=/story/components-contextmenu--default`.
   - Right click the trigger container.
   - Verify context menu appears with correct tokens, shadows, colors, and layout.
   - Hover submenus, toggle checkboxes, click items, and take screenshot/DOM inspection to confirm functionality.
