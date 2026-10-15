import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@cms/design-system/components/ui/button';
import { SiteNavTabs } from '@cms/site';
import type { NavTabItem } from '@cms/validators';
import { TabsTreeEditor } from '@/features/project-settings/components/navbar-section';

export const Route = createFileRoute('/tabs-preview')({
  component: TabsPreviewPage,
});

const initialTabs: NavTabItem[] = [
  {
    label: 'Products',
    items: [
      {
        label: 'Database',
        href: '/products/db',
        items: [
          { label: 'PostgreSQL Serverless', href: '/products/db/postgres' },
          { label: 'Redis Cache', href: '/products/db/redis' },
        ],
      },
      {
        label: 'Storage & CDN',
        items: [
          { label: 'Blob Storage (S3-compatible)', href: '/products/storage/s3' },
          { label: 'Edge Network', href: '/products/storage/edge' },
        ],
      },
      { label: 'Vector Search', href: '/products/vector' },
    ],
  },
  {
    label: 'Guides',
    items: [
      { label: 'Quickstart', href: '/guides/quickstart' },
      { label: 'Architecture Overview', href: '/guides/architecture' },
    ],
  },
  {
    label: 'API Reference',
    href: 'https://api.example.com/docs',
    external: true,
  },
];

function TabsPreviewPage() {
  const [tabs, setTabs] = useState<NavTabItem[]>(initialTabs);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Header / ChromeSite Navigation Demo */}
      <header className="sticky top-0 z-40 border-border/80 border-b bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5 font-bold text-base tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary font-black text-primary-foreground text-xs">
              CMS
            </span>
            <span>Site Chrome Preview</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
              Live Interactive Test
            </span>
          </div>
        </div>

        {/* Secondary Header Row: SiteNavTabs */}
        <div className="border-border/60 border-t bg-muted/20 py-1.5">
          <div className="mx-auto flex max-w-6xl items-center px-6">
            <SiteNavTabs
              basePath="/preview"
              currentPath="/products/db/postgres"
              projectId="demo"
              tabs={tabs}
            />
          </div>
        </div>
      </header>

      {/* Main Body: Tabs Tree Editor */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="font-semibold text-2xl tracking-tight">Navbar Tabs Tree Editor</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Test arbitrary recursive nesting, depth badges (<code className="rounded bg-muted px-1.5 py-0.5 text-xs">L1</code>,{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">L2</code>,{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">L3</code>), indentation guidelines, expand/collapse,
            sub-tab insertion, sibling reordering, and real-time ChromeSite UI navigation sync.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Tree Editor Panel */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-base">Interactive Tree Editor</h2>
                  <p className="text-muted-foreground text-xs">
                    Changes reflect immediately in the header navigation menu above.
                  </p>
                </div>
                <Button
                  onClick={() => setTabs(initialTabs)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reset Demo Data
                </Button>
              </div>

              <TabsTreeEditor
                direction="ltr"
                onChange={setTabs}
                value={tabs}
              />
            </div>
          </div>

          {/* JSON Tree State Viewer */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-base">Active Tree JSON Model</h2>
                <span className="text-muted-foreground text-xs">{tabs.length} root tab(s)</span>
              </div>
              <pre className="max-h-[500px] overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed text-foreground/90">
                {JSON.stringify(tabs, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
