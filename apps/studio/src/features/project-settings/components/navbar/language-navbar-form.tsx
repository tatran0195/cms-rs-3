import { useT } from '@cms/i18n/react';
import type { Language, Project } from '@cms/sdk';
import { useUpdateLanguage } from '@cms/sdk/react';
import type { LanguageConfig, NavTabItem } from '@cms/validators';
import { toast } from 'sonner';
import { cleanTabItems } from '../tabs-tree-utils';
import { NavbarScopeForm } from './navbar-scope-form';
import { cleanAnchorRows, cleanRows, normalizeTabs } from './navbar-utils';

export function LanguageNavbarForm({
  project,
  language,
  onDirtyChange,
}: {
  project: Project;
  language: Language;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const update = useUpdateLanguage(project.id);
  const override: NonNullable<LanguageConfig['navbar']> = language.config?.navbar ?? {};

  return (
    <NavbarScopeForm
      ctaLabelPlaceholder={project.config?.navbar?.ctaLabel || undefined}
      direction={language.direction === 'RTL' ? 'rtl' : 'ltr'}
      globalPreview={{
        ctaUrl: project.config?.navbar?.ctaUrl ?? '',
        showSearch: project.config?.navbar?.showSearch ?? true,
        changelog: project.config?.navbar?.changelog ?? false,
      }}
      initial={{
        ctaLabel: override.ctaLabel ?? '',
        ctaUrl: '',
        links: (override.links ?? []).map((link) => ({
          label: link.label,
          href: link.href,
          external: link.external,
        })),
        tabs: normalizeTabs(override.tabs),
        anchors: (override.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onDirtyChange={onDirtyChange}
      onSave={async (value) => {
        const navbar: NonNullable<LanguageConfig['navbar']> = {};
        if (value.ctaLabel.trim()) {
          navbar.ctaLabel = value.ctaLabel.trim();
        }
        const links = cleanRows(value.links);
        if (links.length > 0) {
          navbar.links = links;
        }
        const tabs = cleanTabItems(value.tabs as NavTabItem[]);
        if (tabs.length > 0) {
          navbar.tabs = tabs;
        }
        const anchors = cleanAnchorRows(value.anchors);
        if (anchors.length > 0) {
          navbar.anchors = anchors;
        }
        try {
          await update.mutateAsync({
            id: language.id,
            body: {
              config: {
                navbar: Object.keys(navbar).length > 0 ? navbar : null,
              },
            },
          });
          toast.success(t('common.saved'));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('settings.saveError'));
        }
      }}
    />
  );
}
