import type { ReactNode } from 'react';
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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{page?.name ?? 'Documentation'}</h1>
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

const USAGE_CODE = `import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function Layout({ children }) {
  return <DocsLayout tree={source.getPageTree()}>{children}</DocsLayout>;
}`;

function DefaultDemoContent({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <>
      <div className="space-y-3">
        <h2 id="introduction" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Introduction
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is a live preview of the layout. Open the pages in sidebar, search for content, or
          switch the theme, it works like your docs site.
        </p>
      </div>

      {/* Interactive Quick Links Cards */}
      <CardGroup cols={2}>
        <button type="button" onClick={() => onNavigate('quick-start')} className="text-start w-full cursor-pointer">
          <Card title="Quick Start" icon="Rocket">
            Create your first docs site in minutes.
          </Card>
        </button>
        <button type="button" onClick={() => onNavigate('themes')} className="text-start w-full cursor-pointer">
          <Card title="Themes" icon="Palette">
            Customize the colors and the look of your site.
          </Card>
        </button>
      </CardGroup>

      {/* Installation Tabs */}
      <div className="space-y-3">
        <h2 id="installation" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Installation
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">Install the packages with your package manager:</p>
        <Tabs>
          <Tab title="npm">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>npm i fumadocs-ui fumadocs-core</code>
            </pre>
          </Tab>
          <Tab title="pnpm">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>pnpm add fumadocs-ui fumadocs-core</code>
            </pre>
          </Tab>
          <Tab title="yarn">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>yarn add fumadocs-ui fumadocs-core</code>
            </pre>
          </Tab>
        </Tabs>
      </div>

      {/* Usage Section */}
      <div className="space-y-3">
        <h2 id="usage" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Usage
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Wrap your pages with the layout, it takes a page tree which is generated from your content files.
        </p>
        <div className="rounded-lg border border-border/80 bg-(--theme-code) overflow-hidden">
          <div className="border-b border-border/50 bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            app/docs/layout.tsx
          </div>
          <pre
            data-theme-component="code"
            className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) overflow-x-auto"
          >
            <code>{USAGE_CODE}</code>
          </pre>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Navigation items, including the sidebar and layout tabs, highlight the active page. Layout tabs show the content of one root folder at a time.
        </p>
      </div>

      {/* Configuration Section */}
      <div className="space-y-3">
        <h3 id="configuration" className="text-lg font-bold tracking-tight text-foreground scroll-m-4">
          Configuration
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every layout accepts options for the navbar, the theme switch and the search toggle. Options specific to a layout are listed on its page.
        </p>
        <Callout type="info" title="Good to know">
          For full control over the UI, install the layout with Fumadocs CLI and edit the components directly.
        </Callout>
      </div>

      {/* Deployment Section */}
      <div className="space-y-3">
        <h2 id="deployment" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Deployment
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your docs site is a normal React.js app, deploy it like other apps of your framework. Static export is supported when your framework supports it.
        </p>
      </div>
    </>
  );
}

function TabsShowcase() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">Tabs organize content into switchable panels without cluttering your page.</p>
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
        <button type="button" onClick={() => onNavigate('')} className="text-start w-full cursor-pointer">
          <Card title="Documentation Overview" icon="Book">
            Return to the main documentation overview page.
          </Card>
        </button>
        <button type="button" onClick={() => onNavigate('quick-start')} className="text-start w-full cursor-pointer">
          <Card title="Quick Start Guide" icon="Rocket">
            Step-by-step onboarding for new developers.
          </Card>
        </button>
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
      <Callout type="info">Theme styles propagate immediately across all documentation components and site chrome.</Callout>
    </div>
  );
}
