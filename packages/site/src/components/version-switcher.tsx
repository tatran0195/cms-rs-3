import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cms/design-system/components/ui/dropdown-menu';
import { siteT } from '@cms/i18n/site';
import { Check, ChevronDown, GitBranch } from 'lucide-react';

export interface SiteVersion {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

export function VersionSwitcher({
  versions,
  activeSlug,
  onChange,
  lang,
}: {
  versions: SiteVersion[];
  activeSlug: string;
  onChange: (slug: string) => void;
  lang?: string;
}) {
  const t = siteT(lang);
  const effectiveVersions =
    versions && versions.length > 0 ? versions : activeSlug ? [{ id: activeSlug, name: activeSlug, slug: activeSlug, isDefault: true }] : [];

  if (effectiveVersions.length === 0) {
    return null;
  }

  const active =
    effectiveVersions.find((version) => version.slug === activeSlug) ??
    effectiveVersions.find((version) => version.isDefault) ??
    effectiveVersions[0];

  if (effectiveVersions.length === 1) {
    return (
      <div
        className="flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-3 font-medium text-muted-foreground text-xs"
        data-testid="version-indicator"
      >
        <GitBranch className="size-3.5" />
        <span className="max-w-[7rem] truncate">{active?.name ?? activeSlug}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 px-3 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={t('changeVersion')}
          >
            <GitBranch className="size-3.5" />
            <span className="max-w-[7rem] truncate">{active?.name ?? activeSlug}</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {effectiveVersions.map((version) => (
          <DropdownMenuItem key={version.id} onClick={() => onChange(version.slug)}>
            <span className="flex-1 truncate">{version.name}</span>
            {version.isDefault ? <span className="text-[10px] text-muted-foreground">{t('defaultVersion')}</span> : null}
            {version.slug === active?.slug ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
