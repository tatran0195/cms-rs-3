import { Button } from '@cms/design-system/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@cms/design-system/components/ui/popover';
import { useT } from '@cms/i18n/react';
import { Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hasIcon, PageIcon } from '@/components/site/page-icon';

export const CURATED_ICONS: Array<{ name: string; label: string; category?: string }> = [
  // General & Highlights
  { name: 'sparkles', label: 'Sparkles', category: 'General' },
  { name: 'rocket', label: 'Rocket', category: 'General' },
  { name: 'star', label: 'Star', category: 'General' },
  { name: 'lightbulb', label: 'Idea', category: 'General' },
  { name: 'bookmark', label: 'Bookmark', category: 'General' },
  { name: 'tag', label: 'Tag', category: 'General' },
  { name: 'flag', label: 'Flag', category: 'General' },
  { name: 'compass', label: 'Compass', category: 'General' },

  // Docs & Code
  { name: 'book-open', label: 'Book', category: 'Docs' },
  { name: 'file-text', label: 'Document', category: 'Docs' },
  { name: 'code', label: 'Code', category: 'Docs' },
  { name: 'terminal', label: 'Terminal', category: 'Docs' },
  { name: 'layers', label: 'Layers', category: 'Docs' },
  { name: 'git-branch', label: 'Branch', category: 'Docs' },
  { name: 'link', label: 'Link', category: 'Docs' },

  // Tech & Infrastructure
  { name: 'cpu', label: 'CPU', category: 'System' },
  { name: 'database', label: 'Database', category: 'System' },
  { name: 'server', label: 'Server', category: 'System' },
  { name: 'cloud', label: 'Cloud', category: 'System' },
  { name: 'shield', label: 'Security', category: 'System' },
  { name: 'key', label: 'Key', category: 'System' },
  { name: 'lock', label: 'Lock', category: 'System' },
  { name: 'settings', label: 'Settings', category: 'System' },
  { name: 'wrench', label: 'Tools', category: 'System' },
  { name: 'zap', label: 'Zap', category: 'System' },

  // Community & Help
  { name: 'help-circle', label: 'Help', category: 'Support' },
  { name: 'message-square', label: 'Chat', category: 'Support' },
  { name: 'mail', label: 'Mail', category: 'Support' },
  { name: 'bell', label: 'Alert', category: 'Support' },
  { name: 'users', label: 'Users', category: 'Support' },
  { name: 'globe', label: 'Globe', category: 'Support' },
  { name: 'activity', label: 'Activity', category: 'Support' },
  { name: 'bar-chart', label: 'Analytics', category: 'Support' },
  { name: 'package', label: 'Package', category: 'Support' },
  { name: 'plug', label: 'Plugin', category: 'Support' },
  { name: 'puzzle', label: 'Integration', category: 'Support' },
  { name: 'check', label: 'Check', category: 'Support' },
];

export interface IconPickerProps {
  value?: string | null;
  onChange: (name: string | null) => void;
  fallbackIcon?: React.ReactNode;
  title?: string;
  triggerClassName?: string;
}

export function IconPicker({ value, onChange, fallbackIcon, title, triggerClassName }: IconPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURATED_ICONS;
    return CURATED_ICONS.filter(
      (icon) => icon.name.toLowerCase().includes(q) || icon.label.toLowerCase().includes(q) || icon.category?.toLowerCase().includes(q),
    );
  }, [search]);

  const activeValid = value && hasIcon(value);
  const pickerTitle = title ?? t('settings.search.chooseIcon');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`group/icon-btn relative grid size-7 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground transition-all hover:border-primary/40 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
              activeValid ? 'border-primary/30 bg-primary/10 text-primary' : ''
            } ${triggerClassName ?? ''}`}
            title={activeValid ? `Icon: ${value}` : pickerTitle}
          >
            {activeValid ? (
              <PageIcon name={value} className="size-3.5" />
            ) : fallbackIcon ? (
              fallbackIcon
            ) : (
              <Sparkles className="size-3.5 opacity-50 transition-opacity group-hover/icon-btn:opacity-100" />
            )}
          </button>
        }
      />
      <PopoverContent align="start" side="bottom" className="w-64 p-3 shadow-xl ring-1 ring-border/50">
        <div className="mb-2 flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 transition-colors focus-within:border-primary/50 focus-within:bg-background">
          <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settings.search.searchIcons')}
            className="h-full w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0"
            autoFocus
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="shrink-0 text-muted-foreground/50 hover:text-foreground">
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto p-0.5">
          {filteredIcons.map((item) => {
            const isSelected = value === item.name;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  onChange(item.name);
                  setOpen(false);
                  setSearch('');
                }}
                className={`grid size-8 place-items-center rounded-md transition-all hover:bg-primary/15 hover:text-primary ${
                  isSelected ? 'bg-primary/20 text-primary ring-1 ring-primary/40 font-semibold' : 'text-muted-foreground hover:scale-105'
                }`}
                title={item.label}
              >
                <PageIcon name={item.name} className="size-4" />
              </button>
            );
          })}
          {filteredIcons.length === 0 ? <div className="col-span-6 py-6 text-center text-xs text-muted-foreground/60">No matching icons</div> : null}
        </div>

        {activeValid ? (
          <div className="mt-2.5 border-t border-border/40 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setSearch('');
              }}
              className="h-7 w-full text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="me-1.5 size-3" />
              {t('settings.search.removeIcon')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
