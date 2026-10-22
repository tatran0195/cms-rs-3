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
            <SidebarMenuButton className="gap-2.5 data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground" size="lg">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary/10">
                {selected ? <CmsMark className="size-5.5" /> : <LayoutGrid className="size-4.5 text-sidebar-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-sm" dir="auto">
                  {selected?.name ?? workspaceName}
                </span>
                <span className="block truncate text-muted-foreground text-xs">{selected ? t('nav.site') : t('nav.workspace')}</span>
              </span>
              <ChevronsUpDown className="size-4.5 shrink-0 text-muted-foreground" />
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
