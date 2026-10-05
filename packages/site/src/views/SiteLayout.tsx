import { cn } from '@cms/design-system/lib/utils';
import { THEME_STORAGE_KEY } from '@cms/design-system/theme';
import { siteT } from '@cms/i18n/site';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { BookOpen, Moon, Search, Sun } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentationReaderLayout, DocumentationThemeProvider } from '../components/documentation-theme-provider';
import { LanguageSwitcher } from '../components/language-switcher';
import { MadeWithBadge } from '../components/made-with-badge';
import { MobileNav } from '../components/mobile-nav';
import { type SiteLanguageAlternate, SitePageAlternatesContext } from '../components/page-alternates-context';
import { SiteAnalyticsConsent } from '../components/site-analytics-consent';
import { SiteBanner } from '../components/site-banner';
import { firstLeafPath, SiteNav } from '../components/site-nav';
import { SiteSearch } from '../components/site-search';
import { VersionSwitcher } from '../components/version-switcher';
import { SiteAnalyticsProvider } from '../context/site-analytics-provider';
import { useSearchShortcutLabel } from '../lib/shortcut';
import { publishedSiteLogo } from '../lib/site-branding';
import { siteHref, siteLanguageParam } from '../lib/site-paths';
import { projectThemeCss, projectThemeStyle, resolveProjectTheme } from '../lib/site-theme';
import type { ProjectConfig, SiteShell } from '../types';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.34-1.73-1.34-1.73-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.22 1.84 1.22 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.16 0 0 1-.32 3.3 1.21a11.6 11.6 0 0 1 6 0c2.3-1.53 3.3-1.21 3.3-1.21.65 1.64.24 2.86.12 3.16.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.53-5.49 5.82.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .31.21.68.83.56A12.04 12.04 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.8 0 0 .78 0 1.74v20.51C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.75V1.74C24 .78 23.2 0 22.22 0Z" />
    </svg>
  );
}

export interface SiteLayoutProps {
  site: SiteShell | null;
  projectId: string;
  lang?: string;
  basePath?: string;
  children?: ReactNode;
}

