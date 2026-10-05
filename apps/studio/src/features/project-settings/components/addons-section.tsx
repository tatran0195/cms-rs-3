import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@cms/design-system/components/ui/accordion';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { Switch } from '@cms/design-system/components/ui/switch';
import { cn } from '@cms/design-system/lib/utils';
import type { MessageKey } from '@cms/i18n';
import { useT } from '@cms/i18n/react';
import type { AddonGroup, AddonId } from '@cms/shared/addons';
import { Blocks, CheckCircle2, MessageSquareText, TriangleAlert } from 'lucide-react';
import { type ComponentType, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { ProjectAddon } from '@/hooks/api';
import { useActivateProjectAddon, useDeactivateProjectAddon, useProjectAddons, useUpdateProjectAddon } from '@/hooks/api';
import { SectionHeader } from './shared';

const GROUPS = [
  { id: 'engagement', icon: MessageSquareText },
] as const satisfies ReadonlyArray<{
  id: AddonGroup;
  icon: ComponentType<{ className?: string }>;
}>;

const ADDON_KEYS: Record<AddonId, { title: MessageKey; description: MessageKey }> = {
  feedback: {
    title: 'settings.addons.feedback.title',
    description: 'settings.addons.feedback.hint',
  },
  'edit-suggestions': {
    title: 'settings.addons.editSuggestions.title',
    description: 'settings.addons.editSuggestions.hint',
  },
  'issue-links': {
    title: 'settings.addons.issueLinks.title',
    description: 'settings.addons.issueLinks.hint',
  },
};

const stringConfig = (config: Record<string, unknown>, key: string, fallback = '') => {
  const value = z.string().safeParse(config[key]);
  return value.success ? value.data : fallback;
};

/** Options for the configurable add-on selects. The values mirror the shared
 *  add-on config enums; one array feeds both the trigger label (`items`) and the
 *  rendered options so the two can't drift. */
type ConfigOption = { value: string; labelKey: MessageKey };
const FEEDBACK_PLACEMENT_OPTIONS = [
  {
    value: 'after-content',
    labelKey: 'settings.addons.feedback.placement.afterContent',
  },
  {
    value: 'after-navigation',
    labelKey: 'settings.addons.feedback.placement.afterNavigation',
  },
] as const satisfies ReadonlyArray<ConfigOption>;
const FEEDBACK_PRESENTATION_OPTIONS = [
  {
    value: 'compact',
    labelKey: 'settings.addons.feedback.presentation.compact',
  },
  { value: 'card', labelKey: 'settings.addons.feedback.presentation.card' },
] as const satisfies ReadonlyArray<ConfigOption>;

function StatusBadge({ addon }: { addon: ProjectAddon }) {
  const t = useT();
  const statusKey = `settings.addons.status.${addon.status.replace('_', '')}` as MessageKey;
  return (
    <Badge variant={addon.status === 'active' ? 'secondary' : 'outline'}>
      {addon.status === 'active' ? <CheckCircle2 aria-hidden /> : addon.status === 'needs_configuration' ? <TriangleAlert aria-hidden /> : null}
      {t(statusKey)}
    </Badge>
  );
}

function ConfigurationField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}

function ConfigSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<ConfigOption>;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const items = options.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
  return (
    <ConfigurationField label={label}>
      <Select items={items} onValueChange={(next) => onChange(next ?? value)} value={value}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ConfigurationField>
  );
}

