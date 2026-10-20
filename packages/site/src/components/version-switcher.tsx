import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { siteT } from '@cms/i18n/site';
import { Check, ChevronDown, ChevronsUpDown, GitBranch } from 'lucide-react';

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
  variant = 'pill',
  className,
}: {
  versions: SiteVersion[];
  activeSlug: string;
  onChange: (slug: string) => void;
  lang?: string;
  variant?: 'pill' | 'sidebar' | 'compact' | 'tab';
  className?: string;
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

  if (variant === 'tab') {
    if (effectiveVersions.length <= 1) {
      return (
        <div
          className={cn(
            'flex h-8 items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-2.5 text-xs font-medium text-foreground shadow-2xs min-w-0 flex-1',
            className,
          )}
          data-testid="version-indicator"
        >
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{active?.name ?? activeSlug}</span>
        </div>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                'flex h-8 items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-2.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer min-w-0 flex-1',
                className,
              )}
              aria-label={t('changeVersion')}
            >
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium flex-1 text-start">{active?.name ?? activeSlug}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground ms-auto shrink-0 opacity-70" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-44">
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

  if (variant === 'compact') {
    if (effectiveVersions.length === 1) {
      return (
        <div
          className={cn('flex h-7 items-center gap-1 px-1.5 font-medium text-muted-foreground text-xs shrink-0', className)}
          data-testid="version-indicator"
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="max-w-[4.5rem] truncate">{active?.name ?? activeSlug}</span>
        </div>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                'flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground shrink-0',
                className,
              )}
              aria-label={t('changeVersion')}
            >
              <GitBranch className="size-3.5 shrink-0" />
              <span className="max-w-[4.5rem] truncate">{active?.name ?? activeSlug}</span>
              <ChevronDown className="size-3 opacity-60 shrink-0" />
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

  const buttonClasses =
    variant === 'sidebar'
      ? cn(
          'flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/70 hover:text-foreground shrink-0',
          className,
        )
      : cn(
          'flex h-8 max-w-[8.5rem] cursor-pointer items-center gap-1.5 rounded-full border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground shrink-0',
          className,
        );

  if (effectiveVersions.length === 1) {
    return (
      <div
        className={cn(
          variant === 'sidebar'
            ? 'flex h-7 items-center gap-1.5 px-2 font-medium text-muted-foreground text-xs'
            : 'flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-2.5 font-medium text-muted-foreground text-xs',
          className,
        )}
        data-testid="version-indicator"
      >
        <GitBranch className="size-3.5 shrink-0" />
        <span className="max-w-[6rem] truncate">{active?.name ?? activeSlug}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className={buttonClasses} aria-label={t('changeVersion')}>
            <GitBranch className="size-3.5 shrink-0" />
            <span className="max-w-[6rem] truncate">{active?.name ?? activeSlug}</span>
            <ChevronDown className="size-3.5 opacity-60 shrink-0" />
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
