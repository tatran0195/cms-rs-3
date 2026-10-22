import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { useProjects, useWorkspaceSettings } from '@cms/sdk/react';
import { useNavigate } from '@tanstack/react-router';
import { Check, ChevronRight, Download, Plus, Settings, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { useSyncExternalStore } from 'react';

const subscribeToHydration = () => () => undefined;

export interface WorkspaceMenuProps {
  projectId?: string;
  trigger?: ReactElement;
  side?: 'right' | 'bottom' | 'left' | 'top';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function WorkspaceMenu({ projectId, trigger, side = 'bottom', align = 'start', className }: WorkspaceMenuProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspaceSettings();
  const { data: projects } = useProjects();

  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  const workspaceName = (hydrated ? workspace?.name : null) || 'Workspace';
  const workspaceInitial = (workspaceName[0] ?? 'W').toUpperCase();

  return (
    <DropdownMenu>
      {trigger ? (
        <DropdownMenuTrigger render={trigger} />
      ) : (
        <DropdownMenuTrigger
          className={cn(
            'flex min-w-0 max-w-[200px] cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring select-none',
            className,
          )}
          aria-label={`Workspace: ${workspaceName}`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/80 text-[11px] font-bold text-foreground">
            {workspaceInitial}
          </span>
          <span className="truncate font-semibold text-xs tracking-tight text-foreground/90">{workspaceName}</span>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" />
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent side={side} align={align} className="w-64 p-1">
        {/* Workspace item with flyout submenu (identical to Mintlify) */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60">
            <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/80 text-[11px] font-bold text-foreground">
              {workspaceInitial}
            </span>
            <span className="truncate flex-1 text-xs">{workspaceName}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent side="right" align="start" className="w-56 p-1">
            <DropdownMenuItem
              onClick={() => navigate({ to: '/app' })}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium"
            >
              <Check className="size-3.5 text-primary" />
              <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/80 text-[11px] font-bold text-foreground">
                {workspaceInitial}
              </span>
              <span className="truncate flex-1">{workspaceName}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate({ to: '/app/settings', search: { tab: 'workspace-general' } })}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="size-3.5" />
              <span>{t('settings.tab.account') || 'Workspace settings'}</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Projects section (identical to Mintlify) */}
        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80">
          {t('dashboard.header.projects') || 'Projects'}
        </DropdownMenuLabel>
        <div className="max-h-56 overflow-y-auto">
          {(projects ?? []).map((site) => (
            <DropdownMenuItem
              key={site.id}
              onClick={() =>
                navigate({
                  to: '/app/projects/$projectId/editor',
                  params: { projectId: site.id },
                })
              }
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/90 hover:bg-muted/60"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center text-primary">
                {site.id === projectId ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
              </span>
              <span className="truncate flex-1">{site.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuItem
          onClick={() => navigate({ to: '/app/sites', search: { newSite: true } })}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          <span>{t('dashboard.newProject')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Workspace Actions (identical to Mintlify) */}
        <DropdownMenuItem
          onClick={() => navigate({ to: '/app/settings', search: { tab: 'workspace-members' } })}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Users className="size-3.5" />
          <span>{t('members.title') || 'Invite members'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate({ to: '/app/settings', search: { tab: 'workspace-general' } })}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Settings className="size-3.5" />
          <span>{t('nav.settings') || 'Workspace settings'}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            window.location.href = '/api/runner/download';
          }}
          className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Download className="size-3.5" />
            <span>
              {(() => {
                const val = (t as (k: string) => string)('workspace.downloadRunner');
                return !val || val === 'workspace.downloadRunner' ? 'Download runner (.exe)' : val;
              })()}
            </span>
          </span>
          <span className="text-[10px] uppercase font-mono text-muted-foreground/60">CLI</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
