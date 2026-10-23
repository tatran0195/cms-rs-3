import { Button } from '@cms/design-system/components/ui/button';
import { useDirection } from '@cms/design-system/components/ui/direction';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@cms/design-system/components/ui/sidebar';
import { usePages } from '@cms/sdk/react';
import { Link } from '@tanstack/react-router';
import { FileText, PenLine } from 'lucide-react';
import { SidebarAccountFooter } from './SidebarAccountFooter';
import { SiteSwitcher } from './SiteSwitcher';

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const direction = useDirection();
  const { setOpenMobile } = useSidebar();
  const { data: pages, isPending: pagesPending } = usePages(projectId);

  const docPages = (pages ?? []).filter((p) => p.kind === 'PAGE');

  return (
    <Sidebar side={direction === 'rtl' ? 'right' : 'left'} variant="sidebar">
      {/* Header */}
      <SidebarHeader className="flex h-12 flex-row items-center justify-between border-border border-b px-2">
        <div className="flex-1 min-w-0">
          <SiteSwitcher projectId={projectId} />
        </div>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="px-2 py-2">
        {/* Project Documentation Quick Pages */}
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
            <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">Documentation Pages</span>
            <span className="text-muted-foreground/80 font-mono text-[10px]">{docPages.length}</span>
          </div>

          <SidebarMenu>
            {docPages.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                {pagesPending ? 'Loading pages...' : 'No documentation pages yet'}
              </div>
            ) : (
              docPages.slice(0, 15).map((page) => (
                <SidebarMenuItem key={page.id}>
                  <SidebarMenuButton
                    onClick={() => setOpenMobile(false)}
                    render={<Link to="/app/projects/$projectId/editor" params={{ projectId }} search={{ page: page.id }} />}
                    size="default"
                    tooltip={`${page.title} (/${page.slug})`}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs text-foreground">{page.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    render={<Link to="/app/projects/$projectId/editor" params={{ projectId }} search={{ page: page.id }} />}
                    title="Edit page"
                    aria-label={`Edit ${page.title}`}
                  >
                    <PenLine className="size-3 text-muted-foreground hover:text-foreground" />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-border border-t p-2">
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs font-medium cursor-pointer hover:bg-primary hover:text-primary-foreground"
          render={<Link to="/app/projects/$projectId/editor" params={{ projectId }} />}
        >
          <PenLine className="size-3.5" />
          <span>Open editor</span>
        </Button>
        <div className="md:hidden">
          <SidebarAccountFooter />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
