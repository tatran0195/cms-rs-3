import { Button } from '@cms/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { useT } from '@cms/i18n/react';
import type { Language } from '@cms/sdk';
import { Check, ChevronDown, FolderPlus, Globe, Plus, Settings2 } from 'lucide-react';
import { useMemo } from 'react';

export interface LocaleSelectorProps {
  languages: Language[];
  activeLanguageId: string | null;
  onSelect: (languageId: string) => void;
  onAddLanguage: () => void;
  onLanguageSettings: (language: Language) => void;
  onAddPage: (languageId: string) => void;
  onAddGroup: (languageId: string) => void;
  disabled?: boolean;
}

export function LocaleSelector({
  languages,
  activeLanguageId,
  onSelect,
  onAddLanguage,
  onLanguageSettings,
  onAddPage,
  onAddGroup,
  disabled = false,
}: LocaleSelectorProps) {
  const t = useT();
  const orderedLanguages = useMemo(
    () => [...languages].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.position - b.position),
    [languages],
  );

  const activeLang = orderedLanguages.find((l) => l.id === activeLanguageId) ?? orderedLanguages[0];

  if (!activeLang) return null;

  return (
    <div className="flex items-center justify-between gap-1.5 border-border border-b bg-muted/20 px-2.5 py-1.5" data-testid="locale-selector">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Select locale. Currently ${activeLang.label}`}
        >
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeLang.label}</span>
          <span className="text-[10px] text-muted-foreground uppercase">({activeLang.code})</span>
          {activeLang.isDefault && (
            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 font-medium text-[9px] text-accent-foreground">
              {t('editor.default') || 'Default'}
            </span>
          )}
          <ChevronDown className="ms-auto size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {orderedLanguages.map((lang) => {
            const isSelected = lang.id === activeLang.id;
            return (
              <DropdownMenuItem key={lang.id} onClick={() => onSelect(lang.id)} className="flex cursor-pointer items-center justify-between text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  {isSelected ? <Check className="size-3.5 text-primary" /> : <span className="size-3.5" />}
                  <span className="truncate font-medium">{lang.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">({lang.code})</span>
                </div>
                {lang.isDefault && (
                  <span className="shrink-0 rounded bg-accent px-1 text-[9px] text-accent-foreground">{t('editor.default') || 'Default'}</span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddLanguage} className="flex cursor-pointer items-center gap-2 text-xs">
            <Plus className="size-3.5 text-muted-foreground" />
            <span>{t('editor.addLanguage') || 'Add language'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onLanguageSettings(activeLang)} className="flex cursor-pointer items-center gap-2 text-xs">
            <Settings2 className="size-3.5 text-muted-foreground" />
            <span>{t('editor.langSettings.settings') || 'Language settings'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick actions for active language */}
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="icon-xs"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => onAddGroup(activeLang.id)}
          aria-label={t('editor.newGroup')}
          title={t('editor.newGroup')}
          disabled={disabled}
        >
          <FolderPlus className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => onAddPage(activeLang.id)}
          aria-label={t('editor.newPage')}
          title={t('editor.newPage')}
          disabled={disabled}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