export function SiteLayout({ site, projectId, lang, basePath, children }: SiteLayoutProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageAlternates, setPageAlternates] = useState<SiteLanguageAlternate[]>([]);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>();

  const observeHeader = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setMeasuredHeaderHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const searchShortcut = useSearchShortcutLabel();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Resolve current path relative to base
  const basePrefix = basePath ? basePath.replace(/\/+$/, '') : (projectId ? `/sites/${projectId}` : '');
  const currentPath = decodeURIComponent(basePrefix ? pathname.replace(new RegExp(`^${basePrefix}/?`), '') : pathname).replace(/\/+$/, '');
  const isChangelog = currentPath === 'changelog';
  const currentVersion = site?.versions.find((item) => item.slug === site.activeVersion) ?? site?.versions.find((item) => item.isDefault);
  const activeVersionPrefix = currentVersion && !currentVersion.isDefault ? currentVersion.slug : undefined;
  const contentPath =
    activeVersionPrefix && (currentPath === activeVersionPrefix || currentPath.startsWith(`${activeVersionPrefix}/`))
      ? currentPath.slice(activeVersionPrefix.length).replace(/^\/+/, '')
      : currentPath;
  const effectiveCurrentPath = contentPath || firstLeafPath(site?.nav ?? []) || '';

  const config: ProjectConfig | null = site?.project.config ?? null;
  const languages = site?.languages ?? [];
  const versions = site?.versions ?? [];

  const activeLanguage = useMemo(() => {
    const code = lang ?? site?.activeLanguage;
    return languages.find((language) => language.code === code) ?? languages.find((language) => language.isDefault) ?? languages[0];
  }, [languages, lang, site?.activeLanguage]);

  const isRtl = activeLanguage?.direction === 'RTL';
  const defaultLanguage = languages.find((language) => language.isDefault)?.code;
  const navigationLanguage = siteLanguageParam(activeLanguage?.code, defaultLanguage);
  const t = siteT(activeLanguage?.code);

  const configTheme = config?.styling?.theme;
  const [siteTheme, setSiteTheme] = useState<'light' | 'dark'>(configTheme === 'dark' ? 'dark' : 'light');
  const [siteThemeHydratedFor, setSiteThemeHydratedFor] = useState<string>();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `cms.site.theme.${projectId}`;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'dark' || stored === 'light') {
      setSiteTheme(stored);
      setSiteThemeHydratedFor(projectId);
      return;
    }
    if (configTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setSiteTheme(mq.matches ? 'dark' : 'light');
      setSiteThemeHydratedFor(projectId);
      const onChange = (e: MediaQueryListEvent) => {
        if (window.localStorage.getItem(storageKey)) return;
        setSiteTheme(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    setSiteTheme(configTheme === 'dark' ? 'dark' : 'light');
    setSiteThemeHydratedFor(projectId);
  }, [projectId, configTheme]);

  const toggleSiteTheme = () => {
    const next = siteTheme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(`cms.site.theme.${projectId}`, next);
    } catch {
      // ignore
    }
    setSiteTheme(next);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const dashboardTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const dashboardUsesSystem = dashboardTheme !== 'light' && dashboardTheme !== 'dark';
    const dashboardWasDark = dashboardTheme === 'dark' || (dashboardUsesSystem && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const dashboardResolvedTheme = dashboardWasDark ? 'dark' : 'light';
    return () => {
      root.classList.remove('light', 'dark');
      root.classList.add(dashboardResolvedTheme);
      root.style.colorScheme = dashboardResolvedTheme;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || siteThemeHydratedFor !== projectId) return;
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(siteTheme);
    document.documentElement.style.colorScheme = siteTheme;
  }, [projectId, siteTheme, siteThemeHydratedFor]);

  const faviconUrl = config?.branding?.favicon || '/favicon.svg';
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  const pageAlternatesContext = useMemo(() => ({ alternates: pageAlternates, setAlternates: setPageAlternates }), [pageAlternates]);

  if (!site) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div>
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 font-semibold text-2xl tracking-tight">{t('notPublishedTitle')}</h1>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">{t('notPublishedBody')}</p>
        </div>
      </div>
    );
  }

  const resolvedTheme = resolveProjectTheme(config);
  const showSearch = config?.navbar?.showSearch !== false;
  const searchHotkey = config?.search?.hotkey;
  const navLinks = config?.navbar?.links ?? [];
  const navTabs = config?.navbar?.tabs ?? [];
  const navAnchors = config?.navbar?.anchors ?? [];
  const ctaLabel = config?.navbar?.ctaLabel;
  const ctaUrl = config?.navbar?.ctaUrl;
  const footer = config?.footer;
  const showBadge = footer?.madeWithBadge !== false;
  const hasFooterContent = Boolean(footer && (footer.copyright || footer.github || footer.x || footer.linkedin));

  const branding = config?.branding;
  const configuredLogo = (siteTheme === 'dark' ? branding?.logoDark || branding?.logoLight : branding?.logoLight) || null;
  const logo = publishedSiteLogo(configuredLogo, siteTheme);
  const logoHref = branding?.logoHref?.trim() || undefined;

  const headerHeight = measuredHeaderHeight === undefined ? (navTabs.length > 0 ? '6.75rem' : '4rem') : `${measuredHeaderHeight}px`;
  const chromeStyle = {
    ...projectThemeStyle(config),
    '--site-header-h': headerHeight,
    '--content-scroll-mt': `calc(${headerHeight} + 1.5rem)`,
  } as Record<string, string | number>;
  const themeCss = projectThemeCss(config);
  const siteName = site?.languageConfig?.name || site?.project.name;

  const brandInner = (
    <>
      {logo ? (
        <>
          <img src={logo.src} alt={siteName ?? 'Logo'} className={cn('object-contain', logo.markOnly ? 'size-7 shrink-0' : 'h-6 w-auto')} />
          {logo.markOnly ? null : <span className="truncate">{siteName ?? 'Documentation'}</span>}
        </>
      ) : (
        <>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-sm">
            {siteName?.[0] ?? 'D'}
          </span>
          <span className="truncate">{siteName ?? 'Documentation'}</span>
        </>
      )}
    </>
  );

  const changeLanguage = (code: string) => {
    const targetLanguage = siteLanguageParam(code, defaultLanguage);
    const alternate = pageAlternates.find((item) => item.code === code && item.path);
    if (!isChangelog && alternate?.path) {
      window.location.assign(
        siteHref(projectId, alternate.path, {
          lang: targetLanguage,
          version: activeVersionPrefix,
          basePath: basePrefix,
        }),
      );
      return;
    }
    navigate({ search: ((prev: Record<string, unknown>) => ({ ...prev, lang: targetLanguage })) as never });
  };

  const changeVersion = (slug: string) => {
    const defaultVersion = versions.find((item) => item.isDefault);
    const targetPrefix = defaultVersion?.slug === slug ? '' : slug;
    const targetPath = [targetPrefix, isChangelog ? '' : contentPath].filter(Boolean).join('/');
    window.location.assign(siteHref(projectId, targetPath, { lang: navigationLanguage, basePath: basePrefix }));
  };

  const activeVersion = site?.activeVersion ?? versions.find((item) => item.isDefault)?.slug ?? '';
  const sitePath = (path = '') =>
    siteHref(projectId, path, {
      lang: navigationLanguage,
      version: activeVersionPrefix,
      basePath: basePrefix,
    });

  const resolveNavHref = (href: string): string =>
    href.startsWith('/') && !href.startsWith('//')
      ? siteHref(projectId, href, {
          lang: navigationLanguage,
          version: activeVersionPrefix,
          basePath: basePrefix,
        })
      : href;

  const isNavActive = (href: string): boolean => {
    if (!href.startsWith('/') || href.startsWith('//')) return false;
    const prefix = href.replace(/^\/+|\/+$/g, '');
    return prefix !== '' && (effectiveCurrentPath === prefix || effectiveCurrentPath.startsWith(`${prefix}/`));
  };

  const headerLinks = [
    ...(config?.navbar?.changelog === true
      ? [
          {
            label: t('changelog'),
            href: siteHref(projectId, 'changelog', {
              lang: navigationLanguage,
              basePath: basePrefix,
            }),
            active: isChangelog,
            external: false,
          },
        ]
      : []),
    ...navLinks.map((link: { label: string; href: string; external?: boolean }) => ({
      label: link.label,
      href: resolveNavHref(link.href),
      active: !link.external && isNavActive(link.href),
      external: Boolean(link.external),
    })),
  ];

  return (
    <SiteAnalyticsProvider projectId={projectId} path={effectiveCurrentPath} language={activeLanguage?.code} config={config}>
      <DocumentationThemeProvider
        appearance={siteTheme}
        className="flex min-h-screen flex-col bg-background [&_code]:[direction:ltr] [&_pre]:[direction:ltr]"
        context="reader"
        css={themeCss}
        direction={isRtl ? 'rtl' : 'ltr'}
        style={chromeStyle}
        theme={resolvedTheme}
      >
        <DocumentationReaderLayout
          banner={<SiteBanner projectId={projectId} banner={config?.banner} lang={activeLanguage?.code} />}
          header={
            <div
              ref={observeHeader}
              className="sticky top-0 z-30 border-border/70 border-b bg-background/80 backdrop-blur-md"
              data-theme-region="header-shell"
            >
              <header
                className="mx-auto flex min-h-16 max-w-[90rem] flex-wrap items-center gap-2 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0"
                data-theme-region="header"
              >
                <MobileNav
                  nodes={site?.nav ?? []}
                  projectId={projectId}
                  currentPath={effectiveCurrentPath}
                  lang={navigationLanguage}
                  version={activeVersionPrefix}
                  label={t('docs')}
                  isRtl={isRtl}
                  links={headerLinks}
                />

                <div className="flex min-w-0 shrink-0 items-center gap-2.5">
                  {logoHref ? (
                    <a
                      href={logoHref}
                      className="flex items-center gap-2.5 font-semibold text-foreground text-sm tracking-tight hover:opacity-85"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {brandInner}
                    </a>
                  ) : (
                    <a href={sitePath()} className="flex items-center gap-2.5 font-semibold text-foreground text-sm tracking-tight hover:opacity-85">
                      {brandInner}
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <VersionSwitcher versions={versions} activeSlug={activeVersion} onChange={changeVersion} lang={activeLanguage?.code} />
                  <LanguageSwitcher languages={languages} activeCode={activeLanguage?.code ?? ''} onChange={changeLanguage} />
                </div>

                <nav className="ms-1 hidden items-center gap-1 md:flex" aria-label={t('docs')}>
                  {headerLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 font-medium text-xs transition-colors',
                        link.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                    >
                      {link.label}
                    </a>
                  ))}
                </nav>

                <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
                  {showSearch && (
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-muted-foreground text-xs transition-colors hover:border-foreground/20 hover:bg-muted/70 hover:text-foreground"
                    >
                      <Search className="size-3.5" />
                      <span className="hidden sm:inline">{t('searchPlaceholder')}</span>
                      <kbd className="pointer-events-none hidden rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-xs sm:inline">
                        {searchHotkey || searchShortcut}
                      </kbd>
                    </button>
                  )}

                  {ctaLabel && ctaUrl && (
                    <a
                      href={ctaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground text-xs hover:bg-primary/90"
                    >
                      {ctaLabel}
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={toggleSiteTheme}
                    className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    aria-label={t('toggleTheme')}
                  >
                    {siteTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </button>
                </div>
              </header>
            </div>
          }
          navigation={
            <aside className="hidden w-64 shrink-0 border-border/70 border-e py-6 pe-4 lg:block">
              <SiteNav
                nodes={site?.nav ?? []}
                projectId={projectId}
                currentPath={effectiveCurrentPath}
                lang={navigationLanguage}
                version={activeVersionPrefix}
              />
            </aside>
          }
          content={
            <SitePageAlternatesContext value={pageAlternatesContext}>
              {children ?? <Outlet />}
            </SitePageAlternatesContext>
          }
          footer={
            hasFooterContent || showBadge ? (
              <footer className="mt-auto border-border/70 border-t py-6 text-center text-muted-foreground text-xs">
                <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
                  <div>{footer?.copyright || `© ${new Date().getFullYear()} ${siteName ?? 'Documentation'}`}</div>
                  <div className="flex items-center gap-3">
                    {footer?.github && (
                      <a href={footer.github} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                        <GithubIcon className="size-4" />
                      </a>
                    )}
                    {footer?.x && (
                      <a href={footer.x} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                        <XIcon className="size-4" />
                      </a>
                    )}
                    {footer?.linkedin && (
                      <a href={footer.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                        <LinkedinIcon className="size-4" />
                      </a>
                    )}
                    {showBadge && <MadeWithBadge />}
                  </div>
                </div>
              </footer>
            ) : null
          }
          overlays={
            <>
              {showSearch && (
                <SiteSearch
                  open={searchOpen}
                  onOpenChange={setSearchOpen}
                  projectId={projectId}
                  lang={navigationLanguage}
                  version={activeVersionPrefix}
                  hotkey={searchHotkey}
                />
              )}
              <SiteAnalyticsConsent projectId={projectId} config={config} />
            </>
          }
        />
      </DocumentationThemeProvider>
    </SiteAnalyticsProvider>
  );
}
