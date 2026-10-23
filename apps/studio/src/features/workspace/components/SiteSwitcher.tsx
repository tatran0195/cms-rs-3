import { CmsMark } from '@cms/design-system/brand';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@cms/design-system/components/ui/sidebar';
import { useT } from '@cms/i18n/react';
import { useProjects, useWorkspaceSettings } from '@cms/sdk/react';
import { ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { WorkspaceMenu } from './WorkspaceMenu';

const subscribeToHydration = () => () => undefined;

export function SiteSwitcher({ projectId }: { projectId?: string }) {
  const { data: projects } = useProjects();
  const { data: workspace } = useWorkspaceSettings();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const selected = hydrated ? projects?.find((project) => project.id === projectId) : undefined;
  const workspaceName = (hydrated ? workspace?.name : null) || 'Workspace';
  const t = useT();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <WorkspaceMenu
          projectId={projectId}
          side="bottom"
          align="start"
          trigger={
            <SidebarMenuButton
              className="h-9 gap-2 data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              size="default"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-primary/10">
                {selected ? <CmsMark className="size-4" /> : <LayoutGrid className="size-3.5 text-sidebar-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-xs" dir="auto">
                  {selected?.name ?? workspaceName}
                </span>
                <span className="block truncate text-muted-foreground text-[10px] leading-none">{selected ? t('nav.site') : t('nav.workspace')}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
