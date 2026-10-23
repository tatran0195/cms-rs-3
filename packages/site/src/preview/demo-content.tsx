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

function DefaultDemoContent({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <>
      <div className="space-y-3">
        <h2 id="introduction" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Introduction
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is an authentic live preview of your documentation layout running Fumadocs&apos; real layout engine. Open pages in the sidebar, switch
          layouts, or adjust theme colors to see instant updates.
        </p>
      </div>

      {/* Interactive Quick Links Cards */}
      <CardGroup cols={2}>
        <button type="button" onClick={() => onNavigate('quick-start')} className="text-start w-full cursor-pointer">
          <Card title="Quick Start" icon="Rocket">
            Create your first docs site in minutes with full Markdown and MDX support.
          </Card>
        </button>
        <button type="button" onClick={() => onNavigate('themes')} className="text-start w-full cursor-pointer">
          <Card title="Themes & Palettes" icon="Palette">
            Customize primary accents, canvas background, surfaces, and typography tokens.
          </Card>
        </button>
      </CardGroup>

      {/* Installation Tabs */}
      <div className="space-y-3">
        <h2 id="installation" className="text-xl font-bold tracking-tight text-foreground scroll-m-4">
          Installation
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">Install the framework packages with your package manager:</p>
        <Tabs>
          <Tab title="npm">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>npm i @cms/site fumadocs-core</code>
            </pre>
          </Tab>
          <Tab title="pnpm">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>pnpm add @cms/site fumadocs-core</code>
            </pre>
          </Tab>
          <Tab title="yarn">
            <pre
              data-theme-component="code"
              className="p-3.5 font-mono text-[11.5px] text-(--theme-code-foreground) bg-(--theme-code) overflow-x-auto rounded-lg"
            >
              <code>yarn add @cms/site fumadocs-core</code>
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
