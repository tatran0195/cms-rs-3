import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemeSwitchMode = 'light-dark' | 'light-dark-system' | 'button' | 'dropdown';

export interface ThemeSwitcherProps {
  mode?: ThemeSwitchMode;
  appearance: 'light' | 'dark' | 'system';
  onChange: (theme: 'light' | 'dark' | 'system') => void;
  enabled?: boolean;
  className?: string;
  variant?: 'pill' | 'sidebar';
}

export function ThemeSwitcher({ mode = 'light-dark', appearance, onChange, enabled = true, className, variant = 'pill' }: ThemeSwitcherProps) {
  if (!enabled) return null;

  // Segmented: 3 options (System, Light, Dark)
  if (mode === 'light-dark-system') {
    return (
      <div
        data-theme-switcher="segmented-system"
        className={cn(
          variant === 'sidebar'
            ? 'inline-flex items-center p-0.5 bg-transparent border-0 shadow-none'
            : 'inline-flex items-center rounded-full border border-border/70 p-0.5 bg-muted/40 shadow-2xs transition-all',
          className,
        )}
      >
        <button
          type="button"
          aria-label="System theme"
          title="System theme"
          aria-pressed={appearance === 'system'}
          onClick={() => onChange('system')}
          className={cn(
            'flex size-6 items-center justify-center text-muted-foreground transition-all cursor-pointer',
            variant === 'sidebar' ? 'rounded-md' : 'rounded-full',
            appearance === 'system' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
          )}
        >
          <Monitor className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Light theme"
          title="Light theme"
          aria-pressed={appearance === 'light'}
          onClick={() => onChange('light')}
          className={cn(
            'flex size-6 items-center justify-center text-muted-foreground transition-all cursor-pointer',
            variant === 'sidebar' ? 'rounded-md' : 'rounded-full',
            appearance === 'light' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
          )}
        >
          <Sun className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Dark theme"
          title="Dark theme"
          aria-pressed={appearance === 'dark'}
          onClick={() => onChange('dark')}
          className={cn(
            'flex size-6 items-center justify-center text-muted-foreground transition-all cursor-pointer',
            variant === 'sidebar' ? 'rounded-md' : 'rounded-full',
            appearance === 'dark' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
          )}
        >
          <Moon className="size-3.5" />
        </button>
      </div>
    );
  }

  // Segmented: 2 options (Light, Dark)
  if (mode === 'light-dark') {
    return (
      <div
        data-theme-switcher="segmented-light-dark"
        className={cn(
          variant === 'sidebar'
            ? 'inline-flex items-center p-0.5 bg-transparent border-0 shadow-none'
            : 'inline-flex items-center rounded-full border border-border/70 p-0.5 bg-muted/40 shadow-2xs transition-all',
          className,
        )}
      >
        <button
          type="button"
          aria-label="Light theme"
          title="Light theme"
          aria-pressed={appearance === 'light'}
          onClick={() => onChange('light')}
          className={cn(
            'flex size-6 items-center justify-center text-muted-foreground transition-all cursor-pointer',
            variant === 'sidebar' ? 'rounded-md' : 'rounded-full',
            appearance === 'light' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
          )}
        >
          <Sun className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Dark theme"
          title="Dark theme"
          aria-pressed={appearance === 'dark'}
          onClick={() => onChange('dark')}
          className={cn(
            'flex size-6 items-center justify-center text-muted-foreground transition-all cursor-pointer',
            variant === 'sidebar' ? 'rounded-md' : 'rounded-full',
            appearance === 'dark' ? 'bg-background text-foreground shadow-xs font-semibold' : 'hover:text-foreground',
          )}
        >
          <Moon className="size-3.5" />
        </button>
      </div>
    );
  }

  // Button toggle
  if (mode === 'button') {
    const isDark = appearance === 'dark';
    return (
      <button
        type="button"
        data-theme-switcher="toggle-button"
        onClick={() => onChange(isDark ? 'light' : 'dark')}
        className={cn(
          'grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          className,
        )}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
      </button>
    );
  }

  // Dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-theme-switcher="dropdown"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer',
              className,
            )}
            aria-label="Toggle theme"
          >
            {appearance === 'dark' ? (
              <Moon className="size-3.5" />
            ) : appearance === 'system' ? (
              <Monitor className="size-3.5" />
            ) : (
              <Sun className="size-3.5 text-amber-500" />
            )}
            <span className="capitalize">{appearance}</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => onChange('light')}>
          <Sun className="size-3.5 me-2" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange('dark')}>
          <Moon className="size-3.5 me-2" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange('system')}>
          <Monitor className="size-3.5 me-2" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
