import { cn } from '@cms/design-system/lib/utils';
import { THEME_STORAGE_KEY } from '@cms/design-system/theme';
import { siteT } from '@cms/i18n/site';
import { resolveDocsLayout } from '@cms/shared/themes';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { BookOpen, ChevronDown, ExternalLink, Link2, Search } from 'lucide-react';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentationReaderLayout, DocumentationThemeProvider } from '../components/documentation-theme-provider';
import { LanguageSwitcher } from '../components/language-switcher';
import { MadeWithBadge } from '../components/made-with-badge';
import { MobileNav, type MobileNavLink } from '../components/mobile-nav';
import { type SiteLanguageAlternate, SitePageAlternatesContext } from '../components/page-alternates-context';
import { hasIcon, PageIcon } from '../components/page-icon';
import { SiteBanner } from '../components/site-banner';
import { firstLeafPath, SiteNav } from '../components/site-nav';
import { SiteNavTabs } from '../components/site-nav-tabs';
import { SiteSearch } from '../components/site-search';
import { ThemeSwitcher } from '../components/theme-switcher';
import { VersionSwitcher } from '../components/version-switcher';
import { SidebarProvider } from '../context/sidebar-context';
import { SiteAnalyticsProvider } from '../context/site-analytics-provider';
import { useIsScrollTop } from '../hooks/use-is-scroll-top';
import { FluxTabDropdown, getLayoutHeaderHeight } from '../layouts';
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
  onNavigate?: (href: string) => void;
  onLanguageChange?: (languageCode: string) => void;
  onVersionChange?: (versionSlug: string) => void;
}

