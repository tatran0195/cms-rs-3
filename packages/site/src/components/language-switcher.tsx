import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { siteT } from '@cms/i18n/site';
import { Check, ChevronDown, Languages } from 'lucide-react';

export interface SiteLanguage {
  code: string;
  label: string;
  direction: 'LTR' | 'RTL';
  isDefault: boolean;
}

/**
 * Header control for switching the active site language. Renders nothing for
 * single-language sites, and a dropdown (Mintlify-style) whenever there are two
 * or more languages.
 */
export function LanguageSwitcher({
  languages,
  activeCode,
  onChange,
  variant = 'pill',
  className,
}: {
  languages: SiteLanguage[];
  activeCode: string;
  onChange: (code: string) => void;
  variant?: 'pill' | 'sidebar' | 'icon';
  className?: string;
}) {
  if (languages.length < 2) {
    return null;
  }

  const active = languages.find((language) => language.code === activeCode) ?? languages[0];
  const t = siteT(active?.code);

  if (variant === 'icon') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                'grid size-7 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0',
                className,
              )}
              aria-label={t('changeLanguage')}
              title={t('changeLanguage')}
            >
              <Languages className="size-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          {languages.map((language) => (
            <DropdownMenuItem key={language.code} onClick={() => onChange(language.code)}>
              <span className="flex-1" dir={language.direction === 'RTL' ? 'rtl' : 'ltr'} lang={language.code}>
                {language.label}
              </span>
              {language.code === activeCode ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const buttonClasses =
    variant === 'sidebar'
      ? cn(
          'flex h-8.5 w-full cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground',
          className,
        )
      : cn(
          'flex h-8 max-w-[8.5rem] cursor-pointer items-center gap-1.5 rounded-full border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground shrink-0',
          className,
        );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className={buttonClasses} aria-label={t('changeLanguage')}>
            <Languages className="size-3.5 shrink-0" />
            <span className="truncate flex-1 text-start" dir={active?.direction === 'RTL' ? 'rtl' : 'ltr'} lang={active?.code}>
              {active?.label ?? activeCode}
            </span>
            <ChevronDown className="ms-auto size-3.5 shrink-0 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align={variant === 'sidebar' ? 'start' : 'end'} className="w-44">
        {languages.map((language) => (
          <DropdownMenuItem key={language.code} onClick={() => onChange(language.code)}>
            <span className="flex-1" dir={language.direction === 'RTL' ? 'rtl' : 'ltr'} lang={language.code}>
              {language.label}
            </span>
            {language.code === activeCode ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
