import { Label } from '@cms/design-system/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { cn } from '@cms/design-system/lib/utils';
import { useTheme } from '@cms/design-system/theme';
import { INTERFACE_LOCALES } from '@cms/i18n';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { InterfaceLocaleLabel } from '@/shared';

export interface AppearanceData {
  defaultTheme: string;
  defaultLocale: string;
}

interface AppearanceStepProps {
  data: AppearanceData;
  onChange: (patch: Partial<AppearanceData>) => void;
}

const THEME_OPTIONS = [
  {
    id: 'system',
    label: 'System Default',
    description: 'Matches user operating system preference',
    icon: Laptop,
  },
  {
    id: 'light',
    label: 'Light Mode',
    description: 'Clean light background with crisp contrast',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark Mode',
    description: 'Sleek dark interface reducing eye strain',
    icon: Moon,
  },
];

const LOCALE_ITEMS = INTERFACE_LOCALES.map((option) => ({
  value: option.code,
  label: option.native,
}));

export function AppearanceStep({ data, onChange }: AppearanceStepProps) {
  const { setTheme } = useTheme();

  const handleSelectTheme = (themeId: string) => {
    onChange({ defaultTheme: themeId });
    if (themeId === 'light' || themeId === 'dark') {
      setTheme(themeId);
    }
  };

  const currentLocale = INTERFACE_LOCALES.find((l) => l.code === data.defaultLocale) ?? INTERFACE_LOCALES[0];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Default Platform Theme</Label>
        <p className="text-xs text-muted-foreground">Select the initial visual appearance for new visitors and team members.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = data.defaultTheme === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectTheme(opt.id)}
                className={cn(
                  'flex flex-col text-left p-4 rounded-xl border transition-all',
                  isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    <span className="font-semibold text-sm">{opt.label}</span>
                  </div>
                  {isSelected && <Check className="size-4 text-primary" />}
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="text-sm font-semibold">Default Interface Language</Label>
        <p className="text-xs text-muted-foreground">The fallback localization language used for user navigation and system prompts.</p>

        <Select
          items={LOCALE_ITEMS}
          value={data.defaultLocale}
          onValueChange={(val) => {
            if (val) onChange({ defaultLocale: val });
          }}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue dir={currentLocale.direction} lang={currentLocale.code} />
          </SelectTrigger>
          <SelectContent>
            {INTERFACE_LOCALES.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                <InterfaceLocaleLabel option={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
