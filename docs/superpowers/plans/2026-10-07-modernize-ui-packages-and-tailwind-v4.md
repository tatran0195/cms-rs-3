# Modernize UI Packages & Tailwind CSS v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize newly added `packages/icons`, `packages/ui-preset`, and `packages/ui` to the monorepo baseline (tsdown, React 19, TypeScript 7) and upgrade to Tailwind CSS v4.

**Architecture:** Standardize build configurations using `tsdown` (Rolldown-powered) across all three packages. Convert `@cms/ui-preset` into a Tailwind v4 CSS theme exporter (`theme.css`) with `@theme` block and root/dark variables, and update `@cms/ui` to consume Tailwind v4 styles without legacy Rollup, tsup, tsc-alias, or Storybook artifacts.

**Tech Stack:** Bun, TypeScript 7.0, tsdown 0.23, React 19, Tailwind CSS v4.3, cva 1.0-beta, clsx 2.1, tailwind-merge 3.7.

## Global Constraints

- Runtime is Bun (`bun install`, `bun run`).
- Standardize on `tsdown` for package builds; do not introduce `rollup` or `tsup`.
- All workspace dependencies use `workspace:*` protocol.
- Do not modify or break `@cms/design-system` or `apps/studio`.
- Do not call `git commit` or `git push` (Agents do not commit; provide commit messages for the user).

---

### Task 1: Modernize `@cms/icons`

**Files:**
- Delete: `packages/icons/rollup.config.mjs`
- Modify: `packages/icons/package.json`
- Modify: `packages/icons/tsconfig.json`
- Create: `packages/icons/tsdown.config.ts`

**Interfaces:**
- Consumes: Icon SVG components in `packages/icons/src/components/*.tsx`
- Produces: `@cms/icons` package exporting ESM bundle and `./src/index.ts`

- [ ] **Step 1: Remove legacy rollup config**

Delete `packages/icons/rollup.config.mjs`.

- [ ] **Step 2: Update `packages/icons/package.json`**

Update `packages/icons/package.json` to:
```json
{
  "name": "@cms/icons",
  "version": "0.0.0",
  "description": "UI React icon library",
  "license": "MIT",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "sideEffects": false,
  "files": [
    "dist",
    "src"
  ],
  "scripts": {
    "build": "tsdown",
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@cms/tsconfig": "workspace:*",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "typescript": "^7.0.2",
    "tsdown": "^0.23.0"
  }
}
```

- [ ] **Step 3: Create `packages/icons/tsdown.config.ts`**

Write `packages/icons/tsdown.config.ts`:
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

- [ ] **Step 4: Update `packages/icons/tsconfig.json`**

Update `packages/icons/tsconfig.json` to extend `@cms/tsconfig/react.json`:
```json
{
  "extends": "@cms/tsconfig/react.json",
  "compilerOptions": {
    "paths": {
      "@cms/icons": ["./src/index.ts"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", ".cache", ".turbo"]
}
```

- [ ] **Step 5: Verify `@cms/icons` build and typecheck**

Run: `bun --filter @cms/icons build`
Expected: Build complete with tsdown.
Run: `bun --filter @cms/icons typecheck`
Expected: Pass with 0 errors.

---

### Task 2: Modernize `@cms/ui-preset` & Migrate to Tailwind CSS v4 Theme

**Files:**
- Create: `packages/ui-preset/theme.css`
- Modify: `packages/ui-preset/package.json`
- Modify: `packages/ui-preset/tsconfig.json`
- Modify: `packages/ui-preset/tsdown.config.ts`
- Modify: `packages/ui-preset/src/index.ts`

**Interfaces:**
- Consumes: Token definitions in `packages/ui-preset/src/theme/tokens/`
- Produces: `@cms/ui-preset` exporting JS tokens and Tailwind v4 stylesheet `@cms/ui-preset/theme.css`

- [ ] **Step 1: Create `packages/ui-preset/theme.css` for Tailwind CSS v4**

Create `packages/ui-preset/theme.css` containing:
- `@theme` block defining `--color-ui-*` properties mapped to CSS custom variables (`var(--bg-base)`, `var(--fg-base)`, `var(--border-base)`, tag colors, button colors, etc.) and animations (`--animate-accordion-down: accordion-down 0.2s ease-out;`).
- `@keyframes` for accordion and component animations.
- `:root` and `.dark` blocks setting CSS variable defaults from `colors.ts` and `effects.ts`.
- Typography helper utilities (`.txt-compact-small`, `.txt-medium`, etc.).

- [ ] **Step 2: Update `packages/ui-preset/package.json`**

Update `packages/ui-preset/package.json`:
```json
{
  "name": "@cms/ui-preset",
  "version": "0.0.0",
  "description": "cms UI preset & tokens",
  "license": "MIT",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./theme.css"
  },
  "scripts": {
    "build": "tsdown",
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@cms/tsconfig": "workspace:*",
    "@types/node": "^26.6.4",
    "typescript": "^7.0.2",
    "tsdown": "^0.23.0"
  }
}
```

