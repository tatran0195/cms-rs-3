# Design Spec: Modularizing Navbar Section in Project Settings

**Date**: 2026-10-21  
**Status**: Approved  
**Author**: Antigravity Assistant & Engineering Team  
**Scope**: `@cms/studio` (`apps/studio/src/features/project-settings`)

---

## 1. Context & Motivation

In `@cms/studio`, `navbar-section.tsx` in `apps/studio/src/features/project-settings/components/` has evolved into a 713-line god file. It currently bundles:
1. Data contracts and recursive typing workarounds (`FormNavTabItem`, `NavbarValues`, `NavRow`, `AnchorRow`).
2. Pure data cleansing and normalization helpers (`cleanRows`, `cleanAnchorRows`, `normalizeTabs`).
3. Recursive tree editor components (`TabsTreeEditor`, `TabTreeNodeItem`).
4. Array field management for custom links and anchors.
5. Form presentation and submission wrappers for both Default/Project scope and Language override scopes (`ProjectNavbarForm`, `LanguageNavbarForm`, `NavbarScopeForm`).
6. The outer section shell with multi-language scope switching (`NavbarSection`).

This density impairs maintainability, makes isolated unit testing of UI sub-components difficult, and increases cognitive overhead. Following the successful modular pattern used by `components/theme/`, this specification decomposes `navbar-section.tsx` into a dedicated, clean, and testable `components/navbar/` module.

---

## 2. Architectural Design & Directory Structure

We establish a new directory:
`apps/studio/src/features/project-settings/components/navbar/`

### 2.1 File Breakdown

| File | Purpose & Responsibilities |
| :--- | :--- |
| `types.ts` | Shared types: `NavRow`, `AnchorRow`, `FormNavTabItem` (preventing TS2589 infinite recursion in TanStack Form `DeepKeys`), `NavbarValues`, and `GlobalNavbarPreview`. |
| `navbar-utils.ts` | Pure functions for sanitization & normalization: `cleanRows`, `cleanAnchorRows`, and `normalizeTabs`. |
| `tab-tree-node-item.tsx` | Recursive tree node displaying depth badge (`L{depth+1}`), expand/collapse controls, label & href inputs, external link toggle, sub-tab insertion, reordering (up/down), and node removal. |
| `tabs-tree-editor.tsx` | Tree editor wrapper rendering top-level items and the "+ Add tab" root action. |
| `navbar-links-field.tsx` | Array editor for header links (`field.state.value.map`), input controls, and add/remove buttons. |
| `navbar-anchors-field.tsx` | Array editor for header anchors (`icon`, `label`, `href`), input controls, and add/remove buttons. |
| `navbar-scope-form.tsx` | Presentation form combining CTA controls, `NavbarLinksField`, `TabsTreeEditor`, `NavbarAnchorsField`, extra toggles, `DirtyStateReporter`, and `SaveBar`. |
| `project-navbar-form.tsx` | Scope container for project-level navbar settings; manages `showSearch` and `showChangelog` toggles, maps config to `initial`, and commits via `saveConfigSection`. |
| `language-navbar-form.tsx` | Scope container for per-language overrides; computes `globalPreview` indicators for disabled global fields, maps localized overrides, and commits via `updateLanguage`. |
| `navbar-section.tsx` | Top-level section orchestrator with `SectionHeader`, `LanguageScopePicker`, `useScopeDirtyGuard`, and scope-keyed form rendering. |
| `index.ts` | Public export barrel for the `navbar/` package. |

### 2.2 Backward Compatibility

To prevent breaking existing imports across `@cms/studio` (such as in `apps/studio/src/features/project-settings/index.ts` and `apps/studio/src/features/editor/components/site-config-panel.tsx`), `apps/studio/src/features/project-settings/components/navbar-section.tsx` will remain as a barrel re-exporting `NavbarSection`, `TabsTreeEditor`, and types from `./navbar`.

---

## 3. Data Contracts & Type Safety

### 3.1 Preventing TanStack Form Infinite Recursion (TS2589)
Because `NavTabItem` in `@cms/validators` is self-referential (`items?: NavTabItem[]`), passing recursive models directly to TanStack Form's `useForm` triggers TypeScript error TS2589:
`"Type instantiation is excessively deep and possibly infinite"` inside `DeepKeys<NavbarValues>`.

To prevent this, `FormNavTabItem` breaks the recursive type depth in the form state:
```typescript
export type FormNavTabItem = Omit<NavTabItem, 'items'> & {
  items?: unknown[];
};

export interface NavbarValues {
  ctaLabel: string;
  ctaUrl: string;
  links: NavRow[];
  tabs: FormNavTabItem[];
  anchors: AnchorRow[];
}
```
Upon form submission, `cleanTabItems(value.tabs as NavTabItem[])` safely cleans and validates the tree structure at runtime.

### 3.2 Immutability in Tree Editing
Tree operations utilize pure functions from `../tabs-tree-utils.ts`:
- `insertTabChild(tree, path, { label: '', href: '' })`
- `updateTabNode(tree, path, patch)`
- `removeTabNode(tree, path)`
- `moveTabNode(tree, path, dir)`

Every operation produces a newly allocated immutable tree slice and invokes the parent's `onChange` callback.

---

## 4. Testing & Verification

1. **`navbar-utils.test.ts`**:
   - Pruning whitespace-only rows in `cleanRows` and `cleanAnchorRows`.
   - Normalizing raw JSON / null / partial tab objects in `normalizeTabs`.
2. **`tabs-tree-editor.test.tsx`**:
   - Empty state rendering & root tab creation.
   - Child node insertion (nesting).
   - Moving items up and down.
   - Removing items.
3. **Typecheck & Regression**:
   - `bun run --filter @cms/studio typecheck` (verifying 0 TypeScript errors and absence of TS2589).
   - `bun run --filter @cms/studio test` (verifying all vitest suites in studio succeed).

---

## 5. Non-Goals

- Modifying the underlying backend schema or `@cms/validators` definitions for `NavbarConfig`.
- Altering the visual design or existing UX layout in the studio editor.
- Introducing multi-tenant billing, plan tiers, or public marketing pages (strictly adhering to company internal deployment rules).
