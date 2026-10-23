# Fumadocs Live Layout Preview (`WithControl`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1,462-line static mock in `ThemeStoryWindow` with an authentic Fumadocs live layout preview engine that executes the real `template.ReaderLayout` (`notebook`, `glass`, `flux`, `spacious`, `docs`), with an authentic page tree and dynamic interactive demo content (`DemoPage`, `DemoContent`).

**Architecture:** 
- A dedicated subsystem in `packages/site/src/preview/` provides `createDemoTree`, interactive `DemoPage`/`DemoContent`, and `LiveDocsLayoutPreview`.
- `LiveDocsLayoutPreview` binds the real `template.ReaderLayout` with full granular layout slots (real sidebar tree, real navbar, active page navigation, real table of contents).
- `ThemeStoryWindow` is streamlined from 1,462 lines down to ~150 lines, hosting `LiveDocsLayoutPreview` within the macOS window frame and keeping the browser address bar synchronized.

**Tech Stack:** TypeScript, React 19, Lucide React, Tailwind CSS / Vanilla CSS, Vitest.

## Global Constraints

- Platform is internal company deployment — NO billing, plan tiers, or public SaaS landing routes.
- Use existing design system components (`cn`) and Lucide icons.
- Must execute the real `template.ReaderLayout` rather than miniature dummy boxes (`StudioPreviewLayout`).
- Ensure all interactive navigation elements inside the preview update `activePath` and address bar without full-page refreshes.

---

### Task 1: Create `demo-tree.ts` and Unit Tests

**Files:**
- Create: `packages/site/src/preview/demo-tree.ts`
- Create: `packages/site/src/preview/demo-tree.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DemoTreePage {
    type: 'page';
    name: string;
    path: string;
    description: string;
    icon?: string;
    headings: Array<{ id: string; text: string; depth: number }>;
  }
  export interface DemoTreeSeparator {
    type: 'separator';
    name: string;
  }
  export interface DemoTreeFolder {
    type: 'folder';
    name: string;
    description?: string;
    root?: boolean;
    defaultOpen?: boolean;
    icon?: string;
    children: Array<DemoTreeNode>;
  }
  export type DemoTreeNode = DemoTreePage | DemoTreeSeparator | DemoTreeFolder;
  export interface DemoTreeRoot {
    name: string;
    children: DemoTreeNode[];
  }
  export function createDemoTree(basePath?: string): DemoTreeRoot;
  export function findDemoPage(nodes: DemoTreeNode[], path: string): DemoTreePage | undefined;
  ```

- [ ] **Step 1: Write the failing unit test**

Create `packages/site/src/preview/demo-tree.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDemoTree, findDemoPage } from './demo-tree';

describe('demo-tree', () => {
  it('creates complete Fumadocs page tree structure', () => {
    const tree = createDemoTree();
    expect(tree.name).toBe('Docs');
    expect(tree.children.length).toBeGreaterThanOrEqual(2);

    const framework = tree.children.find((c) => c.type === 'folder' && c.name === 'Framework');
    expect(framework).toBeDefined();

    const apiRef = tree.children.find((c) => c.type === 'folder' && c.name === 'API Reference');
    expect(apiRef).toBeDefined();
  });

  it('locates pages correctly by path', () => {
    const tree = createDemoTree();
    const overview = findDemoPage(tree.children, '');
    expect(overview?.name).toBe('Overview');

    const tabs = findDemoPage(tree.children, 'components/tabs');
    expect(tabs?.name).toBe('Tabs');

    const cards = findDemoPage(tree.children, 'components/cards');
    expect(cards?.name).toBe('Cards');
  });

  it('falls back to overview when path not found', () => {
    const tree = createDemoTree();
    const unknown = findDemoPage(tree.children, 'non-existent-page');
    expect(unknown?.name).toBe('Overview');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/preview/demo-tree.test.ts` in `packages/site`
Expected: FAIL with "Cannot find module './demo-tree'"

- [ ] **Step 3: Implement `demo-tree.ts`**

