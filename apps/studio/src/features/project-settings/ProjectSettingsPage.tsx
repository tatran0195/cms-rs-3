import { Button } from '@cms/design-system/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { cn } from '@cms/design-system/lib/utils';
import type { MessageKey } from '@cms/i18n';
import { useT } from '@cms/i18n/react';
import {
  Bell,
  Blocks,
  Braces,
  ChartNoAxesCombined,
  CirclePlus,
  GitBranch,
  Globe2,
  Import,
  KeyRound,
  Languages,
  LockKeyhole,
  type LucideIcon,
  Plug,
  Search,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Project } from '@/hooks/api';
import { useProject } from '@/hooks/api';
import { AddonsSection } from './components/addons-section';
import { ApiKeysTab } from './components/api-keys-tab';
import { AuthenticationSection } from './components/authentication-section';
import { DangerSection } from './components/danger-section';
import { DomainSection } from './components/domain-section';
import { GeneralSection } from './components/general-section';
import { GitTab } from './components/git-tab';
import { ImportTab } from './components/import-tab';
import { IntegrationsTab } from './components/integrations-tab';
import { LanguagesSection } from './components/languages-section';
import { MembersSection } from './components/members-section';
import { NotificationsTab } from './components/notifications-tab';
import { OpenApiSection } from './components/openapi-section';
import { SearchSection } from './components/search-section';
import { UsageTab } from './components/usage-tab';

export type SettingsGroupId = 'site' | 'deployment' | 'workspace' | 'advanced';

export type SectionId =
  | 'general'
  | 'languages'
  | 'domain'
  | 'authentication'
  | 'search'
  | 'addons'
  | 'git'
  | 'openapi'
  | 'contentImport'
  | 'members'
  | 'apiKeys'
  | 'usage'
  | 'integrations'
  | 'notifications'
  | 'danger';

export const GROUPS = [
  { id: 'site', labelKey: 'settings.group.site' },
  { id: 'deployment', labelKey: 'settings.group.deployment' },
  { id: 'workspace', labelKey: 'settings.group.workspace' },
  { id: 'advanced', labelKey: 'settings.group.advanced' },
] as const satisfies ReadonlyArray<{
  id: SettingsGroupId;
  labelKey: MessageKey;
}>;

export const SECTIONS = [
  { id: 'general', group: 'site', icon: CirclePlus },
  { id: 'languages', group: 'site', icon: Languages },
  { id: 'domain', group: 'site', icon: Globe2 },
  { id: 'authentication', group: 'site', icon: LockKeyhole },
  { id: 'search', group: 'site', icon: Search },
  { id: 'addons', group: 'site', icon: Blocks },
  { id: 'git', group: 'deployment', icon: GitBranch },
  { id: 'openapi', group: 'deployment', icon: Braces },
  { id: 'contentImport', group: 'deployment', icon: Import },
  { id: 'members', group: 'workspace', icon: Users },
  { id: 'apiKeys', group: 'workspace', icon: KeyRound },
  { id: 'usage', group: 'workspace', icon: ChartNoAxesCombined },
  { id: 'integrations', group: 'workspace', icon: Plug },
  { id: 'notifications', group: 'workspace', icon: Bell },
  { id: 'danger', group: 'advanced', icon: TriangleAlert },
] as const satisfies ReadonlyArray<{
  id: SectionId;
  group: SettingsGroupId;
  icon: LucideIcon;
}>;

export const isSectionId = (value: unknown): value is SectionId => SECTIONS.some((section) => section.id === value);

export interface ProjectSettingsPageProps {
  projectId: string;
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
}

export function ProjectSettingsPage({ projectId, section, onSectionChange }: ProjectSettingsPageProps) {
  const { data: project, isLoading } = useProject(projectId);
  const t = useT();
  const sectionItems = SECTIONS.map((item) => ({
    value: item.id,
    label: t(`settings.${item.id}` as MessageKey),
  }));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background md:flex-row">
      <div className="shrink-0 border-border border-b bg-card px-4 py-3 md:hidden">
        <label className="mb-1.5 block font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider" htmlFor="mobile-settings-section">
          {t('settings.heading')}
        </label>
        <Select items={sectionItems} onValueChange={(next) => onSectionChange((next ?? section) as SectionId)} value={section}>
          <SelectTrigger aria-label={t('settings.heading')} className="h-10 w-full rounded-lg font-medium" id="mobile-settings-section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((group) => (
              <SelectGroup key={group.id}>
                <SelectLabel>{t(group.labelKey)}</SelectLabel>
                {SECTIONS.filter((item) => item.group === group.id).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t(`settings.${item.id}` as MessageKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <aside className="hidden w-[238px] shrink-0 overflow-y-auto border-border border-e bg-card px-3 py-4.5 md:block">
        <div className="px-3 pt-1 pb-2.5 font-bold text-[11px] text-muted-foreground uppercase tracking-wider">{t('settings.heading')}</div>
        <nav className="flex flex-col gap-0.5">
          {GROUPS.map((group) => (
            <div key={group.id} className="mt-3 first:mt-0">
              <div className="px-3 pb-1 font-semibold text-[10.5px] text-muted-foreground/70 uppercase tracking-wider">{t(group.labelKey)}</div>
              {SECTIONS.filter((item) => item.group === group.id).map((item) => {
                const active = item.id === section;
                const Icon = item.icon;
                return (
                  <Button
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'h-9 w-full justify-start gap-2 rounded-lg px-3 text-[13.5px]',
                      active ? 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary' : 'text-muted-foreground',
                    )}
                    key={item.id}
                    onClick={() => onSectionChange(item.id)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {t(`settings.${item.id}` as MessageKey)}
                  </Button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 md:px-9 md:pt-8 md:pb-32">
          {isLoading || !project ? <SectionSkeleton /> : <ActiveSection projectId={projectId} project={project} section={section} />}
        </div>
      </div>
    </div>
  );
}

function ActiveSection({ project, section, projectId }: { project: Project; section: SectionId; projectId: string }) {
  // `key` forces a fresh form instance (with the right defaults) per project/section.
  const sections: Record<SectionId, ReactNode> = {
    general: <GeneralSection key={`general-${project.id}`} project={project} />,
    languages: <LanguagesSection key={`languages-${project.id}`} project={project} />,
    domain: <DomainSection key={`domain-${projectId}`} project={project} />,
    authentication: <AuthenticationSection key={`authentication-${project.id}`} project={project} />,
    search: <SearchSection key={`search-${project.id}`} project={project} />,
    addons: <AddonsSection key={`addons-${project.id}`} projectId={project.id} />,
    git: <GitTab key={`git-${projectId}`} projectId={projectId} />,
    openapi: <OpenApiSection key={`openapi-${projectId}`} projectId={projectId} />,
    contentImport: <ImportTab key={`import-${projectId}`} projectId={projectId} />,
    members: <MembersSection key={`members-${projectId}`} projectId={projectId} />,
    apiKeys: <ApiKeysTab key={`api-keys-${projectId}`} projectId={projectId} />,
    usage: <UsageTab key={`usage-${project.id}`} project={project} />,
    integrations: <IntegrationsTab key={`integrations-${projectId}`} projectId={projectId} project={project} />,
    notifications: <NotificationsTab key={`notifications-${projectId}`} projectId={projectId} />,
    danger: <DangerSection project={project} />,
  };
  const wideSection = section === 'general' || section === 'usage' || section === 'integrations';
  return <div className={cn('w-full', wideSection ? 'max-w-6xl' : 'max-w-4xl')}>{sections[section]}</div>;
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[42px] w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[42px] w-full" />
      </div>
    </div>
  );
}
