import { Button } from '@cms/design-system/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@cms/design-system/components/ui/sidebar';
import { useT } from '@cms/i18n/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { NotificationsPopover, ProjectSidebar } from '@/features/workspace';
import { useProject } from '@/hooks/api';

export { PublishControl } from '@/features/publishing';

/** The per-site shell: a left sidebar (switcher + sections + account) with a slim
 *  content header. Publishing lives ONLY in the editor (Mintlify-style); the
 *  dashboard header just offers a live-site preview. */
export function ProjectLayout({ projectId, children }: { projectId: string; children: ReactNode }) {
  const t = useT();
  const { data: project } = useProject(projectId);
  const previewEnabled = project ? project.config?.addons?.previewDeployments !== false : false;
  // The editor is a focused, full-screen workspace (Mintlify-style): it renders
  // its OWN chrome (top bar + page-tree sidebar) and hides the dashboard nav.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.endsWith('/editor')) {
    return <div className="h-screen overflow-hidden">{children}</div>;
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '18rem',
          '--header-height': '3rem',
        } as CSSProperties
      }
    >
      <ProjectSidebar projectId={projectId} />
      <SidebarInset>
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
            >
              <Eye className="size-3.5" /> {t('project.preview')}
            </Button>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