Create `packages/site/src/preview/demo-tree.ts`:
```ts
export interface DemoTreePage {
  type: 'page';
  name: string;
  path: string;
  description: string;
  icon?: string;
  headings: Array<{ id: string; text: string; depth: number }>;
}

export interface DemoTreeSeparator {
  type: 'separator';
  name: string;
}

export interface DemoTreeFolder {
  type: 'folder';
  name: string;
  description?: string;
  root?: boolean;
  defaultOpen?: boolean;
  icon?: string;
  children: Array<DemoTreeNode>;
}

export type DemoTreeNode = DemoTreePage | DemoTreeSeparator | DemoTreeFolder;

export interface DemoTreeRoot {
  name: string;
  children: DemoTreeNode[];
}

const DEFAULT_HEADINGS = [
  { id: 'introduction', text: 'Introduction', depth: 2 },
  { id: 'installation', text: 'Installation', depth: 2 },
  { id: 'usage', text: 'Usage', depth: 2 },
  { id: 'configuration', text: 'Configuration', depth: 3 },
  { id: 'deployment', text: 'Deployment', depth: 2 },
];

export function createDemoTree(basePath = ''): DemoTreeRoot {
  const normalizePath = (p: string) => {
    if (!basePath) return p;
    return p ? `${basePath}/${p}` : basePath;
  };

  const page = (
    name: string,
    path: string,
    description: string,
    icon?: string,
    headings = DEFAULT_HEADINGS,
  ): DemoTreePage => ({
    type: 'page',
    name,
    path: normalizePath(path),
    description,
    icon,
    headings,
  });

  return {
    name: 'Docs',
    children: [
      {
        type: 'folder',
        name: 'Framework',
        description: 'Build your documentation site',
        root: true,
        icon: 'Book',
        children: [
          { type: 'separator', name: 'Introduction' },
          page('Overview', '', 'Live documentation architecture preview with interactive component customization.', 'Book'),
          page('Quick Start', 'quick-start', 'Create your first docs site in minutes.', 'Rocket', [
            { id: 'quick-start', text: 'Quick Start', depth: 2 },
            { id: 'install-dependencies', text: 'Install Dependencies', depth: 3 },
            { id: 'choose-layout', text: 'Choose Layout', depth: 3 },
          ]),
          page('Themes', 'themes', 'Customize the colors, typography, and look of your site.', 'Palette', [
            { id: 'themes', text: 'Themes', depth: 2 },
            { id: 'color-tokens', text: 'Color Tokens', depth: 3 },
            { id: 'dark-mode', text: 'Dark Mode', depth: 3 },
          ]),
          { type: 'separator', name: 'Components' },
          {
            type: 'folder',
            name: 'Components',
            icon: 'Layers',
            children: [
              page('Callout', 'components/callout', 'Highlight important notices, tips, and warnings.', 'Info', [
                { id: 'callout-component', text: 'Callout Component', depth: 2 },
                { id: 'callout-variants', text: 'Callout Variants', depth: 3 },
              ]),
              page('Cards', 'components/cards', 'Feature grids, link hubs, and call-to-actions.', 'Folder', [
                { id: 'cards-component', text: 'Cards Component', depth: 2 },
                { id: 'card-grids', text: 'Card Grids', depth: 3 },
              ]),
              page('Tabs', 'components/tabs', 'Switch between packages, languages, or alternatives.', 'Folder', [
                { id: 'tabs-component', text: 'Tabs Component', depth: 2 },
                { id: 'code-tabs', text: 'Code Tabs', depth: 3 },
              ]),
            ],
          },
          { type: 'separator', name: 'Deployment' },
          page('Static Export', 'deployment/static', 'Export your docs as pre-rendered static HTML.', 'Server', [
            { id: 'static-export', text: 'Static Export', depth: 2 },
          ]),
        ],
      },
      {
        type: 'folder',
        name: 'API Reference',
        description: 'Endpoints and OpenAPI integration',
        root: true,
        icon: 'Server',
        children: [
          page('Introduction', 'api', 'Get started with the developer API.', 'Terminal', [
            { id: 'api-overview', text: 'API Overview', depth: 2 },
            { id: 'authentication', text: 'Authentication', depth: 3 },
          ]),
          page('Authentication', 'api/authentication', 'Authorize API requests with Bearer tokens.', 'Layers', [
            { id: 'auth-tokens', text: 'Auth Tokens', depth: 2 },
          ]),
        ],
      },
    ],
  };
}

export function findDemoPage(nodes: DemoTreeNode[], path: string): DemoTreePage | undefined {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  let overviewFallback: DemoTreePage | undefined;

  function walk(items: DemoTreeNode[]): DemoTreePage | undefined {
    for (const item of items) {
      if (item.type === 'page') {
        if (item.path === normalized) return item;
        if (item.path === '' && !overviewFallback) overviewFallback = item;
      }
      if (item.type === 'folder') {
        const found = walk(item.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  return walk(nodes) ?? overviewFallback;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/preview/demo-tree.test.ts` in `packages/site`
