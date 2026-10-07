import type { LanguageConfig, PageConfig, ProjectConfig } from '@cms/validators';

export type { LanguageConfig, PageConfig, ProjectConfig };

export type PublishedLanguageConfig = LanguageConfig & { name?: string; description?: string };

export interface PublishedOpenApi {
  title: string | null;
  path: string;
  contentHash?: string;
  updatedAt?: string;
  sourceType?: 'UPLOAD' | 'URL' | 'FILE';
  version?: string | null;
  description?: string | null;
  document?: Record<string, unknown>;
}

export type PageKind = 'PAGE' | 'FOLDER' | 'LINK' | 'OPENAPI' | 'CHANGELOG' | 'GROUP';

export interface NavNode {
  id: string;
  kind: PageKind;
  title: string;
  path: string;
  icon: string | null;
  tag: string | null;
  children: NavNode[];
}

export interface SiteFeedbackFeature {
  enabled: boolean;
  placement: 'after-content' | 'after-navigation';
  presentation: 'compact' | 'card';
}

export interface SiteLinkFeature {
  enabled: boolean;
  url: string | null;
}

export interface SiteFeatures {
  feedback: SiteFeedbackFeature;
  editSuggestions: SiteLinkFeature;
  issueLinks: SiteLinkFeature;
}

export function resolveSiteFeatures(config?: ProjectConfig | null): SiteFeatures {
  const addons = config?.addons;
  return {
    feedback: {
      enabled: addons?.feedback !== false,
      placement: addons?.feedbackPlacement ?? 'after-content',
      presentation: addons?.feedbackPresentation ?? 'compact',
    },
    editSuggestions: {
      enabled: addons?.editSuggestions !== false,
      url: addons?.editUrl?.trim() || null,
    },
    issueLinks: {
      enabled: addons?.issueLinks !== false,
      url: addons?.issueUrl?.trim() || null,
    },
  };
}

export interface SiteShell {
  project: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    config: ProjectConfig | null;
    features?: SiteFeatures;
    /** Verified primary custom domain — canonical/301 consolidation target. */
    primaryDomain: string | null;
  };
  nav: NavNode[];
  /** Only ENABLED languages — the server filters disabled ones out. */
  languages: Array<{ code: string; label: string; direction: 'LTR' | 'RTL'; isDefault: boolean; enabled?: boolean }>;
  versions: Array<{ id: string; name: string; slug: string; isDefault: boolean }>;
  activeLanguage: string;
  activeVersion: string;
  /** The ACTIVE language's config (localized site name/description + SEO
   *  defaults) — lets the chrome and site-level head localize the brand. */
  languageConfig: PublishedLanguageConfig | null;
  version: number;
  generatedAt: string;
  /** Validated OpenAPI document metadata frozen in the current deployment. */
  openapi?: PublishedOpenApi | null;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface SitePage {
  project: SiteShell['project'];
  page: {
    id: string;
    createdAt: string;
    updatedAt: string;
    title: string;
    /** Author-written summary — the visible lede. null when none was set. */
    description: string | null;
    /** Summary derived from the body: SEO/social fallback only, never a lede. */
    excerpt: string;
    icon: string | null;
    path: string;
    content: string;
    headings: Heading[];
    config: PageConfig | null;
  };
  /** The language the page actually resolved in (drives canonical/og/hreflang). */
  activeLanguage: string;
  /** The docs version the page resolved in. */
  activeVersion: string;
  versions: SiteShell['versions'];
  /** SEO defaults of the page's language (layered under the page's own SEO). */
  languageConfig: PublishedLanguageConfig | null;
  /** hreflang alternates: `path` is the page's URL in that language, or null
   *  when that language has no corresponding page (then it's omitted). */
  languages: Array<{ code: string; isDefault: boolean; path: string | null }>;
  breadcrumbs: Array<{ title: string; path: string }>;
  prev: { title: string; path: string } | null;
  next: { title: string; path: string } | null;
}

export interface SiteSearchHit {
  id: string;
  title: string;
  path: string;
  description: string;
  icon?: string;
  snippet: string;
  score: number;
  /** Language of the matched published page; used to build its localized URL. */
  language: string;
}

export interface ChangelogEntry {
  version: number;
  date: string | null;
  title: string;
  pages: number;
}

export type PublicAnalyticsPayload =
  | { name: 'page_view'; path: string; referrer?: string; language?: string }
  | { name: 'page_engaged'; path: string; language?: string; engagementMs: number; scrollDepth: number }
  | { name: 'navigation_clicked'; path: string; targetPath: string; placement?: string; language?: string }
  | { name: 'outbound_link_clicked'; path: string; targetPath: string; placement?: string; language?: string }
  | { name: 'cta_clicked'; path: string; targetPath: string; placement?: string; language?: string }
  | { name: 'code_copied'; path: string; placement?: string; language?: string }
  | { name: 'feedback_submitted'; path: string; helpful?: boolean; language?: string; feedback?: 'helpful' | 'not_helpful'; target?: 'page' }
  | { name: 'search_result_clicked'; path?: string; resultId?: string; resultPosition?: number; language?: string };
