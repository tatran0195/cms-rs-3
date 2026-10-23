import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@cms/design-system/components/ui/breadcrumb';
import { Button } from '@cms/design-system/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@cms/design-system/components/ui/sidebar';
import type { MessageKey } from '@cms/i18n';
import { useT } from '@cms/i18n/react';
import { useRouterState } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { useSearchShortcutLabel } from '@/shared';
import { ActivityRail } from './ActivityRail';
import { AppSidebar } from './AppSidebar';
import { CommandPalette } from './CommandPalette';
import { NotificationsPopover } from './NotificationsPopover';

/** Derive the header title key from the current dashboard route. */
function titleKeyFromPathname(pathname: string): MessageKey {
  if (pathname.startsWith('/app/members')) {
    return 'dashboard.header.members';
  }
  if (pathname.startsWith('/app/settings')) {
    return 'dashboard.header.settings';
  }
  if (pathname.startsWith('/app/analytics')) return 'nav.analytics';
  if (pathname.startsWith('/app/sites')) return 'nav.sites';
  if (pathname === '/app' || pathname === '/app/') return 'nav.overview';
  return 'dashboard.header.projects';
}

/** The signed-in workspace shell: unified ActivityRail + context AppSidebar + top bar + command palette. */
export function DashboardLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = t(titleKeyFromPathname(pathname));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isOverview = pathname === '/app' || pathname === '/app/' || pathname.startsWith('/app/sites');
  const isAnalytics = pathname.startsWith('/app/analytics');
  const isFullWidth = isOverview || isAnalytics;
  const searchShortcut = useSearchShortcutLabel();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <ActivityRail onOpenSearch={() => setPaletteOpen(true)} />
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {isFullWidth ? (
          <div className="min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-border border-b bg-background/80 px-6 backdrop-blur">
              <div className="flex items-center gap-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-semibold text-sm">{title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex h-7 w-48 items-center gap-2 rounded-lg border-input bg-transparent px-2.5 text-muted-foreground text-xs shadow-xs font-normal hover:bg-muted/50 dark:bg-input/30"
                  onClick={() => setPaletteOpen(true)}
                  aria-label={t('dashboard.search.placeholder')}
                >
                  <Search className="size-3.5" />
                  <span className="flex-1 text-start truncate">{t('dashboard.search.placeholder')}</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.2 font-mono text-[10px]" dir="ltr">
                    {searchShortcut}
                  </kbd>
                </Button>
                <NotificationsPopover />
              </div>
            </header>
            <main className="w-full flex-1 overflow-y-auto px-6 py-6 min-h-0">{children}</main>
          </div>
        ) : (
          <SidebarProvider
            className="h-full min-h-0"
            style={
              {
                '--sidebar-width': '15rem',
                '--sidebar-left-offset': '3rem',
                '--header-height': '3rem',
              } as CSSProperties
            }
          >
            <AppSidebar />
            <SidebarInset className="min-w-0 h-full flex flex-col overflow-hidden bg-background">
              <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-border border-b bg-background/80 px-4 backdrop-blur">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ms-1" />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbPage className="font-semibold text-sm">{title}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex h-7 w-48 items-center gap-2 rounded-lg border-input bg-transparent px-2.5 text-muted-foreground text-xs shadow-xs font-normal hover:bg-muted/50 dark:bg-input/30"
                    onClick={() => setPaletteOpen(true)}
                    aria-label={t('dashboard.search.placeholder')}
                  >
                    <Search className="size-3.5" />
                    <span className="flex-1 text-start truncate">{t('dashboard.search.placeholder')}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.2 font-mono text-[10px]" dir="ltr">
                      {searchShortcut}
                    </kbd>
                  </Button>
                  <NotificationsPopover />
                </div>
              </header>
              <main className="w-full flex-1 overflow-y-auto px-6 py-8 min-h-0">{children}</main>
            </SidebarInset>
          </SidebarProvider>
        )}
      </div>
      <CommandPalette onOpenChange={setPaletteOpen} open={paletteOpen} />
    </div>
  );
}