export function SiteLayout({ site, projectId, lang, basePath, children, onNavigate, onLanguageChange, onVersionChange }: SiteLayoutProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageAlternates, setPageAlternates] = useState<SiteLanguageAlternate[]>([]);

  const searchShortcut = useSearchShortcutLabel();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Resolve current path relative to base
  const basePrefix = basePath !== undefined ? basePath.replace(/\/+$/, '') : projectId && projectId !== 'standalone' ? `/sites/${projectId}` : '';
  const rawPath = decodeURIComponent(basePrefix ? pathname.replace(new RegExp(`^${basePrefix}/?`), '') : pathname).replace(/\/+$/, '');
  const currentPath = rawPath.replace(/^sites\/[^/]+\/?/, '').replace(/^\/+/, '');
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const dashboardTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const dashboardUsesSystem = dashboardTheme !== 'light' && dashboardTheme !== 'dark';
    const dashboardWasDark = dashboardTheme === 'dark' || (dashboardUsesSystem && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const dashboardResolvedTheme = dashboardWasDark ? 'dark' : 'light';
    return () => {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sites')) {
        root.classList.remove('light', 'dark');
        root.classList.add(dashboardResolvedTheme);
        root.style.colorScheme = dashboardResolvedTheme;
      }
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

  const resolvedTheme = resolveProjectTheme(config);
  const headerTransparentMode = resolvedTheme.layout.headerTransparentMode ?? 'none';
  const isTop = useIsScrollTop({ enabled: Boolean(site) && headerTransparentMode === 'top' }) ?? true;
  const isHeaderTransparent = headerTransparentMode === 'top' ? isTop : headerTransparentMode === 'always';

  const pageAlternatesContext = useMemo(() => ({ alternates: pageAlternates, setAlternates: setPageAlternates }), [pageAlternates]);

  const navigateToHref = useCallback(
    (href: string) => {
      const [path, query] = href.split('?');
      const search = query ? Object.fromEntries(new URLSearchParams(query)) : {};
      navigate({ to: path, search } as never);
    },
    [navigate],
  );

  const handleInternalLinkClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      if (target.target && target.target !== '_self') return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (onNavigate) {
        e.preventDefault();
        onNavigate(href);
        return;
      }
      if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href)) {
        try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin) return;
          if (basePrefix && url.pathname.startsWith(basePrefix)) {
            e.preventDefault();
            navigateToHref(`${url.pathname}${url.search}${url.hash}`);
          }
        } catch {
          // ignore malformed URLs and fall back to native browser navigation
        }
      } else if (href.startsWith('/') && basePrefix && href.startsWith(basePrefix)) {
        e.preventDefault();
        navigateToHref(href);
      }
    },
    [basePrefix, navigateToHref, onNavigate],
  );

  const handleThemeChange = useCallback(
    (next: 'light' | 'dark' | 'system') => {
      if (next === 'system') {
        const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setSiteTheme(prefersDark ? 'dark' : 'light');
        try {
          window.localStorage.removeItem(`cms.site.theme.${projectId}`);
        } catch {
          // ignore
        }
      } else {
        setSiteTheme(next);
        try {
          window.localStorage.setItem(`cms.site.theme.${projectId}`, next);
        } catch {
          // ignore
        }
      }
    },
    [projectId],
  );

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

  const docsLayout = resolveDocsLayout(resolvedTheme.layout);
  const headerHeight = getLayoutHeaderHeight(docsLayout);
  const chromeStyle = {
    ...projectThemeStyle(config),
    '--site-header-h': headerHeight,
    '--content-scroll-mt': headerHeight === '0px' ? '2rem' : `calc(${headerHeight} + 2rem)`,
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
    if (onLanguageChange) {
      onLanguageChange(code);
      return;
    }
    const targetLanguage = siteLanguageParam(code, defaultLanguage);
    const alternate = pageAlternates.find((item) => item.code === code && item.path);
    if (!isChangelog && alternate?.path) {
      navigateToHref(
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
    if (onVersionChange) {
      onVersionChange(slug);
      return;
    }
    const defaultVersion = versions.find((item) => item.isDefault);
    const targetPrefix = defaultVersion?.slug === slug ? '' : slug;
    const targetPath = [targetPrefix, isChangelog ? '' : contentPath].filter(Boolean).join('/');
    navigateToHref(siteHref(projectId, targetPath, { lang: navigationLanguage, basePath: basePrefix }));
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

  const headerLinks: MobileNavLink[] = [
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
            items: undefined,
          },
        ]
      : []),
    ...navLinks.map(
      (link: {
        label: string;
        href?: string;
        external?: boolean;
        items?: Array<{ label: string; href: string; external?: boolean; icon?: string; description?: string }>;
      }) => ({
        label: link.label,
        href: link.href ? resolveNavHref(link.href) : undefined,
        active: Boolean(link.href && !link.external && isNavActive(link.href)),
        external: Boolean(link.external),
        items: (link.items ?? []).map((child) => ({
          label: child.label,
          href: resolveNavHref(child.href),
          external: Boolean(child.external),
          icon: child.icon,
          description: child.description,
          active: !child.external && isNavActive(child.href),
        })),
      }),
    ),
  ];

  const brandNode = (
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
  );

  const searchFullNode = showSearch ? (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="hidden h-9 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-full border border-border/80 bg-muted/50 px-4 text-muted-foreground text-sm transition-colors hover:border-foreground/25 hover:bg-muted sm:flex"
    >
      <Search className="size-3.5 shrink-0" />
      <span className="truncate">{config?.search?.placeholder ?? t('search')}</span>
      <kbd
        className="ms-auto hidden shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] md:inline-flex"
        dir="ltr"
      >
        {searchHotkey === 'slash' ? '/' : searchShortcut}
      </kbd>
    </button>
  ) : null;

  const searchButtonNode = showSearch ? (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={t('search')}
    >
      <Search className="size-4" />
    </button>
  ) : null;

  const toolsNode = (
    <div className="ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
      <LanguageSwitcher languages={languages} activeCode={activeLanguage?.code ?? ''} onChange={changeLanguage} variant="pill" />
      <VersionSwitcher versions={versions} activeSlug={activeVersion} onChange={changeVersion} lang={activeLanguage?.code} variant="pill" />
      <ThemeSwitcher
        mode={resolvedTheme.layout.themeSwitchMode ?? 'light-dark'}
        enabled={resolvedTheme.layout.themeSwitchEnabled !== false}
        appearance={siteTheme}
        onChange={handleThemeChange}
      />
      {ctaLabel && ctaUrl && (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ms-1 hidden h-9 cursor-pointer items-center rounded-full bg-primary px-4 font-medium text-primary-foreground text-sm shadow-sm transition-opacity hover:opacity-90 sm:inline-flex"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );

  const sidebarToolsNode = (
    <div className="flex flex-col gap-2 w-full">
      {languages.length >= 2 && (
        <LanguageSwitcher languages={languages} activeCode={activeLanguage?.code ?? ''} onChange={changeLanguage} variant="sidebar" />
      )}
      <div className="flex items-center justify-between border border-border/60 bg-muted/40 p-0.5 rounded-lg text-muted-foreground text-sm">
        {versions && versions.length > 0 && (
          <VersionSwitcher versions={versions} activeSlug={activeVersion} onChange={changeVersion} lang={activeLanguage?.code} variant="sidebar" />
        )}
        <ThemeSwitcher
          mode={resolvedTheme.layout.themeSwitchMode ?? 'light-dark'}
          enabled={resolvedTheme.layout.themeSwitchEnabled !== false}
          appearance={siteTheme}
          variant="sidebar"
          className="ms-auto"
          onChange={handleThemeChange}
        />
      </div>
    </div>
  );

  const languageButtonNode =
    languages.length >= 2 ? (
      <LanguageSwitcher languages={languages} activeCode={activeLanguage?.code ?? ''} onChange={changeLanguage} variant="icon" />
    ) : null;

  const themeSwitchNode = (
    <ThemeSwitcher
      mode={resolvedTheme.layout.themeSwitchMode ?? 'light-dark'}
      enabled={resolvedTheme.layout.themeSwitchEnabled !== false}
      appearance={siteTheme}
      onChange={handleThemeChange}
    />
  );

  const fluxToolsNode = (
    <div className="flex flex-row items-center text-muted-foreground gap-1 ms-auto shrink-0">
      {languageButtonNode}
      {themeSwitchNode}
    </div>
  );

  const navLinksNode =
    headerLinks.length > 0 ? (
      <nav className="hidden shrink-0 items-center gap-5 text-sm lg:flex" aria-label={t('docs')}>
        {headerLinks.map((link) =>
          link.items && link.items.length > 0 ? (
            <NavLinkDropdown key={`${link.label}-${link.href ?? 'group'}`} link={link as NavLinkDropdownProps['link']} />
          ) : (
            <a
              key={`${link.label}-${link.href}`}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              aria-current={link.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1 transition-colors',
                link.active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.label}
              {link.external && <ExternalLink className="size-3" />}
            </a>
          ),
        )}
      </nav>
    ) : null;

  const navTabsNode =
    navTabs.length > 0 ? (
      <SiteNavTabs
        tabs={navTabs}
        currentPath={effectiveCurrentPath}
        projectId={projectId}
        lang={navigationLanguage}
        version={activeVersionPrefix}
        basePath={basePrefix}
      />
    ) : null;

  const fluxTabNode =
    navTabs.length > 0 ? (
      <FluxTabDropdown navTabs={navTabsNode} />
    ) : versions && versions.length > 0 ? (
      <VersionSwitcher versions={versions} activeSlug={activeVersion} onChange={changeVersion} lang={activeLanguage?.code} variant="tab" />
    ) : null;

  const navAnchorsNode =
    navAnchors.length > 0 ? (
      <ul className="mb-4 space-y-1 border-border/60 border-b pb-5">
        {navAnchors.map((anchor) => (
          <li key={`${anchor.label}-${anchor.href}`}>
            <a
              href={resolveNavHref(anchor.href)}
              target={anchor.external ? '_blank' : undefined}
              rel={anchor.external ? 'noopener noreferrer' : undefined}
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-card shadow-2xs transition-colors group-hover:border-primary/40 group-hover:text-primary">
                {hasIcon(anchor.icon) ? <PageIcon name={anchor.icon} className="size-3.5" /> : <Link2 className="size-3.5" />}
              </span>
              <span className="truncate">{anchor.label}</span>
            </a>
          </li>
        ))}
      </ul>
    ) : null;

  const sidebarTreeNode = (
    <SiteNav
      nodes={site?.nav ?? []}
      projectId={projectId}
      currentPath={effectiveCurrentPath}
      lang={navigationLanguage}
      version={activeVersionPrefix}
      basePath={basePrefix}
    />
  );

  const mobileNavNode = (
    <MobileNav
      nodes={site?.nav ?? []}
      projectId={projectId}
      currentPath={effectiveCurrentPath}
      lang={navigationLanguage}
      version={activeVersionPrefix}
      label={t('docs')}
      isRtl={isRtl}
      links={headerLinks}
      tabs={navTabs}
      basePath={basePrefix}
    />
  );

  const headerNode = (
    <div
      className={cn(
        'sticky top-0 z-30 transition-colors duration-200',
        isHeaderTransparent ? 'bg-transparent border-b border-transparent' : 'border-border/70 border-b bg-background/80 backdrop-blur-md',
      )}
      data-theme-region="header-shell"
      data-header-transparent={isHeaderTransparent ? 'true' : 'false'}
    >
      <header
        className="mx-auto flex min-h-16 w-full max-w-[var(--theme-content-max,100%)] flex-wrap items-center gap-2 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0"
        data-theme-region="header"
      >
        {mobileNavNode}
        {brandNode}

        {/* Centered search (Mintlify-style); collapses to an icon on phones. */}
        <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">{searchFullNode}</div>

        <div className="sm:hidden">{searchButtonNode}</div>

        {navLinksNode}
        {toolsNode}
      </header>
      {navTabsNode && (
        <div className="border-border/60 border-t py-1">
          <div className="mx-auto flex w-full max-w-[var(--theme-content-max,100%)] items-center px-4 sm:px-6">{navTabsNode}</div>
        </div>
      )}
    </div>
  );

  return (
    <SiteAnalyticsProvider projectId={projectId} path={effectiveCurrentPath} language={activeLanguage?.code} config={config}>
      <SidebarProvider collapsible={resolvedTheme.layout.sidebarCollapsible !== false}>
        <DocumentationThemeProvider
          appearance={siteTheme}
          className="flex min-h-screen flex-col bg-background scroll-smooth [&_code]:[direction:ltr] [&_pre]:[direction:ltr]"
          context="reader"
          css={themeCss}
          direction={isRtl ? 'rtl' : 'ltr'}
          style={chromeStyle}
          theme={resolvedTheme}
        >
          <div onClickCapture={handleInternalLinkClick} className="flex min-h-screen flex-1 flex-col">
            <DocumentationReaderLayout
              banner={<SiteBanner projectId={projectId} banner={config?.banner} lang={activeLanguage?.code} />}
              header={headerNode}
              navigation={
                <>
                  {navAnchorsNode}
                  {sidebarTreeNode}
                </>
              }
              content={<SitePageAlternatesContext value={pageAlternatesContext}>{children ?? <Outlet />}</SitePageAlternatesContext>}
              brand={brandNode}
              searchFull={searchFullNode}
              searchButton={searchButtonNode}
              tools={toolsNode}
              sidebarTools={sidebarToolsNode}
              fluxTools={fluxToolsNode}
              fluxTab={fluxTabNode}
              themeSwitch={themeSwitchNode}
              languageButton={languageButtonNode}
              navLinks={navLinksNode}
              navTabs={navTabsNode}
              navAnchors={navAnchorsNode}
              sidebarTree={sidebarTreeNode}
              mobileNav={mobileNavNode}
              footer={
                hasFooterContent || showBadge ? (
                  <footer className="mt-auto border-border/70 border-t py-6 text-center text-muted-foreground text-xs">
                    <div className="mx-auto flex w-full max-w-[var(--theme-content-max,100%)] flex-wrap items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
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
                showSearch && (
                  <SiteSearch
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                    projectId={projectId}
                    lang={navigationLanguage}
                    version={activeVersionPrefix}
                    basePath={basePrefix}
                    hotkey={searchHotkey}
                    direction={isRtl ? 'rtl' : 'ltr'}
                  />
                )
              }
            />
          </div>
        </DocumentationThemeProvider>
      </SidebarProvider>
    </SiteAnalyticsProvider>
  );
}

// ─── NavLinkDropdown ─────────────────────────────────────────────────────────
// Hover + click popover for navbar links with children.
// Mirrors the fumadocs notebook NavbarLinkItemMenu pattern.

interface NavLinkDropdownItem {
  label: string;
  href: string;
  external: boolean;
  icon?: string;
  description?: string;
  active: boolean;
}

interface NavLinkDropdownProps {
  link: {
    label: string;
    href?: string;
    external: boolean;
    active: boolean;
    items: NavLinkDropdownItem[];
  };
}

function NavLinkDropdown({ link }: NavLinkDropdownProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<number>(null);
  const freezeUntil = useRef<number>(null);

  const delaySetOpen = (value: boolean, delay = 50) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    timeoutRef.current = window.setTimeout(() => {
      setOpen(value);
      freezeUntil.current = Date.now() + 300;
    }, delay);
  };

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    delaySetOpen(true);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    delaySetOpen(false);
  };

  const hasActiveChild = link.items.some((item) => item.active);

  return (
    <div className="relative" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {/* Trigger */}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (freezeUntil.current === null || Date.now() >= freezeUntil.current) {
            setOpen((prev) => !prev);
          }
        }}
        className={cn(
          'inline-flex items-center gap-1 transition-colors focus-visible:outline-none',
          hasActiveChild || link.active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {link.href ? (
          <a
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            aria-current={link.active ? 'page' : undefined}
            className="hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {link.label}
          </a>
        ) : (
          link.label
        )}
        <ChevronDown className={cn('size-3 transition-transform duration-200 text-muted-foreground', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute start-0 top-full mt-2 z-50 min-w-[200px] max-w-[340px] rounded-xl border border-border bg-popover p-1.5 shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
          )}
        >
          {link.items.map((item) => (
            <a
              key={`${item.label}-${item.href}`}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              aria-current={item.active ? 'page' : undefined}
              role="option"
              aria-selected={item.active}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                item.active ? 'bg-primary/8 text-primary' : 'text-muted-foreground',
              )}
            >
              {item.icon && (
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card shadow-2xs">
                  <PageIcon name={item.icon} className="size-3.5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground leading-tight">{item.label}</span>
                {item.description && <span className="block mt-0.5 text-xs text-muted-foreground leading-snug">{item.description}</span>}
              </span>
              {item.external && <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-50" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
