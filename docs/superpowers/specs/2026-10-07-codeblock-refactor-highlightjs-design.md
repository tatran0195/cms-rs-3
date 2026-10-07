# Design Spec: CodeBlock Refactor with highlight.js & Medusa UI Alignment

**Target:** `packages/ui` (`@cms/ui`)  
**Date:** 2026-10-07  
**Status:** Approved  

---

## 1. Executive Summary

This specification outlines the complete refactor of the `CodeBlock` component in `@cms/ui`. The existing component suffered from:
1. **Broken Line Number Placement**: Tailwind CSS v4 invalid arbitrary grid column syntax (`grid-cols-[auto,1fr]`) caused line numbers to render on the far right rather than in a left-aligned gutter.
2. **Decoupled Column Drift**: Line numbers and code tokens were rendered in separate `div` containers, causing alignment drift.
3. **Legacy Syntax Highlighting**: Relied on `prism-react-renderer` and `prismjs` with global mutation (`globalThis.Prism = Prism`) and dynamic imports.
4. **Visual Misalignment with Medusa UI**: The tabs, borders, header actions, and inset code container did not match the clean Medusa UI reference designs provided.

The refactored `CodeBlock` adopts **`highlight.js`** (already in the monorepo root), implements a synchronized row-based rendering pipeline with guaranteed left line numbers, aligns visual styling with the official Medusa UI design patterns (both single-snippet and multi-tab variants), and provides accessible copy feedback.

---

## 2. Visual Reference Analysis (Medusa UI Patterns)

Based on the reference screenshots:

### Pattern A: Single Snippet with File Name
- **Header**:
  - Left: Clean file name (e.g., `medusa-config.ts`) in `text-ui-contrast-fg-secondary txt-compact-small-plus`.
  - Right: Action icons (`Settings`, `Info`, `Copy`).
- **Body**:
  - Inset code block container (`bg-ui-contrast-bg-subtle border-ui-contrast-border-bot rounded-lg border p-4`).
  - Gutter on the left: Line numbers (`1`, `2`, `3`, ...) in `text-ui-contrast-fg-secondary/40 font-mono text-[13px]`, unselectable (`select-none`).
  - Code on the right: Crisp monospace typography (`font-mono text-[13px] leading-relaxed`).

### Pattern B: Multi-Tab Snippets
- **Header**:
  - Left: Tab triggers (e.g., `Claude Code`, `Other AI Agents`).
  - Active tab: `text-ui-contrast-fg-primary font-medium` with an underline indicator bar (`bg-ui-contrast-fg-primary h-0.5`).
  - Inactive tab: `text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary`.
  - Right: Actions slot (`Copy` button with tooltip).
- **Body**:
  - Inset container identical to Pattern A.
  - Option to hide line numbers (`hideLineNumbers={true}`) for CLI/terminal snippets (e.g., bash prompt `>`).

---

## 3. Architecture & API

### 3.1 Component Hierarchy
```
CodeBlock (Root)
├── CodeBlock.Header
│   ├── Tabs / Snippet Labels (Left)
│   ├── Underline Indicator
│   └── Actions & Copy Button (Right)
├── CodeBlock.Toolbar (Optional path/endpoint like /store/products/:id)
└── CodeBlock.Body
    └── Inset Code Container (highlight.js line-by-line render)
```

### 3.2 Types & Props
```typescript
export type CodeSnippet = {
  /** The tab label or filename */
  label: string;
  /** Language identifier for highlight.js (e.g. tsx, bash, json) */
  language: string;
  /** Code content */
  code: string;
  /** Whether to hide line numbers */
  hideLineNumbers?: boolean;
  /** Whether to hide the copy button */
  hideCopy?: boolean;
};

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  snippets: CodeSnippet[];
  /** Optional active tab control */
  activeSnippet?: string;
  onActiveSnippetChange?: (label: string) => void;
}
```

---

## 4. Syntax Highlighting Pipeline (`highlight.js`)

### 4.1 Synchronous Parsing
Instead of async WASM or dynamic imports, `highlight.js` runs synchronously:
```typescript
import hljs from 'highlight.js';

function highlightCode(code: string, language: string): string {
  const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';
  return hljs.highlight(code, { language: validLanguage }).value;
}
```

### 4.2 Row-by-Row Line Split
The highlighted HTML string is split by newline (`\n`):
```tsx
const lines = React.useMemo(() => highlightCode(active.code, active.language).split('\n'), [active.code, active.language]);

<pre className="font-mono text-[13px] leading-relaxed overflow-x-auto select-text">
  <code>
    {lines.map((lineHtml, i) => (
      <div key={i} className="flex min-w-full">
        {!active.hideLineNumbers && (
          <span className="w-8 shrink-0 select-none text-right pr-4 text-ui-contrast-fg-secondary/40 font-mono text-[13px] tabular-nums">
            {i + 1}
          </span>
        )}
        <span
          className="flex-1 whitespace-pre font-mono"
          dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
        />
      </div>
    ))}
  </code>
</pre>
```

### 4.3 Key Guarantees
1. **Left-Gutter Permanence**: Line numbers are always in the first column of the flex row, completely immune to CSS grid arbitrary property parsing issues.
2. **1:1 Alignment**: Even if empty lines exist (`&nbsp;`), every row maintains uniform line height.
3. **Clean Copy**: `select-none` on the line number gutter ensures user drag-selection only selects actual code.

---

## 5. Visual Styling & Token Mapping

Using `@cms/ui-preset/theme.css`:
- **Outer Card**: `bg-ui-contrast-bg-base shadow-elevation-code-block rounded-xl border border-ui-contrast-border-base overflow-hidden`
- **Header**: `flex items-center justify-between px-4 pt-2.5 pb-2`
- **Tab Underline**: `bg-ui-contrast-fg-primary h-0.5 rounded-full transition-all duration-150`
- **Inset Code Container**: `px-2 pb-2` containing `bg-ui-contrast-bg-subtle border border-ui-contrast-border-bot rounded-lg p-4 overflow-x-auto`
- **Syntax Tokens (`.hljs-*`)**:
  - `.hljs-keyword`, `.hljs-selector-tag`: `#c792ea`
  - `.hljs-string`, `.hljs-title`, `.hljs-attr`: `#c3e88d`
  - `.hljs-function`, `.hljs-built_in`: `#82aaff`
  - `.hljs-number`, `.hljs-literal`: `#f78c6c`
  - `.hljs-comment`, `.hljs-quote`: `#6a6a78` (italic)
  - `.hljs-meta`, `.hljs-tag`: `#89ddff`
  - Plain text: `#f4f4f5`

---

## 6. Testing & Storybook Verification

1. **Unit Tests (`code-block.spec.tsx`)**:
   - Verify snippet tab switching updates code and active tab.
   - Verify line numbers render on the left gutter with correct line counts.
   - Verify `hideLineNumbers` suppresses line numbers.
   - Verify copy button copies active snippet code.
2. **Storybook Stories**:
   - `Default`: Multi-tab snippet with path sub-header.
   - `SingleSnippet`: Filename header (`medusa-config.ts`), line numbers on left, settings/info/copy icons.
   - `CommandLine`: CLI commands without line numbers (`Claude Code` style).
   - `ManyLines`: 50+ lines scroll stress test.
