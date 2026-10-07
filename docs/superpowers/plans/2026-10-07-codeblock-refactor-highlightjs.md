# CodeBlock Component Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `CodeBlock` component in `@cms/ui` to use synchronous `highlight.js`, resolve the line numbers layout bug in Tailwind CSS v4, and align the visual styling with the Medusa UI design reference.

**Architecture:** Replace legacy `prism-react-renderer` with `highlight.js`. Render code line-by-line using synchronized flex rows with a fixed, unselectable left gutter for line numbers. Modernize `CodeBlock.Header` to support both single-snippet file names and multi-tab triggers with an active underline indicator and an action icons slot.

**Tech Stack:** React 19, TypeScript 7, Tailwind CSS v4, `highlight.js`, `@cms/icons`, `@cms/ui-preset`.

## Global Constraints

- **Styling**: Strictly use `@cms/ui-preset/theme.css` tokens (`bg-ui-contrast-bg-base`, `bg-ui-contrast-bg-subtle`, `text-ui-contrast-fg-primary`, `text-ui-contrast-fg-secondary`, `border-ui-contrast-border-base`, `border-ui-contrast-border-bot`).
- **Layout**: Line numbers must strictly sit in a left-aligned gutter on each line row (`select-none`).
- **Dependencies**: Use `highlight.js` (already in the lockfile). Remove `prism-react-renderer` and `prismjs`.
- **Runtime**: Bun workspace commands (`bun --filter @cms/ui`).

---

### Task 1: Update Dependencies in `packages/ui`

**Files:**
- Modify: `packages/ui/package.json`

**Interfaces:**
- Produces: `highlight.js` available in `@cms/ui`.

- [ ] **Step 1: Update `packages/ui/package.json`**
Add `"highlight.js": "^11.12.0"` to dependencies and remove `"prism-react-renderer"` and `"prismjs"`.

- [ ] **Step 2: Run `bun install`**
Run: `bun install` in monorepo root.
Expected: Resolves without error using root lockfile version.

- [ ] **Step 3: Verify package resolution**
Run: `bun run --filter @cms/ui typecheck`

---

### Task 2: Implement Refactored `CodeBlock` Component

**Files:**
- Modify: `packages/ui/src/components/code-block/code-block.tsx`
- Modify: `packages/ui/src/components/code-block/index.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type CodeSnippet = {
    label: string;
    language: string;
    code: string;
    hideLineNumbers?: boolean;
    hideCopy?: boolean;
  };
  export const CodeBlock: React.FC<CodeBlockProps> & {
    Header: typeof Header;
    Body: typeof Body;
    Meta: typeof Meta;
  };
  ```

- [ ] **Step 1: Write failing unit test in `packages/ui/src/components/code-block/code-block.spec.tsx`**

```tsx
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from './code-block';

describe('CodeBlock', () => {
  const snippets = [
    {
      label: 'medusa-config.ts',
      language: 'ts',
      code: 'module.exports = defineConfig({\n  caching: true,\n})',
    },
    {
      label: 'bash',
      language: 'bash',
      code: 'claude # start',
      hideLineNumbers: true,
    },
  ];

  it('renders line numbers in the left gutter', () => {
    render(
      <CodeBlock snippets={snippets}>
        <CodeBlock.Header />
        <CodeBlock.Body />
      </CodeBlock>,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('switches snippet tabs and respects hideLineNumbers', () => {
    render(
      <CodeBlock snippets={snippets}>
        <CodeBlock.Header />
        <CodeBlock.Body />
      </CodeBlock>,
    );

    const bashTab = screen.getByRole('button', { name: 'bash' });
    fireEvent.click(bashTab);

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('claude # start')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bunx vitest run src/components/code-block/code-block.spec.tsx`

- [ ] **Step 3: Implement `code-block.tsx`**
1. Use `hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : 'plaintext' }).value`.
2. Split highlighted output into lines.
3. Render each row as `<div className="flex min-w-full">` with left line number gutter `<span className="w-8 shrink-0 select-none text-right pr-4 text-ui-contrast-fg-secondary/40 font-mono text-[13px] tabular-nums">` and code span `<span className="flex-1 whitespace-pre font-mono text-[13px]" dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }} />`.
4. Style the container with `bg-ui-contrast-bg-base shadow-elevation-code-block rounded-xl border border-ui-contrast-border-base`.
5. Style the inner code container with `px-2 pb-2` outer inset, `bg-ui-contrast-bg-subtle border border-ui-contrast-border-bot rounded-lg p-4 overflow-x-auto`.
6. Implement `Header` with single-label or multi-tab underline indicator and top-right copy button.
7. Implement syntax color classes matching Medusa UI (`.hljs-keyword`, `.hljs-string`, `.hljs-function`, etc.).

- [ ] **Step 4: Run test to verify it passes**
Run: `bunx vitest run src/components/code-block/code-block.spec.tsx`
Expected: PASS

---

### Task 3: Update Stories in `code-block.stories.tsx` & Verify in Storybook

**Files:**
- Modify: `packages/ui/src/components/code-block/code-block.stories.tsx`

- [ ] **Step 1: Add Medusa-style stories to `code-block.stories.tsx`**
Add:
- `SingleSnippet`: Filename header (`medusa-config.ts`), line numbers on left, settings & info & copy actions.
- `MultiTab`: Tabs (`Claude Code`, `Other AI Agents`), CLI prompt without line numbers.
- `Default`: Multi-tab with path subtitle (`/store/products/:id`).
- `ManyLines`: 50+ lines scroll test.

- [ ] **Step 2: Run typecheck and full test suite**
Run: `bun run typecheck`
Run: `bun run test`

- [ ] **Step 3: Format code with Biome**
Run: `bunx @biomejs/biome check --write packages/ui/src/components/code-block`

- [ ] **Step 4: Interactive verification in Storybook**
Verify visual appearance via browser subagent in Storybook and capture screenshots.
