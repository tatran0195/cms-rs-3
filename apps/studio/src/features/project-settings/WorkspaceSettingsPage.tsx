import { Label } from '@cms/design-system/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { cn } from '@cms/design-system/lib/utils';
import type { MessageKey } from '@cms/i18n';
import { useT } from '@cms/i18n/react';
import { canAdminister } from '@cms/shared/rbac';
import { AlertTriangle, Building2, type LucideIcon, Palette, Shield, UserRound, Users } from 'lucide-react';
import { useSession } from '@/features/auth';
import { useMembers } from '@/hooks/api';
import { AccountTab } from './components/account-tab';
import { AppearanceTab } from './components/appearance-tab';
import { WorkspaceDangerTab } from './components/workspace-danger-tab';
import { WorkspaceGeneralTab } from './components/workspace-general-tab';
import { WorkspaceMembersTab } from './components/workspace-members-tab';
import { WorkspaceRolesTab } from './components/workspace-roles-tab';

export type WorkspaceSettingsTab =
  | 'account'
  | 'appearance'
  | 'workspace-general'
  | 'workspace-members'
  | 'workspace-roles'
  | 'workspace-danger';

export interface SectionItem {
  value: WorkspaceSettingsTab;
  labelKey: MessageKey;
  labelFallback: string;
  icon: LucideIcon;
}

export const ACCOUNT_SETTINGS_SECTIONS: ReadonlyArray<SectionItem> = [
  { value: 'account', labelKey: 'settings.tab.account', labelFallback: 'Account', icon: UserRound },
  { value: 'appearance', labelKey: 'settings.tab.appearance', labelFallback: 'Appearance', icon: Palette },
] as const;

export const WORKSPACE_SETTINGS_SECTIONS: ReadonlyArray<SectionItem> = [
  { value: 'workspace-general', labelKey: 'settings.tab.account', labelFallback: 'General', icon: Building2 },
  { value: 'workspace-members', labelKey: 'members.title', labelFallback: 'Members', icon: Users },
  { value: 'workspace-roles', labelKey: 'settings.tab.account', labelFallback: 'Roles & Permissions', icon: Shield },
  { value: 'workspace-danger', labelKey: 'settings.tab.account', labelFallback: 'Danger Zone', icon: AlertTriangle },
] as const;

export const ALL_SETTINGS_SECTIONS: ReadonlyArray<SectionItem> = [
  ...ACCOUNT_SETTINGS_SECTIONS,
  ...WORKSPACE_SETTINGS_SECTIONS,
];

export const isWorkspaceSettingsTab = (value: unknown): value is WorkspaceSettingsTab =>
  ALL_SETTINGS_SECTIONS.some((s) => s.value === value);

export interface WorkspaceSettingsPageProps {
  tab: WorkspaceSettingsTab;
  onTabChange: (tab: WorkspaceSettingsTab) => void;
}

export function WorkspaceSettingsPage({ tab, onTabChange }: WorkspaceSettingsPageProps) {
  const t = useT();
  const { data: session } = useSession();
  const { data: rawMembers } = useMembers();

  const members =
    (rawMembers as { members?: Array<{ id: string; role: string; user?: { id?: string; email?: string } }> } | undefined)
      ?.members ?? [];

  const currentMember = members.find(
    (m) =>
      (session?.user?.id && m.user?.id === session.user.id) ||
      (session?.user?.email && m.user?.email === session.user.email),
  );

  const currentRole = currentMember?.role ?? 'member';
  const isAdminOrOwner = canAdminister(currentRole);

  const isWorkspaceTab = tab.startsWith('workspace-');
  const effectiveTab: WorkspaceSettingsTab = isWorkspaceTab && !isAdminOrOwner ? 'account' : tab;

  const visibleSections = isAdminOrOwner ? ALL_SETTINGS_SECTIONS : ACCOUNT_SETTINGS_SECTIONS;
  const selectItems = visibleSections.map((item) => ({
    value: item.value,
    label: (t(item.labelKey) as string) || item.labelFallback,
  }));

  const getSectionLabel = (item: SectionItem) => {
    if (item.value === 'workspace-general') return 'General';
    if (item.value === 'workspace-members') return t('members.title') || 'Members';
    if (item.value === 'workspace-roles') return 'Roles & Permissions';
    if (item.value === 'workspace-danger') return 'Danger Zone';
    return t(item.labelKey);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{t('settings.title')}</h1>
        <p className="mt-1 text-muted-foreground text-sm">{t('settings.subtitle')}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:gap-8">
        {/* Mobile dropdown selector */}
        <div className="sm:hidden">
          <Label className="sr-only" htmlFor="settings-section">
            {t('settings.title')}
          </Label>
          <Select
            items={selectItems}
            onValueChange={(value) => {
              if (value) onTabChange(value as WorkspaceSettingsTab);
            }}
            value={effectiveTab}
          >
            <SelectTrigger className="w-full" id="settings-section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleSections.map((item) => {
                const Icon = item.icon;
                return (
                  <SelectItem key={item.value} value={item.value}>
                    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    {getSectionLabel(item)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Left settings navigation grouped into Account and Workspace */}
        <nav className="hidden w-52 shrink-0 flex-col gap-5 sm:flex">
          {/* Account Group */}
          <div className="flex flex-col gap-1">
            <div className="px-3 pb-1 font-semibold text-muted-foreground/70 text-xs tracking-wider uppercase">
              Account
            </div>
            {ACCOUNT_SETTINGS_SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onTabChange(item.value)}
                  className={cn(
                    'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-start font-medium text-[13.5px] transition-colors',
                    effectiveTab === item.value
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Workspace Group (Admin and Owner only) */}
          {isAdminOrOwner && (
            <div className="flex flex-col gap-1">
              <div className="px-3 pb-1 font-semibold text-muted-foreground/70 text-xs tracking-wider uppercase">
                Workspace
              </div>
              {WORKSPACE_SETTINGS_SECTIONS.map((item) => {
                const Icon = item.icon;
                const isDanger = item.value === 'workspace-danger';
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onTabChange(item.value)}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-start font-medium text-[13.5px] transition-colors',
                      effectiveTab === item.value
                        ? isDanger
                          ? 'bg-destructive/10 text-destructive font-semibold'
                          : 'bg-primary/10 text-primary font-semibold'
                        : isDanger
                          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-4 shrink-0', isDanger && 'text-destructive/80')} />
                    {getSectionLabel(item)}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Tab content area */}
        <div className="min-w-0 w-full flex-1">
          {effectiveTab === 'appearance' ? (
            <AppearanceTab />
          ) : effectiveTab === 'workspace-general' ? (
            <WorkspaceGeneralTab />
          ) : effectiveTab === 'workspace-members' ? (
            <WorkspaceMembersTab />
          ) : effectiveTab === 'workspace-roles' ? (
            <WorkspaceRolesTab />
          ) : effectiveTab === 'workspace-danger' ? (
            <WorkspaceDangerTab />
          ) : (
            <AccountTab />
          )}
        </div>
      </div>
    </div>
  );
}