Expected: PASS with 3/3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/preview/demo-tree.ts packages/site/src/preview/demo-tree.test.ts
git commit -m "feat(site): add Fumadocs demo tree data model and page lookup"
```

---

### Task 2: Create `demo-content.tsx` with Interactive Components

**Files:**
- Create: `packages/site/src/preview/demo-content.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface DemoPageProps {
    activePath: string;
    onNavigate: (path: string) => void;
  }
  export function DemoPage(props: DemoPageProps): ReactNode;
  ```

- [ ] **Step 1: Implement `demo-content.tsx`**

Create `packages/site/src/preview/demo-content.tsx`:
```tsx
import { cn } from '@cms/design-system/lib/utils';
import { Check, Copy, Palette, Rocket } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Callout, Card, CardGroup, Tab, Tabs } from '../components/mdx-components';
import { createDemoTree, findDemoPage } from './demo-tree';

export interface DemoPageProps {
  activePath: string;
  onNavigate: (path: string) => void;
}

const tree = createDemoTree();

export function DemoPage({ activePath, onNavigate }: DemoPageProps): ReactNode {
  const page = findDemoPage(tree.children, activePath);
  const normalized = activePath.replace(/^\/+|\/+$/g, '');

  return (
    <article className="space-y-6 text-foreground">
      {/* Title & Description */}
      <div className="space-y-2 border-b border-border/60 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {page?.name ?? 'Documentation'}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {page?.description ?? 'Live documentation architecture preview with interactive component customization.'}
        </p>
      </div>

      {/* Page Content Body */}
      {normalized === 'components/tabs' || normalized === 'tabs' ? (
        <TabsShowcase />
      ) : normalized === 'components/cards' || normalized === 'cards' ? (
        <CardsShowcase onNavigate={onNavigate} />
      ) : normalized === 'components/callout' || normalized === 'callout' ? (
        <CalloutsShowcase />
      ) : normalized === 'themes' ? (
        <ThemesShowcase />
      ) : (
        <DefaultDemoContent onNavigate={onNavigate} />
      )}
    </article>
  );
}