function AddonCard({ addon, projectId }: { addon: ProjectAddon; projectId: string }) {
  const t = useT();
  const update = useUpdateProjectAddon(projectId);
  const activate = useActivateProjectAddon(projectId);
  const deactivate = useDeactivateProjectAddon(projectId);
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown> | null>(null);
  const config = draftConfig ?? addon.config;
  const pending = update.isPending || activate.isPending || deactivate.isPending;
  const keys = ADDON_KEYS[addon.id];

  const save = () => {
    const nextConfig =
      addon.id === 'edit-suggestions' || addon.id === 'issue-links'
        ? (() => {
            const urlTemplate = stringConfig(config, 'urlTemplate').trim();
            return urlTemplate ? { urlTemplate } : {};
          })()
        : config;
    update.mutate(
      {
        addonId: addon.id,
        body: { config: nextConfig, expectedRevision: addon.revision },
      },
      {
        onSuccess: () => toast.success(t('common.saved')),
        onError: () => toast.error(t('settings.saveError')),
      },
    );
  };
  const toggle = (enabled: boolean) => {
    const mutation = enabled ? activate : deactivate;
    mutation.mutate(
      { addonId: addon.id, expectedRevision: addon.revision },
      {
        onSuccess: () => toast.success(t('common.saved')),
        onError: () => toast.error(t('settings.saveError')),
      },
    );
  };

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-sm">{t(keys.title)}</h4>
            <StatusBadge addon={addon} />
          </div>
          <p className="mt-1 text-muted-foreground text-sm leading-relaxed">{t(keys.description)}</p>
        </div>
        <Switch
          aria-label={t(addon.enabled ? 'settings.addons.disable' : 'settings.addons.enable', { name: t(keys.title) })}
          checked={addon.enabled}
          disabled={pending}
          onCheckedChange={toggle}
        />
      </div>

      <div className="mt-4 grid gap-4 border-border border-t pt-4">
        {addon.id === 'feedback' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ConfigSelect
              label={t('settings.addons.feedback.placement')}
              onChange={(placement) => setDraftConfig({ ...config, placement })}
              options={FEEDBACK_PLACEMENT_OPTIONS}
              value={stringConfig(config, 'placement', 'after-content')}
            />
            <ConfigSelect
              label={t('settings.addons.feedback.presentation')}
              onChange={(presentation) => setDraftConfig({ ...config, presentation })}
              options={FEEDBACK_PRESENTATION_OPTIONS}
              value={stringConfig(config, 'presentation', 'compact')}
            />
          </div>
        ) : null}

        {addon.id === 'edit-suggestions' || addon.id === 'issue-links' ? (
          <ConfigurationField label={t(addon.id === 'edit-suggestions' ? 'settings.addons.editUrl.label' : 'settings.addons.issueUrl.label')}>
            <Input
              aria-label={t(addon.id === 'edit-suggestions' ? 'settings.addons.editUrl.label' : 'settings.addons.issueUrl.label')}
              className="font-mono text-sm"
              onChange={(event) => setDraftConfig({ ...config, urlTemplate: event.target.value })}
              placeholder={
                addon.id === 'edit-suggestions'
                  ? t('settings.addons.editUrl.placeholder', {
                      path: '{path}',
                    })
                  : t('settings.addons.issueUrl.placeholder', {
                      url: '{url}',
                    })
              }
              value={stringConfig(config, 'urlTemplate')}
            />
          </ConfigurationField>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={pending} onClick={save} type="button">
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function AddonsSection({ projectId }: { projectId: string }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useProjectAddons(projectId);

  return (
    <div>
      <SectionHeader description={t('settings.addons.description')} icon={<Blocks className="size-4" />} title={t('settings.addons.title')} />
      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{t('settings.addons.loadError')}</p>
          <Button className="mt-3" onClick={() => refetch()} size="sm" variant="outline">
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      {data ? (
        <Accordion className="overflow-hidden rounded-xl border border-border bg-card" defaultValue={['engagement']} multiple>
          {GROUPS.map((group) => {
            const items = data.filter((addon) => addon.group === group.id);
            const Icon = group.icon;
            return (
              <AccordionItem className="px-4 sm:px-5" key={group.id} value={group.id}>
                <AccordionTrigger className="items-center gap-3 py-4 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{t(`settings.addons.group.${group.id}.title` as MessageKey)}</span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">
                        {t(`settings.addons.group.${group.id}.description` as MessageKey)}
                      </span>
                    </span>
                  </span>
                  <Badge className="ms-auto me-2" variant="outline">
                    {items.filter((addon) => addon.enabled).length}/{items.length}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent className="grid gap-3 pb-5">
                  {items.map((addon) => (
                    <AddonCard addon={addon} key={`${addon.id}-${addon.revision}`} projectId={projectId} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : null}
      <p className={cn('mt-4 text-muted-foreground text-xs', !data && 'hidden')}>{t('settings.addons.boundary')}</p>
    </div>
  );
}
