import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useUpdateProjectConfig } from '@cms/sdk/react';
import type { NavTabItem } from '@cms/validators';
import { useState } from 'react';
import { saveConfigSection, ToggleRow } from '../shared';
import { cleanTabItems } from '../tabs-tree-utils';
import { NavbarScopeForm } from './navbar-scope-form';
import { cleanAnchorRows, cleanRows, normalizeLinks, normalizeTabs } from './navbar-utils';

export function ProjectNavbarForm({ project, onDirtyChange }: { project: Project; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useT();
  const update = useUpdateProjectConfig(project.id);
  const navbar = project.config?.navbar ?? {};
  const [showSearch, setShowSearch] = useState<boolean>(navbar.showSearch ?? true);
  const [showChangelog, setShowChangelog] = useState<boolean>(navbar.changelog ?? false);

  return (
    <NavbarScopeForm
      extraDirty={showSearch !== (navbar.showSearch ?? true) || showChangelog !== (navbar.changelog ?? false)}
      extraToggles={
        <>
          <ToggleRow
            checked={showSearch}
            hint={t('settings.navbar.showSearch.hint')}
            onCheckedChange={setShowSearch}
            title={t('settings.navbar.showSearch.title')}
          />
          <ToggleRow
            checked={showChangelog}
            hint={t('settings.navbar.changelog.hint')}
            onCheckedChange={setShowChangelog}
            title={t('settings.navbar.changelog.title')}
          />
        </>
      }
      initial={{
        ctaLabel: navbar.ctaLabel ?? '',
        ctaUrl: navbar.ctaUrl ?? '',
        links: normalizeLinks(navbar.links),
        tabs: normalizeTabs(navbar.tabs),
        anchors: (navbar.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onDirtyChange={onDirtyChange}
      onSave={(value) =>
        saveConfigSection(update, {
          navbar: {
            ctaLabel: value.ctaLabel.trim() || undefined,
            ctaUrl: value.ctaUrl.trim() || undefined,
            links: cleanRows(value.links),
            tabs: cleanTabItems(value.tabs as NavTabItem[]),
            anchors: cleanAnchorRows(value.anchors),
            showSearch,
            changelog: showChangelog,
          },
        })
      }
      showGlobalFields
    />
  );
}