function DefaultDemoContent({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'npm' | 'pnpm' | 'yarn'>('npm');

  const codeSnippets: Record<'npm' | 'pnpm' | 'yarn', string> = {
    npm: 'npm i @cms/site fumadocs-core',
    pnpm: 'pnpm add @cms/site fumadocs-core',
    yarn: 'yarn add @cms/site fumadocs-core',
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="space-y-3">
        <h2 id="introduction" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Introduction
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is an authentic live preview of your documentation layout running Fumadocs&apos; real layout engine. Open pages in the sidebar,
          switch layouts, or adjust theme colors to see instant updates.
        </p>
      </div>

      {/* Interactive Quick Links Cards */}
      <CardGroup cols={2}>
        <div onClick={() => onNavigate('quick-start')} className="cursor-pointer">
          <Card title="Quick Start" icon="Rocket">
            Create your first docs site in minutes with full Markdown and MDX support.
          </Card>
        </div>
        <div onClick={() => onNavigate('themes')} className="cursor-pointer">
          <Card title="Themes & Palettes" icon="Palette">
            Customize primary accents, canvas background, surfaces, and typography tokens.
          </Card>
        </div>
      </CardGroup>

      {/* Installation Tabs */}
      <div className="space-y-3">
        <h2 id="installation" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Installation
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">Install the framework packages with your package manager:</p>
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5">
            <div className="flex items-center gap-1 text-xs">
              {(['npm', 'pnpm', 'yarn'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCodeTab(tab)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                    codeTab === tab ? 'bg-background text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre data-theme-component="code" className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto">
            <code>{codeSnippets[codeTab]}</code>
          </pre>
        </div>
      </div>

      {/* Usage Section */}
      <div className="space-y-3">
        <h2 id="usage" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Usage
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Wrap your documentation pages in the selected layout shell. Layout tabs highlight the active page section automatically.
        </p>
      </div>

      {/* Callout */}
      <Callout type="info">
        For complete control over design tokens, customize typography, radius, density, and colors directly in the Props table below.
      </Callout>

      {/* Deployment Section */}
      <div className="space-y-3">
        <h2 id="deployment" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Deployment
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your documentation site compiles to clean, fast static HTML with automatic incremental cache invalidation.
        </p>
      </div>
    </>
  );
}

function TabsShowcase() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Tabs organize content into switchable panels without cluttering your page.
      </p>
      <Tabs>
        <Tab title="TypeScript">
          <pre className="p-4 rounded-lg bg-muted/40 font-mono text-xs">
            <code>const greeting: string = &quot;Hello Fumadocs&quot;;</code>
          </pre>
        </Tab>
        <Tab title="JavaScript">
          <pre className="p-4 rounded-lg bg-muted/40 font-mono text-xs">
            <code>const greeting = &quot;Hello Fumadocs&quot;;</code>
          </pre>
        </Tab>
      </Tabs>
    </div>
  );
}

function CardsShowcase({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Cards display links, features, and navigational hubs across your documentation site.
      </p>
      <CardGroup cols={2}>
        <div onClick={() => onNavigate('')} className="cursor-pointer">
          <Card title="Documentation Overview" icon="Book">
            Return to the main documentation overview page.
          </Card>
        </div>
        <div onClick={() => onNavigate('quick-start')} className="cursor-pointer">
          <Card title="Quick Start Guide" icon="Rocket">
            Step-by-step onboarding for new developers.
          </Card>
        </div>
      </CardGroup>
    </div>
  );
}

function CalloutsShowcase() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Callouts draw attention to notes, best practices, warnings, and security alerts.
      </p>
      <Callout type="note">Note: This is an informational notice.</Callout>
      <Callout type="tip">Tip: Use keyboard shortcuts like ⌘K to search quickly.</Callout>
      <Callout type="warning">Warning: Changing primary domains requires DNS propagation time.</Callout>
    </div>
  );
}

function ThemesShowcase() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Choose from Harbor, Manuscript, or Signal presets, or customize tokens in the Props table below.
      </p>
      <Callout type="info">
        Theme styles propagate immediately across all documentation components and site chrome.
      </Callout>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck packages/site**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/preview/demo-content.tsx
git commit -m "feat(site): add Fumadocs DemoPage and interactive demo content components"
```

---

### Task 3: Create `live-layout-preview.tsx` and Package Exports

**Files:**
- Create: `packages/site/src/preview/live-layout-preview.tsx`
- Create: `packages/site/src/preview/index.ts`
- Modify: `packages/site/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LiveDocsLayoutPreviewProps {
    layoutId: DocsLayoutId;
    activePath: string;
    onNavigate: (path: string) => void;
    theme?: ResolvedTheme;
    className?: string;
  }
  export function LiveDocsLayoutPreview(props: LiveDocsLayoutPreviewProps): ReactNode;
  ```

- [ ] **Step 1: Implement `live-layout-preview.tsx`**

Create `packages/site/src/preview/live-layout-preview.tsx`:
```tsx
import { cn } from '@cms/design-system/lib/utils';
import type { DocsLayoutId, ResolvedTheme } from '@cms/shared/themes';
import { Book, Code2, Folder, Layers, Palette, Rocket, Search, Server, Terminal } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { TableOfContents, TOCPopover } from '../components/toc';
import { useDocumentationTheme } from '../components/documentation-theme-provider';
import { getDocsLayoutTemplate } from '../layouts';
import { DemoPage } from './demo-content';
import { createDemoTree, type DemoTreeNode, findDemoPage } from './demo-tree';

