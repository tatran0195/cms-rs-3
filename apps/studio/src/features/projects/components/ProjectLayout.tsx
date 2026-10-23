import { Button } from '@cms/design-system/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@cms/design-system/components/ui/sidebar';
import { useT } from '@cms/i18n/react';
import { useProject } from '@cms/sdk/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { DeployPipeline } from '@/features/publishing/components/DeployPipeline';
import { ActivityRail, CommandPalette, NotificationsPopover, ProjectSidebar } from '@/features/workspace';

export { PublishControl } from '@/features/publishing';

/** The per-site shell: persistent Left Activity Rail (Mintlify-style) across all
 *  project routes + collapsible section navigation and unified command palette. */
export function ProjectLayout({ projectId, children }: { projectId: string; children: ReactNode }) {
  const t = useT();
  const { data: project } = useProject(projectId);
  const previewEnabled = Boolean(project);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isEditor = pathname.endsWith('/editor');
  const isSettings = pathname.includes('/settings');
  const isPreview = pathname.includes('/preview');
  const isOverview = pathname === `/app/projects/${projectId}` || pathname === `/app/projects/${projectId}/`;
  const isAnalytics = pathname.startsWith(`/app/projects/${projectId}/analytics`);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  useEffect(() => {
    const handleOpenSearch = () => setPaletteOpen(true);
    window.addEventListener('cms:open-search', handleOpenSearch);
    return () => window.removeEventListener('cms:open-search', handleOpenSearch);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <ActivityRail projectId={projectId} onOpenSearch={() => setPaletteOpen(true)} onOpenDeploy={() => setDeployOpen(true)} />
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {isEditor || isSettings || isPreview ? (
          children
        ) : isOverview || isAnalytics ? (
          <div className="min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-border border-b bg-background/85 px-6 backdrop-blur">
              {project?.name ? (
                <span className="truncate font-semibold text-sm" dir="auto">
                  {project.name}
                </span>
              ) : (
                <span className="h-4 w-28 animate-pulse rounded bg-muted" aria-hidden />
              )}
              {isAnalytics && (
                <>
                  <span className="text-muted-foreground/40 text-xs">/</span>
                  <span className="font-semibold text-sm text-foreground">{t('nav.analytics')}</span>
                </>
              )}
              <div className="ms-auto flex items-center gap-2">
                <NotificationsPopover />
                <Button
                  nativeButton={false}
                  render={
                    previewEnabled ? (
                      <Link aria-label={t('project.previewDraftAria')} params={{ projectId }} to="/app/projects/$projectId/preview" />
                    ) : (
                      // biome-ignore lint/a11y/useAnchorContent: content is merged from the Button children via Base UI's render prop
                      <a aria-label={t('project.previewLiveAria')} href={`/sites/${projectId}`} rel="noreferrer" target="_blank" />
                    )
                  }
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-normal"
                >
                  <Eye className="size-3.5" /> {t('project.preview')}
                </Button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
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
            <ProjectSidebar projectId={projectId} />
            <SidebarInset className="min-w-0 h-full flex flex-col overflow-hidden bg-background">
              <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-border border-b bg-background/85 px-4 backdrop-blur">
                <SidebarTrigger className="-ms-1" />
                {project?.name ? (
                  <span className="truncate font-medium text-sm" dir="auto">
                    {project.name}
                  </span>
                ) : (
                  <span className="h-4 w-28 animate-pulse rounded bg-muted" aria-hidden />
                )}
                <div className="ms-auto flex items-center gap-2">
                  <NotificationsPopover />
                  <Button
                    nativeButton={false}
                    render={
                      previewEnabled ? (
                        <Link aria-label={t('project.previewDraftAria')} params={{ projectId }} to="/app/projects/$projectId/preview" />
                      ) : (
                        // biome-ignore lint/a11y/useAnchorContent: content is merged from the Button children via Base UI's render prop
                        <a aria-label={t('project.previewLiveAria')} href={`/sites/${projectId}`} rel="noreferrer" target="_blank" />
                      )
                    }
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs font-normal"
                  >
                    <Eye className="size-3.5" /> {t('project.preview')}
                  </Button>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        )}
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {project ? <DeployPipeline open={deployOpen} onOpenChange={setDeployOpen} project={project} /> : null}
    </div>
  );
}
