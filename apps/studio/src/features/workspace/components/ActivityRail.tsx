import { Avatar, AvatarFallback, AvatarImage } from '@cms/design-system/components/ui/avatar';
import { Button } from '@cms/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@cms/design-system/components/ui/tooltip';
import { useTheme } from '@cms/design-system/theme';
import { cn } from '@cms/design-system/lib/utils';
import { INTERFACE_LOCALES } from '@cms/i18n';
import { useLocale } from '@cms/i18n/react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { BarChart3, Languages, LayoutDashboard, LogOut, Moon, Rocket, Search, Settings, Sun } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useSession, useSignOut } from '@/features/auth';
import { InterfaceLanguageDialog } from '@/shared';
import { NotificationsPopover } from './NotificationsPopover';

const subscribeToHydration = () => () => undefined;

export interface ActivityRailProps {
  projectId: string;
  onOpenSearch?: () => void;
  onOpenDeploy?: () => void;
}

export function ActivityRail({ projectId, onOpenSearch, onOpenDeploy }: ActivityRailProps) {
  const { locale, t } = useLocale();
  const rawPath = useRouterState({ select: (s) => s.location.pathname });
  const pathname = typeof rawPath === 'string' ? rawPath : '';
  const { data: session } = useSession();
  const signOutMutation = useSignOut();
  const { setTheme, resolvedTheme } = useTheme();
  const navigate = useNavigate();

  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const visibleSession = hydrated ? session : null;
  const activeLocale = INTERFACE_LOCALES.find((option) => option.code === locale) ?? INTERFACE_LOCALES[0];
  const [languageOpen, setLanguageOpen] = useState(false);

  const isHome = pathname === `/app/projects/${projectId}`;
  const isAnalytics = pathname.startsWith(`/app/projects/${projectId}/analytics`);
  const isSettings = pathname.startsWith(`/app/projects/${projectId}/settings`);

  const initials = (visibleSession?.user?.name ?? 'U')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <aside
        className="flex h-screen w-12 shrink-0 flex-col items-center justify-between border-border border-e bg-sidebar/95 py-3 select-none z-30"
        aria-label="Activity Rail"
      >
        {/* Top: Brand Logo & Navigation */}
        <div className="flex flex-col items-center gap-4">
          <Link
            to="/app"
            className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            title={t('nav.overview')}
          >
            <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
            </svg>
          </Link>

          {/* Navigation Items */}
          <nav className="flex flex-col items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Link
                  to="/app/projects/$projectId"
                  params={{ projectId }}
                  aria-label={t('project.overview')}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isHome && 'bg-muted text-foreground font-medium',
                  )}
                >
                  <LayoutDashboard className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('project.overview')}</TooltipContent>
            </Tooltip>

            {onOpenSearch ? (
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onOpenSearch}
                    aria-label={t('dashboard.search.placeholder')}
                    className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Search className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('dashboard.search.placeholder')}</TooltipContent>
              </Tooltip>
            ) : null}

            {onOpenDeploy ? (
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onOpenDeploy}
                    aria-label={t('project.deployments')}
                    className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Rocket className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('project.deployments')}</TooltipContent>
              </Tooltip>
            ) : null}

            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Link
                  to="/app/projects/$projectId/analytics"
                  params={{ projectId }}
                  aria-label={t('project.analytics')}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isAnalytics && 'bg-muted text-foreground font-medium',
                  )}
                >
                  <BarChart3 className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('project.analytics')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Link
                  to="/app/projects/$projectId/settings"
                  params={{ projectId }}
                  aria-label={t('project.settings')}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isSettings && 'bg-muted text-foreground font-medium',
                  )}
                >
                  <Settings className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('project.settings')}</TooltipContent>
            </Tooltip>
          </nav>
        </div>

        {/* Bottom: Notifications & Account Avatar */}
        <div className="flex flex-col items-center gap-2">
          <NotificationsPopover />

          <DropdownMenu>
            <DropdownMenuTrigger
              nativeButton={false}
              render={
                <button
                  type="button"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full outline-none ring-offset-background transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={t('nav.account')}
                >
                  <Avatar className="size-7 rounded-full">
                    {visibleSession?.user?.image ? (
                      <AvatarImage alt={visibleSession.user.name ?? undefined} src={visibleSession.user.image} />
                    ) : null}
                    <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 font-semibold text-primary-foreground text-[10px]">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56" side="right">
              <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
                <Avatar className="size-8 rounded-full">
                  {visibleSession?.user?.image ? (
                    <AvatarImage alt={visibleSession.user.name ?? undefined} src={visibleSession.user.image} />
                  ) : null}
                  <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-xs">{visibleSession?.user?.name ?? t('nav.account')}</span>
                  <span className="block truncate font-normal text-muted-foreground text-[11px]">{visibleSession?.user?.email ?? ''}</span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                {resolvedTheme === 'dark' ? t('account.lightMode') : t('account.darkMode')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguageOpen(true)}>
                <Languages className="size-4" />
                {t('account.language')}
                <span className="ms-auto text-muted-foreground text-xs" lang={activeLocale.code} dir={activeLocale.direction}>
                  {activeLocale.native}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOutMutation.mutateAsync();
                  navigate({ to: '/sign-in' });
                }}
                variant="destructive"
              >
                <LogOut className="size-4" /> {t('account.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <InterfaceLanguageDialog open={languageOpen} onOpenChange={setLanguageOpen} />
    </>
  );
}