export interface LiveDocsLayoutPreviewProps {
  layoutId: DocsLayoutId;
  activePath: string;
  onNavigate: (path: string) => void;
  theme?: ResolvedTheme;
  className?: string;
}

const ICON_MAP: Record<string, typeof Book> = {
  Book,
  Rocket,
  Palette,
  Layers,
  Folder,
  Terminal,
  Server,
};

export function LiveDocsLayoutPreview({
  layoutId,
  activePath,
  onNavigate,
  theme: propTheme,
  className,
}: LiveDocsLayoutPreviewProps): ReactNode {
  const contextTheme = useDocumentationTheme();
  const theme = propTheme ?? contextTheme;
  const template = useMemo(() => getDocsLayoutTemplate(layoutId), [layoutId]);
  const tree = useMemo(() => createDemoTree(), []);
  const [activeRoot, setActiveRoot] = useState<'framework' | 'api'>('framework');

  const activePage = findDemoPage(tree.children, activePath);
  const normalizedPath = activePath.replace(/^\/+|\/+$/g, '');

  const rootFolder = tree.children.find((c) =>
    activeRoot === 'framework' ? c.type === 'folder' && c.name === 'Framework' : c.type === 'folder' && c.name === 'API Reference',
  );

  // ── Brand Slot ─────────────────────────────────────────────────────────────
  const brandSlot = (
    <div className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-xs">
        D
      </span>
      <span className="font-semibold text-sm tracking-tight text-foreground">Docs Preview</span>
    </div>
  );

  // ── Search Slots ───────────────────────────────────────────────────────────
  const searchFullSlot = (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 text-muted-foreground text-xs shadow-2xs">
      <Search className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">Search documentation...</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/80 bg-muted text-[10px] font-mono">⌘K</kbd>
    </div>
  );

  const searchButtonSlot = (
    <button type="button" className="grid size-8 place-items-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground" aria-label="Search">
      <Search className="size-3.5" />
    </button>
  );

  // ── Tools Slot ─────────────────────────────────────────────────────────────
  const toolsSlot = (
    <div className="flex items-center gap-1.5">
      <a
        href="https://github.com/fuma-nama/fumadocs"
        target="_blank"
        rel="noreferrer"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="GitHub"
      >
        <Code2 className="size-4" />
      </a>
    </div>
  );

  // ── Navigation Links & Tabs ────────────────────────────────────────────────
  const navLinksSlot = (
    <nav className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('');
        }}
        className={cn('cursor-pointer transition-colors hover:text-foreground', activeRoot === 'framework' ? 'text-primary font-semibold' : '')}
      >
        Guide
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('components/tabs');
        }}
        className="cursor-pointer transition-colors hover:text-foreground"
      >
        Components
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('api');
          onNavigate('api');
        }}
        className={cn('cursor-pointer transition-colors hover:text-foreground', activeRoot === 'api' ? 'text-primary font-semibold' : '')}
      >
        API Reference
      </button>
    </nav>
  );

  const navTabsSlot = (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={() => {
          setActiveRoot('framework');
          onNavigate('');
        }}
        className={cn(
          'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
          activeRoot === 'framework' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        Framework
      </button>
      <button
        type="button"
        onClick={() => {
          setActiveRoot('api');
          onNavigate('api');
        }}
        className={cn(
          'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
          activeRoot === 'api' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        API Reference
      </button>
    </div>
  );

  // ── Sidebar Tree Nodes ─────────────────────────────────────────────────────
  const renderSidebarItem = (node: DemoTreeNode, key: string): ReactNode => {
    if (node.type === 'separator') {
      return (
        <div key={key} className="px-2 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {node.name}
        </div>
      );
    }
    if (node.type === 'page') {
      const isSelected = normalizedPath === node.path.replace(/^\/+|\/+$/g, '');
      const Icon = node.icon ? ICON_MAP[node.icon] ?? Book : Book;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onNavigate(node.path)}
          className={cn(
            'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-start transition-colors cursor-pointer',
            isSelected ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    }
    if (node.type === 'folder') {
      const Icon = node.icon ? ICON_MAP[node.icon] ?? Folder : Folder;
      return (
        <div key={key} className="space-y-0.5">
          {!node.root && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted-foreground/80">
              <Icon className="size-3 shrink-0" />
              <span>{node.name}</span>
            </div>
          )}
          <div className={cn('space-y-0.5', !node.root && 'ps-2 border-s border-border/40 ms-2')}>
            {node.children.map((child, idx) => renderSidebarItem(child, `${key}-${idx}`))}
          </div>
        </div>
      );
    }
    return null;
  };

  const sidebarTreeSlot = (
    <div className="space-y-1 text-xs">
      {rootFolder?.type === 'folder' ? rootFolder.children.map((child, idx) => renderSidebarItem(child, `tree-${idx}`)) : null}
    </div>
  );

  // ── Breadcrumb, TOC, Page Layout ───────────────────────────────────────────
  const breadcrumbSlot = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
      <span>Docs</span>
      <span>/</span>
      <span className="text-foreground font-medium">{activePage?.name ?? 'Overview'}</span>
    </div>
  );

  const tableOfContentsSlot = (
    <TableOfContents
      headings={activePage?.headings ?? []}
      style={theme.layout.tocStyle ?? 'clerk'}
      depth={theme.layout.tocDepth ?? 3}
      label="On this page"
    />
  );

  const tocPopoverSlot = (
    <TOCPopover
      headings={activePage?.headings ?? []}
      style={theme.layout.tocStyle ?? 'clerk'}
      depth={theme.layout.tocDepth ?? 3}
      label="On this page"
    />
  );

  const pageContent = template.PageLayout({
    breadcrumb: breadcrumbSlot,
    article: <DemoPage activePath={activePath} onNavigate={onNavigate} />,
    tableOfContents: tableOfContentsSlot,
    tocPopover: tocPopoverSlot,
  });

  return (
    <div className={cn('w-full', className)}>
      {template.ReaderLayout({
        header: brandSlot,
        navigation: sidebarTreeSlot,
        content: pageContent,
        brand: brandSlot,
        searchFull: searchFullSlot,
        searchButton: searchButtonSlot,
        tools: toolsSlot,
        navLinks: navLinksSlot,
        navTabs: navTabsSlot,
        sidebarTree: sidebarTreeSlot,
      })}
    </div>
  );
}
```

Create `packages/site/src/preview/index.ts`:
```ts
export * from './demo-tree';
export * from './demo-content';
export * from './live-layout-preview';
```

Export in `packages/site/src/index.ts`:
```ts
export * from './preview';
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/preview/live-layout-preview.tsx packages/site/src/preview/index.ts packages/site/src/index.ts
git commit -m "feat(site): add LiveDocsLayoutPreview running real reader layouts"
```

---

### Task 4: Unit Tests for `LiveDocsLayoutPreview`

**Files:**
- Create: `packages/site/src/preview/live-layout-preview.test.tsx`

- [ ] **Step 1: Write unit tests for all 5 layouts**

Create `packages/site/src/preview/live-layout-preview.test.tsx`:
```tsx
/** @vitest-environment jsdom */

import { resolveTheme } from '@cms/shared/themes';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentationThemeProvider } from '../components/documentation-theme-provider';
import { LiveDocsLayoutPreview } from './live-layout-preview';

describe('LiveDocsLayoutPreview', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    const activeRoot = root;
    if (activeRoot) {
      act(() => activeRoot.unmount());
    }
    container?.remove();
    container = null;
    root = null;
  });

  const theme = resolveTheme({} as any);

  it.each(['notebook', 'glass', 'flux', 'spacious', 'docs'] as const)(
    'renders real layout for %s without error',
    (layoutId) => {
      act(() => {
        root!.render(
          <DocumentationThemeProvider theme={theme} context="studio-preview" direction="ltr">
            <LiveDocsLayoutPreview layoutId={layoutId} activePath="" onNavigate={vi.fn()} theme={theme} />
          </DocumentationThemeProvider>,
        );
      });

      expect(container?.textContent).toContain('Docs Preview');
      expect(container?.textContent).toContain('Overview');
    },
  );

  it('renders interactive tabs content when activePath is components/tabs', () => {
    act(() => {
      root!.render(
        <DocumentationThemeProvider theme={theme} context="studio-preview" direction="ltr">
          <LiveDocsLayoutPreview layoutId="notebook" activePath="components/tabs" onNavigate={vi.fn()} theme={theme} />
        </DocumentationThemeProvider>,
      );
    });

    expect(container?.textContent).toContain('Tabs Component');
    expect(container?.textContent).toContain('TypeScript');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun run test src/preview/live-layout-preview.test.tsx` in `packages/site`
Expected: PASS with all layout tests passing.

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/preview/live-layout-preview.test.tsx
git commit -m "test(site): add comprehensive unit tests for LiveDocsLayoutPreview"
```

---

### Task 5: Refactor `ThemeStoryWindow`

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx`

- [ ] **Step 1: Replace 1,462-line static mock in `ThemeStoryWindow`**

In `apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx`:
Replace the entire file contents with:
```tsx
import { cn } from '@cms/design-system/lib/utils';
import {
  type DocsLayoutId,
  type ResolvedTheme,
  THEME_TOKEN_CSS_VARIABLES,
  type ThemeColorKey,
  type ThemeColorTokens,
  type ThemeComponents,
  type ThemeLayout,
} from '@cms/shared/themes';
import { DocumentationThemeProvider, LiveDocsLayoutPreview } from '@cms/site';
import type { ProjectConfig } from '@cms/validators';
import { type CSSProperties, useMemo, useState } from 'react';

export interface ThemeStoryWindowProps {
  layoutId: DocsLayoutId;
  effectiveConfig: ProjectConfig;
  resolvedTheme: ResolvedTheme;
  resolvedColors?: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout?: ThemeLayout;
  resolvedComponents?: ThemeComponents;
  appearance: 'light' | 'dark' | 'system';
  onAppearanceChange?: (appearance: 'light' | 'dark' | 'system') => void;
  options?: Partial<ThemeLayout>;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

export function ThemeStoryWindow({
  layoutId,
  effectiveConfig,
  resolvedTheme,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  appearance,
  onAppearanceChange: _onAppearanceChange,
  options: _options,
  isFullscreen = false,
  onToggleFullscreen,
  className,
}: ThemeStoryWindowProps) {
  const [activePath, setActivePath] = useState('');

  const currentLayout = resolvedLayout ?? resolvedTheme.layout;
  const currentComponents = resolvedComponents ?? resolvedTheme.components;

  const effectiveTheme: ResolvedTheme = useMemo(
    () => ({
      ...resolvedTheme,
      layout: currentLayout,
      components: currentComponents,
    }),
    [resolvedTheme, currentLayout, currentComponents],
  );

  const draftThemeVariables = useMemo(() => {
    const isDark = appearance === 'dark';
    const activeColors = resolvedColors ? (isDark ? resolvedColors.dark : resolvedColors.light) : undefined;
    const vars: Record<string, string> = {};

    if (activeColors) {
      for (const [key, value] of Object.entries(activeColors)) {
        const cssVar = THEME_TOKEN_CSS_VARIABLES[key as ThemeColorKey];
        if (cssVar && value) {
          vars[cssVar] = value;
        }
      }
    }

    const radius = currentLayout.radius ?? 'rounded';
    const radiusValue = radius === 'pill' ? '9999px' : radius === 'sharp' ? '0px' : '0.625rem';
    vars['--radius'] = radiusValue;

    return vars as CSSProperties;
  }, [appearance, resolvedColors, currentLayout]);

  return (
    <div
      className={cn(
        'relative overflow-hidden flex flex-col',
        isFullscreen ? 'flex-1 min-h-0 size-full p-0 bg-background' : 'px-3 py-3.5 sm:px-5 sm:py-4 bg-[#181615]',
        className,
      )}
      style={
        isFullscreen
          ? undefined
          : {
              backgroundImage: 'radial-gradient(circle, #e29f372b 1.25px, transparent 1.25px)',
              backgroundSize: '16px 16px',
            }
      }
    >
      {/* macOS Window Chrome Container */}
      <div
        className={cn(
          'relative overflow-hidden bg-background transition-colors flex flex-col min-h-0',
          isFullscreen ? 'flex-1 size-full rounded-none border-0 shadow-none' : 'rounded-xl border border-border/80 shadow-2xl',
        )}
      >
        {/* macOS Window Header */}
        <div className="flex h-8.5 shrink-0 items-center justify-between border-b border-border/70 bg-muted px-3.5 select-none">
          <div className="flex items-center gap-2">
            <span data-window-control="close" className="size-2.5 rounded-full bg-[#ff5f57] border border-black/10 inline-block" />
            <span data-window-control="minimize" className="size-2.5 rounded-full bg-[#febc2e] border border-black/10 inline-block" />
            <button
              type="button"
              data-window-control="maximize"
              onClick={onToggleFullscreen}
              className="size-2.5 rounded-full bg-[#28c840] border border-black/10 inline-block cursor-pointer hover:opacity-80 transition-opacity"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-0.5 text-[10.5px] font-mono text-muted-foreground">
            <span>
              https://docs.local/preview/{layoutId}
              {activePath ? `/${activePath.replace(/^\/+/, '')}` : ''}
            </span>
          </div>
          <div className="size-2.5" />
        </div>

        {/* Live Docs Template Rendering Viewport */}
        <DocumentationThemeProvider
          appearance={appearance === 'dark' ? 'dark' : 'light'}
          className="size-full overflow-hidden text-sm flex-1 flex flex-col min-h-0 relative [transform:translateZ(0)]"
          context="studio-preview"
          direction="ltr"
          style={{
            ...draftThemeVariables,
            transform: 'translateZ(0)',
          }}
          theme={effectiveTheme}
        >
          <div className={cn('overflow-y-auto', isFullscreen ? 'flex-1 min-h-0 size-full' : 'min-h-[380px] max-h-[460px]')}>
            <LiveDocsLayoutPreview
              layoutId={layoutId}
              activePath={activePath}
              onNavigate={setActivePath}
              theme={effectiveTheme}
            />
          </div>
        </DocumentationThemeProvider>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/theme-story-window.tsx
git commit -m "refactor(studio): replace static ThemeStoryWindow with LiveDocsLayoutPreview"
```

---

### Task 6: Update `ThemeStoryWindow` Tests

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-story-window.test.tsx`

- [ ] **Step 1: Update unit tests in `theme-story-window.test.tsx`**

Update `apps/studio/src/features/project-settings/components/theme/theme-story-window.test.tsx`:
Ensure assertions verify:
1. Window chrome renders with `https://docs.local/preview/{layoutId}`.
2. Clicking sidebar navigation items updates address bar and renders target content without errors.
3. Fullscreen toggle callbacks fire properly.

- [ ] **Step 2: Run vitest on `theme-story-window.test.tsx`**

Run: `bun run test src/features/project-settings/components/theme/theme-story-window.test.tsx` in `apps/studio`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/theme-story-window.test.tsx
git commit -m "test(studio): update theme-story-window tests for LiveDocsLayoutPreview"
```

---

### Task 7: Full Verification and Browser Check

**Files:**
- Verify all modified files

- [ ] **Step 1: Run typechecks across workspace**

Run: `bun run typecheck` in `apps/studio`
Expected: PASS with 0 errors.

- [ ] **Step 2: Run full test suites**

Run: `bun run test` in `packages/site`
Expected: All tests PASS.

- [ ] **Step 3: Browser Verification with `browser_subagent`**

Navigate to `http://localhost:4310/app/projects/674a181f-5f07-4920-9f66-2f0fd54f5144/settings?section=branding` (or the Theme configuration tab):
1. In the Preview Playground:
   - Verify layout is `notebook`.
   - Click "Tabs" in the sidebar:
     - Verify address bar updates to `https://docs.local/preview/notebook/components/tabs`.
     - Verify content area displays "Tabs Component" and interactive `<Tabs>` panels with code blocks (CONFIRM: NO EMPTY WHITE SCREEN!).
   - Click "Cards" in the sidebar:
     - Verify content updates to "Cards Component".
   - Switch layout to `glass`, `flux`, `spacious`, and `docs`:
     - Verify each layout renders its authentic Fumadocs shell cleanly.
   - Toggle dark/light appearance:
     - Verify color tokens update instantly.