- [ ] **Step 3: Update `packages/ui-preset/tsdown.config.ts`**

Update `packages/ui-preset/tsdown.config.ts`:
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

- [ ] **Step 4: Update `packages/ui-preset/tsconfig.json`**

Update `packages/ui-preset/tsconfig.json`:
```json
{
  "extends": "@cms/tsconfig/base.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist", ".cache", ".turbo"]
}
```

- [ ] **Step 5: Verify `@cms/ui-preset` build and typecheck**

Run: `bun --filter @cms/ui-preset build`
Expected: Build complete.
Run: `bun --filter @cms/ui-preset typecheck`
Expected: Pass with 0 errors.

---

### Task 3: Modernize `@cms/ui` Build, React 19 & Tailwind CSS v4 Styles

**Files:**
- Delete: `packages/ui/postcss.config.js`, `packages/ui/tailwind.config.cjs`, `packages/ui/tsconfig.cjs.json`, `packages/ui/tsconfig.esm.json`
- Delete: `packages/ui/.storybook/`
- Delete: `packages/ui/src/main.css`
- Create: `packages/ui/src/styles.css`
- Create: `packages/ui/tsdown.config.ts`
- Modify: `packages/ui/tsconfig.json`
- Modify: `packages/ui/package.json`

**Interfaces:**
- Consumes: `@cms/icons`, `@cms/ui-preset`
- Produces: `@cms/ui` component exports and `@cms/ui/styles.css`

- [ ] **Step 1: Clean up legacy configs in `packages/ui`**

Remove:
- `packages/ui/postcss.config.js`
- `packages/ui/tailwind.config.cjs`
- `packages/ui/tsconfig.cjs.json`
- `packages/ui/tsconfig.esm.json`
- `packages/ui/src/main.css`
- Directory `packages/ui/.storybook/`

- [ ] **Step 2: Create `packages/ui/src/styles.css`**

Create `packages/ui/src/styles.css`:
```css
@import "tailwindcss";
@import "@cms/ui-preset/theme.css";

@source "./**/*.{ts,tsx}";

:root {
  background-color: var(--bg-subtle);
  color: var(--fg-base);
  text-rendering: optimizeLegibility;
}
```

- [ ] **Step 3: Update `packages/ui/package.json`**

Update `packages/ui/package.json` to:
- `"private": true`, `"type": "module"`
- `"scripts"`: `build`, `clean`, `typecheck`, `test`
- `"dependencies"`:
  - `@cms/icons`: `"workspace:*"`
  - `@cms/ui-preset`: `"workspace:*"`
  - `clsx`: `"^2.1.1"`
  - `cva`: `"1.0.0-beta.1"`
  - `tailwind-merge`: `"^3.7.0"`
  - Radix UI and utility packages
- `"peerDependencies"`: `"react": "^19.0.0"`, `"react-dom": "^19.0.0"`
- `"devDependencies"`: `@cms/tsconfig`, `@types/react: ^19.3.0`, `@types/react-dom: ^19.3.0`, `tailwindcss: ^4.3.3`, `tsdown: ^0.23.0`
- `"exports"`:
  ```json
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles.css"
  }
  ```

- [ ] **Step 4: Create `packages/ui/tsdown.config.ts`**

Write `packages/ui/tsdown.config.ts`:
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

- [ ] **Step 5: Update `packages/ui/tsconfig.json`**

Update `packages/ui/tsconfig.json`:
```json
{
  "extends": "@cms/tsconfig/react.json",
  "compilerOptions": {
    "paths": {
      "@cms/ui": ["./src/index.ts"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", ".cache", ".turbo"]
}
```

- [ ] **Step 6: Verify `@cms/ui` build and typecheck**

Run: `bun --filter @cms/ui build`
Expected: Build complete.
Run: `bun --filter @cms/ui typecheck`
Expected: Pass with 0 errors.

---

### Task 4: Full Monorepo Integration & Verification Gate

**Files:**
- Root `bun.lock` (updated via `bun install`)

- [ ] **Step 1: Synchronize monorepo dependencies**

Run: `bun install`
Expected: Resolves workspace dependencies cleanly.

- [ ] **Step 2: Build all packages across the workspace**

Run: `bun run build:packages`
Expected: All packages (`@cms/shared`, `@cms/sdk`, `@cms/validators`, `@cms/cli`, `@cms/i18n`, `@cms/design-system`, `@cms/icons`, `@cms/ui-preset`, `@cms/ui`) build successfully with exit code 0.

- [ ] **Step 3: Run workspace typecheck**

Run: `bun run typecheck`
Expected: Pass across all workspace members with exit code 0.
