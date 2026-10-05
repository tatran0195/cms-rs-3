// Types
export * from './types';

// Views
export { SiteLayout, type SiteLayoutProps } from './views/SiteLayout';
export { SiteChangelogView } from './views/SiteChangelogView';
export { SitePageView } from './components/site-page-view';
export { OpenApiReferenceView } from './components/openapi-reference-view';

// Components
export {
  DocumentationThemeProvider,
  DocumentationReaderLayout,
  DocumentationPageLayout,
  DocumentationProjectPreviewLayout,
  DocumentationStudioPreviewLayout,
  DOCUMENTATION_THEME_TEMPLATES,
  type DocumentationThemeContextName,
  type DocumentationThemeTemplate,
} from './components/documentation-theme-provider';
export { LanguageSwitcher } from './components/language-switcher';
export { VersionSwitcher } from './components/version-switcher';
export { SiteNav, firstLeafPath, isVersionIndependentNavNode } from './components/site-nav';
export { MobileNav } from './components/mobile-nav';
export { SiteSearch } from './components/site-search';
export { SiteBanner } from './components/site-banner';

export { MadeWithBadge } from './components/made-with-badge';
export { PageIcon, hasIcon } from './components/page-icon';
export { TableOfContents } from './components/toc';
export {
  Markdown,
  MarkdownRenderer,
  needsRichMarkdown,
  type MarkdownProps,
  type SiteLinkContext,
} from './components/markdown';
export { SitePageAlternatesContext, useSitePageAlternates, type SiteLanguageAlternate } from './components/page-alternates-context';

// Lib
export { siteHref, siteLanguageParam, type SiteHrefOptions } from './lib/site-paths';
export { siteHead, pageHead, changelogFeedUrl, sitePageUrl } from './lib/site-seo';
export { resolveProjectTheme, projectThemeCss, projectThemeStyle, projectThemeVariables, siteThemeNoFlashScript } from './lib/site-theme';
export { publishedSiteLogo } from './lib/site-branding';
export { resolveLanguagePathRedirect, type LanguagePathRedirectInput } from './lib/site-language-path';
export { redirectIfConfigured } from './lib/site-redirects';
export { buildSiteRedirectHref } from './lib/site-redirect-href';
export { scalarOpenApiConfiguration } from './lib/openapi-reference';

// Context
export { SiteApiProvider, useSiteApi, type SiteApiConfig } from './context/site-api-context';
export { SiteAnalyticsProvider, useSiteAnalytics } from './context/site-analytics-provider';
export { useSiteSearch } from './hooks/use-site-search';
