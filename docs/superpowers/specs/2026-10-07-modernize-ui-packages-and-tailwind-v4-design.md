# Architectural Design: Modernize UI Packages & Tailwind CSS v4 Migration

**Status:** Approved  
**Author:** Antigravity AI Systems Architect  
**Date:** 2026-10-07  
**Target:** `packages/icons`, `packages/ui-preset`, `packages/ui`  

---

## 1. Executive Summary

This specification defines the migration and modernization of three newly copied packages:
- `@cms/icons` (465 icon components)
- `@cms/ui-preset` (design tokens, colors, effects, typography)
- `@cms/ui` (46 core UI components, hooks, blocks)

These packages were brought into the repository retaining legacy build systems (Rollup, tsup, tsc-alias, rimraf, Yarn `-T` script arguments), legacy Tailwind CSS v3 configurations (`tailwind.config.cjs`, `postcss.config.js`, `@tailwind` directives), and React 18 peer dependencies.

This design transitions all three packages to the monorepo's modern baseline:
1. **Unified Build System**: Standardize on **`tsdown`** (Rolldown-powered, matching `@cms/design-system`, `@cms/shared`, `@cms/sdk`).
2. **React 19 & TypeScript 7 Alignment**: Upgrade peer/dev dependencies and compiler options to match the workspace.
3. **Tailwind CSS v4 Native Integration**: Replace legacy Tailwind v3 JS presets with a CSS-first `@theme` design token export (`@cms/ui-preset/theme.css`), `@source` discovery, and Tailwind v4 stylesheet imports.
4. **Zero Regressions**: Maintain `@cms/design-system` intact while ensuring all packages compile and pass type checks.

---

## 2. Current State & Gap Analysis

| Attribute | Legacy State in Copied Packages | Target Monorepo Standard |
| :--- | :--- | :--- |
| **Bundler** | Rollup (`icons`), tsup (`ui-preset`), `tsc` + `tsc-alias` (`ui`) | `tsdown` (`0.23.0`) powered by Rolldown |
| **Scripts** | Yarn flags like `bun run -T rimraf`, `bun run -T tsup` | Standard bun workspace scripts: `tsdown`, `tsc --noEmit` |
| **TypeScript Config** | Disconnected `tsconfig.cjs.json`, `tsconfig.esm.json` | Extends `@cms/tsconfig/react.json` or `base.json` |
| **Tailwind Version** | Tailwind CSS v3 (`^3.4.3`), `tailwindcss-animate`, `@tailwindcss/forms` | Tailwind CSS v4 (`^4.3.3`) + CSS-first `@theme` |
| **Tailwind Entry** | `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss"; @import "@cms/ui-preset/theme.css";` |
| **React Version** | `react: ^18.3.1`, `@types/react: ^18` | `react: ^19.3.0`, `@types/react: ^19.3.0` |
| **Module Format** | Dual CJS/ESM directories with manual re-exports | Pure ESM (`"type": "module"`), workspace exports |

---

## 3. Package Architecture & Specifications

### 3.1 `@cms/icons`

- **Purpose**: High-performance SVG icon library exporting 465 icon components.
- **Entry Points**: `src/index.ts` re-exporting `src/components/index.ts`.
- **`package.json` Updates**:
  - Remove `rollup`, `@atomico/rollup-plugin-sizes`, `rollup-plugin-esbuild`, `visualizer`.
  - Set `"type": "module"`, `"private": true`.
  - Scripts:
    ```json
    "scripts": {
      "build": "tsdown",
      "clean": "git clean -xdf .cache .turbo dist node_modules",
      "typecheck": "tsc --noEmit",
      "test": "vitest run"
    }
    ```
  - Exports:
    ```json
    "exports": {
      ".": "./src/index.ts"
    }
    ```
  - Dependencies: `react: ^19.3.0`, `react-dom: ^19.3.0` as peer dependencies.
- **`tsdown.config.ts`**:
  ```ts
  import { defineConfig } from 'tsdown';

  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'browser',
    dts: false,
    clean: true,
  });
  ```
- **`tsconfig.json`**:
  Extends `@cms/tsconfig/react.json`.

---

### 3.2 `@cms/ui-preset` (Tailwind CSS v4 Migration)

