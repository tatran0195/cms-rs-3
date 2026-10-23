import { CmsMark } from '@cms/design-system/brand';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { useDirection } from '@cms/design-system/components/ui/direction';
import { Input } from '@cms/design-system/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@cms/design-system/components/ui/sidebar';
import { useLocale } from '@cms/i18n/react';
import { useMembers, useProjects } from '@cms/sdk/react';
import { canAdminister } from '@cms/shared/rbac';
import { Link, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Building2, Palette, PenLine, Plus, Search, UserRound, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '@/features/auth';
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog';
import { SidebarAccountFooter } from './SidebarAccountFooter';
import { SiteSwitcher } from './SiteSwitcher';

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchParams = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown> | undefined;
  const activeTab = typeof searchParams?.tab === 'string' ? searchParams.tab : 'account';

  const { t } = useLocale();
  const direction = useDirection();
  const { setOpenMobile } = useSidebar();
  const { data: projects } = useProjects();
  const { data: session } = useSession();
  const { data: rawMembers } = useMembers();

  const [siteFilter, setSiteFilter] = useState('');
  const [newSiteOpen, setNewSiteOpen] = useState(false);

  const isSettingsOrMembers = pathname.startsWith('/app/settings') || pathname.startsWith('/app/members');

  const members =
    (rawMembers as { members?: Array<{ id: string; role: string; user?: { id?: string; email?: string } }> } | undefined)?.members ?? [];
  const currentMember = members.find(
    (m) => (session?.user?.id && m.user?.id === session.user.id) || (session?.user?.email && m.user?.email === session.user.email),
  );
  const currentRole = currentMember?.role ?? 'member';
  const isAdminOrOwner = canAdminister(currentRole);

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    const q = siteFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [projects, siteFilter]);

  return (
    <>
      <Sidebar side={direction === 'rtl' ? 'right' : 'left'} variant="sidebar">
        {/* Header */}
        <SidebarHeader className="flex h-12 flex-row items-center justify-between border-border border-b px-2.5">
          {isSettingsOrMembers ? (
            <div className="flex items-center gap-2 px-1">
              <span className="font-semibold text-sm tracking-tight text-foreground">{t('nav.settings')}</span>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <SiteSwitcher />
            </div>
          )}
        </SidebarHeader>

        {/* Content */}
        <SidebarContent className="px-2 py-2">
          {isSettingsOrMembers ? (
            /* Context 1: Settings Navigation */
            <>
              <SidebarGroup>
                <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Account</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setOpenMobile(false)}
                      isActive={pathname.startsWith('/app/settings') && activeTab === 'account'}
                      render={<Link to="/app/settings" search={{ tab: 'account' }} />}
                      size="default"
                      tooltip={t('settings.tab.account')}
                    >
                      <UserRound className="size-4" />
                      <span>{t('settings.tab.account')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setOpenMobile(false)}
                      isActive={pathname.startsWith('/app/settings') && activeTab === 'appearance'}
                      render={<Link to="/app/settings" search={{ tab: 'appearance' }} />}
                      size="default"
                      tooltip={t('settings.tab.appearance')}
                    >
                      <Palette className="size-4" />
                      <span>{t('settings.tab.appearance')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              {isAdminOrOwner && (
                <SidebarGroup className="mt-2">
                  <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Workspace
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setOpenMobile(false)}
                        isActive={pathname.startsWith('/app/settings') && activeTab === 'workspace-general'}
                        render={<Link to="/app/settings" search={{ tab: 'workspace-general' }} />}
                        size="default"
                        tooltip="General"
                      >
                        <Building2 className="size-4" />
                        <span>General</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setOpenMobile(false)}
                        isActive={pathname.startsWith('/app/members') || (pathname.startsWith('/app/settings') && activeTab === 'workspace-members')}
                        render={<Link to="/app/members" />}
                        size="default"
                        tooltip={t('members.title') || 'Members'}
                      >
                        <Users className="size-4" />
                        <span>{t('members.title') || 'Members'}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setOpenMobile(false)}
                        isActive={pathname.startsWith('/app/settings') && activeTab === 'workspace-danger'}
                        render={<Link to="/app/settings" search={{ tab: 'workspace-danger' }} />}
                        size="default"
                        tooltip="Danger Zone"
                        className="text-destructive/90 hover:text-destructive hover:bg-destructive/10 data-[active=true]:bg-destructive/10 data-[active=true]:text-destructive"
                      >
                        <AlertTriangle className="size-4" />
                        <span>Danger Zone</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              )}
            </>
          ) : (
            /* Context 2: Sites Directory with filter search and quick action */
            <SidebarGroup>
              <div className="mb-2 px-1">
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Filter sites..."
                    value={siteFilter}
                    onChange={(e) => setSiteFilter(e.target.value)}
                    className="h-7.5 ps-7.5 text-xs bg-muted/40 rounded-md"
                    aria-label="Filter sites in sidebar"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">Sites</span>
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                  {filteredProjects.length}
                </Badge>
              </div>

              <SidebarMenu>
                {filteredProjects.length === 0 ? (
                  <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                    {siteFilter ? 'No matching sites' : 'No sites created yet'}
                  </div>
                ) : (
                  filteredProjects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        onClick={() => setOpenMobile(false)}
                        render={<Link to="/app/projects/$projectId" params={{ projectId: project.id }} />}
                        size="default"
                        tooltip={`${project.name} (/${project.slug})`}
                      >
                        <CmsMark className="size-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate font-medium text-xs text-foreground">{project.name}</span>
                          <span className="truncate font-mono text-[10px] text-muted-foreground/80">/{project.slug}</span>
                        </div>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        render={<Link to="/app/projects/$projectId/editor" params={{ projectId: project.id }} />}
                        title="Open in editor"
                        aria-label={`Open ${project.name} in editor`}
                      >
                        <PenLine className="size-3 text-muted-foreground hover:text-foreground" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer */}
        {!isSettingsOrMembers && (
          <SidebarFooter className="border-border border-t p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-xs font-medium cursor-pointer"
              onClick={() => setNewSiteOpen(true)}
            >
              <Plus className="size-3.5" />
              <span>New site</span>
            </Button>
            <div className="md:hidden">
              <SidebarAccountFooter />
            </div>
          </SidebarFooter>
        )}
      </Sidebar>

      <NewProjectDialog open={newSiteOpen} onOpenChange={setNewSiteOpen} />
    </>
  );
}