- **Purpose**: Defines design tokens, CSS variables, and theme extensions for UI components.
- **Tailwind v4 Token Delivery**:
  - Tailwind v4 deprecates JavaScript-based `presets: [...]` in favor of CSS `@theme` and `@utility`.
  - `@cms/ui-preset` exports:
    1. **`theme.css`** (Tailwind v4 CSS theme):
       - Defines `@theme` block mapping `--color-ui-*` properties to CSS custom properties (`var(--bg-base)`, `var(--fg-base)`, `var(--border-base)`, tag colors, button colors).
       - Defines animations: `--animate-accordion-down`, `--animate-accordion-up`.
       - Defines `:root` and `.dark` blocks providing default values for all color and effect variables.
       - Defines typography utilities (`.txt-compact-small`, `.txt-medium`, etc.).
    2. **`src/index.ts`** (TypeScript tokens):
       - Re-exports `colors`, `effects`, `typography`, and `constants` for code requiring runtime JS access.
- **`package.json` Updates**:
  - Set `"type": "module"`, `"private": true`.
  - Remove legacy `tsup`, `tailwindcss: ^3.4.3`, `@tailwindcss/forms`.
  - Update `tailwindcss: ^4.3.3` in dependencies/devDependencies.
  - Exports:
    ```json
    "exports": {
      ".": "./src/index.ts",
      "./theme.css": "./theme.css"
    }
    ```
- **`tsdown.config.ts`**:
  ```ts
  import { defineConfig } from 'tsdown';

  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'neutral',
    dts: false,
    clean: true,
  });
  ```

---

### 3.3 `@cms/ui`

- **Purpose**: Core component system containing 46 UI components (Alert, Button, Dialog, DropdownMenu, Table, etc.).
- **Style Integration (`src/styles.css`)**:
  - Replaces legacy `src/main.css` (`@tailwind base/components/utilities`).
  - Implements:
    ```css
    @import "tailwindcss";
    @import "@cms/ui-preset/theme.css";

    @source "./components/**/*.{ts,tsx}";
    @source "./blocks/**/*.{ts,tsx}";

    :root {
      background-color: var(--bg-subtle);
      color: var(--fg-base);
      text-rendering: optimizeLegibility;
    }
    ```
- **Dependencies**:
  - `react: ^19.3.0`, `react-dom: ^19.3.0` (peer & devDependencies).
  - `@cms/icons: workspace:*`
  - `@cms/ui-preset: workspace:*`
  - `@cms/tsconfig: workspace:*`
  - `clsx: ^2.1.1`
  - `tailwind-merge: ^3.7.0`
  - `cva: 1.0.0-beta.1` (preserves `{ base, variants }` syntax for all components).
- **Cleanup**:
  - Delete `tsconfig.cjs.json`, `tsconfig.esm.json`.
  - Delete `postcss.config.js`, `tailwind.config.cjs`.
  - Delete `.storybook/` directory and uninstalled storybook scripts.
- **`tsdown.config.ts`**:
  ```ts
  import { defineConfig } from 'tsdown';

  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'browser',
    dts: false,
    clean: true,
    sourcemap: true,
  });
  ```
- **Exports**:
  ```json
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles.css"
  }
  ```

---

## 4. Implementation Steps

1. **Clean Legacy Artifacts**: Remove `rollup.config.mjs`, `tsup.config.ts`, `postcss.config.js`, `tailwind.config.cjs`, `.storybook`, and dual tsconfigs.
2. **Setup Modern Configs**:
   - Create `tsdown.config.ts` for all three packages.
   - Configure `tsconfig.json` extending `@cms/tsconfig`.
3. **Implement Tailwind v4 Theme**:
   - Construct `@cms/ui-preset/theme.css` with `@theme` block and root/dark CSS variables.
   - Rewrite `@cms/ui/src/styles.css` with `@import "tailwindcss"` and `@source` directives.
4. **Upgrade Package Manifests & Dependencies**:
   - Update `package.json` in `packages/icons`, `packages/ui-preset`, and `packages/ui`.
   - Run `bun install` to synchronize the monorepo lockfile.
5. **Compilation & Type Checking**:
   - Build each package with `tsdown`.
   - Run type checks across `@cms/icons`, `@cms/ui-preset`, and `@cms/ui`.
   - Run full workspace build and type checks.

---

## 5. Verification & Acceptance Criteria

- [ ] `@cms/icons` builds cleanly with `tsdown` and exports all icon components.
- [ ] `@cms/ui-preset` compiles with `tsdown` and exports both `src/index.ts` and `theme.css`.
- [ ] `@cms/ui` builds cleanly with `tsdown` under React 19 without `tsc-alias` or `rimraf` dependencies.
- [ ] Tailwind CSS v4 compiles `@cms/ui/src/styles.css` without syntax errors.
- [ ] `bun run build:packages` succeeds across the entire monorepo.
- [ ] `bun run typecheck` passes with zero type errors.
