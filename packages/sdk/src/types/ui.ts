/**
 * UI-facing canonical domain models for API responses.
 *
 * In contrast to the raw backend DTOs in `./generated/*` (which reflect internal Rust entity
 * tables with `JsonValue` configs and flat DB projections), these interfaces represent the rich,
 * validated models consumed across Studio and reader sites.
 *
 * They integrate strongly-typed schemas from `@cms/validators` (such as `ProjectConfig`, `PageConfig`),
 * `@cms/shared` (themes, addons), normalized camelCase conventions, and composite pipeline structures
 * (such as `SiteShell`, `SitePage`, `PendingChange`).
 */

import type { AddonGroup, AddonId } from '@cms/shared/addons';
import type { ResolvedTheme, ThemeConfigChange, ThemeTemplateV1 } from '@cms/shared/themes';
import type { LanguageConfig, PageConfig, ProjectConfig } from '@cms/validators';

export type { AnalyticsRange, LanguageConfig, PageConfig, ProjectConfig } from '@cms/validators';
export type {
  ProjectInvitationItem,
  ProjectInvitationResponse,
  ProjectMemberItem,
  ProjectMembersResponse,
  ProjectMemberUser,
} from '../resources/projects';

export type PublishedLanguageConfig = LanguageConfig & { name?: string; description?: string };

export interface Language {
  id: string;
  projectId: string;
  code: string;
  config?: LanguageConfig | null;
  translation?: { id: string; projectId: string; languageId: string; name: string | null; description: string | null } | null;
  label: string;
  direction: 'LTR' | 'RTL';
  isDefault: boolean;
  /** Serving toggle: disabled languages stay editable but are hidden from published site. */
  enabled?: boolean;
  position: number;
  /** Default-branch PAGE coverage compared with the default language. */
  coverage?: {
    pageCount: number;
    sourcePageCount: number;
    matchedPages: number;
    missingPages: number;
    extraPages: number;
    percentage: number | null;
  };
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  isPublic?: boolean;
  is_public?: boolean;
  config: ProjectConfig | null;
  languages?: Language[];
  createdAt: string;
  updatedAt: string;
  _count?: { pages: number; deployments: number; domains?: number };
}

export interface ApiKey {
  id: string;
  name: string;
  lastFour: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  legacy: boolean;
  state: 'active' | 'expired' | 'revoked' | 'rotation_required';
}

export interface ApiKeySecret extends ApiKey {
  secret: string;
}

export interface OpenApiConfiguration {
  title: string;
  path: string;
  contentHash: string;
  updatedAt: string;
  source: { type: 'upload' } | { type: 'url'; url: string } | { type: 'repository'; path: string };
}

export interface PublishedOpenApi {
  title: string;
  path: string;
  contentHash: string;
  updatedAt: string;
}

export type PageKind = 'PAGE' | 'GROUP';

export interface PageNode {
  id: string;
  parentId: string | null;
  languageId: string;
  kind: PageKind;
  title: string;
  slug: string;
  path: string;
  icon: string | null;
  description: string | null;
  config?: PageConfig | null;
  translationKey?: string | null;
  position: number;
  hidden: boolean;
  updatedAt: string;
}

export interface Page extends PageNode {
  content: string;
  projectId: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentStatus = 'PENDING' | 'BUILDING' | 'READY' | 'FAILED' | 'pending' | 'building' | 'deploying' | 'active' | 'failed' | 'deleted';

export interface DeploymentIssue {
  type: 'broken-link' | 'grammar';
  pageTitle: string;
  pagePath: string;
  detail: string;
}

export interface Deployment {
  id: string;
  version: number;
  status: DeploymentStatus;
  pagesCount: number;
  commitMessage: string | null;
  error: string | null;
  errorDetails?: DeploymentIssue[] | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DeploymentDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface PendingChange {
  id: string;
  title: string;
  path: string;
  languageCode: string;
  kind: 'PAGE' | 'GROUP';
  status: 'added' | 'modified' | 'removed';
  fields: string[];
  additions: number;
  deletions: number;
  lines: DeploymentDiffLine[];
  truncated: boolean;
}
import type { DnsRecord } from './generated/DnsRecord';

export interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  isPrimary: boolean;
  dnsStatus: 'PENDING' | 'VERIFIED' | 'ERROR';
  sslStatus: 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'ERROR';
  verificationToken: string;
  createdAt: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  records?: DnsRecord[];
}

export interface Asset {
  id: string;
  key: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface WorkspaceSettings {
  notifications: Record<string, boolean>;
  integrations: Record<string, unknown>;
  git: Record<string, unknown>;
  name: string;
  slug: string | null;
  projectCount: number;
  memberCount: number;
  [key: string]: unknown;
}

export interface ProjectAddon {
  id: AddonId;
  group: AddonGroup;
  enabled: boolean;
  config: Record<string, unknown>;
  revision: number;
  updatedAt: string | null;
  status: 'active' | 'inactive' | 'needs_configuration';
}

export interface CommentAnchor {
  quote: string;
  from?: number;
  to?: number;
}

export interface Comment {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  anchor?: CommentAnchor | null;
  user: { id: string; name: string; image: string | null };
}

export interface ChangelogEntry {
  version: number;
  date: string | null;
  title: string;
  pages: number;
}

export interface NotificationItem {
  id: string;
  projectId: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NavNode {
  id: string;
  kind: PageKind;
  title: string;
  path: string;
  icon: string | null;
  tag: string | null;
  children: NavNode[];
}

export interface SiteShell {
  id?: string;
  name?: string;
  project?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    config: ProjectConfig | null;
    primaryDomain: string | null;
  };
  nav?: NavNode[];
  languages?: Array<{ code: string; label: string; direction: 'LTR' | 'RTL'; isDefault: boolean; enabled?: boolean }>;
  versions?: Array<{ id: string; name: string; slug: string; isDefault: boolean }>;
  activeLanguage?: string;
  activeVersion?: string;
  languageConfig?: PublishedLanguageConfig | null;
  version?: number;
  generatedAt?: string;
  openapi?: PublishedOpenApi | null;
  [key: string]: unknown;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface SitePage {
  id?: string;
  path?: string;
  content?: string;
  project?: SiteShell['project'];
  page?: {
    id: string;
    createdAt: string;
    updatedAt: string;
    title: string;
    description: string | null;
    excerpt: string;
    icon: string | null;
    path: string;
    content: string;
    headings: Heading[];
    config: PageConfig | null;
  };
  activeLanguage?: string;
  activeVersion?: string;
  versions?: SiteShell['versions'];
  languageConfig?: PublishedLanguageConfig | null;
  languages?: Array<{ code: string; isDefault: boolean; path: string | null }>;
  breadcrumbs?: Array<{ title: string; path: string }>;
  prev?: { title: string; path: string } | null;
  next?: { title: string; path: string } | null;
  [key: string]: unknown;
}

export interface SearchCitation {
  id: string;
  pageId: string;
  title: string;
  path: string;
  heading?: string;
  snippet: string;
  direction: 'ltr' | 'rtl';
}

export interface SiteSearchHit {
  id: string;
  title: string;
  path: string;
  description: string;
  icon?: string;
  snippet: string;
  score: number;
  language: string;
}

export interface SearchAnswer {
  status: 'answered' | 'no_answer';
  answer: string;
  confidence: number;
  citations: SearchCitation[];
  model?: string;
  cacheHit: boolean;
  quotaRemaining: number;
}

export interface ProjectThemeImportResult {
  applied: boolean;
  mode: 'merge' | 'replace';
  migratedFrom?: 0;
  changes: ThemeConfigChange[];
  theme: ResolvedTheme;
  template: ThemeTemplateV1;
  publishedChangesPending: boolean;
}

export interface ContentImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  assetsImported?: number;
  assetsSkipped?: number;
  warnings: string[];
}

export interface RedirectIssue {
  code: string;
  rowIndexes: number[];
  sequence: string[];
  message: string;
}

export interface PendingChangesResponse {
  changes: PendingChange[];
  hasBaseline?: boolean;
  lastVersion?: number;
  redirectIssues?: RedirectIssue[];
}

export interface ReaderAccessData {
  accessMode: 'PUBLIC' | 'WORKSPACE' | 'READERS';
  readers: Array<{
    id: string;
    email: string | null;
    name: string | null;
    status: string;
    audiences: Array<{ audience: { id: string; name: string } }>;
    _count: { sessions: number };
  }>;
  audiences: Array<{
    id: string;
    name: string;
    grants: Array<{ pageId: string | null }>;
    _count: { readers: number };
  }>;
  jwt: {
    enabled: boolean;
    issuer: string;
    audience: string;
    jwksUrl: string | null;
    publicJwks: unknown;
    groupsClaim: string;
    claimMapping: unknown;
    sessionTtlMinutes: number;
    maxTokenAgeSeconds: number;
    clockToleranceSecs: number;
  } | null;
  audit: Array<{ id: string; action: string; createdAt: string }>;
}

export interface GitConflict {
  id: string;
  path: string;
  status: string;
  baseContent: string | null;
  oursContent: string | null;
  theirsContent: string | null;
}

export interface GitOperation {
  id: string;
  kind: string;
  status: string;
  commitMessage: string | null;
  changedFiles: Array<{ path: string; status: string }> | null;
  pullRequestNo: number | null;
  pullRequestUrl: string | null;
  error: string | null;
  createdAt: string;
  conflicts: GitConflict[];
}

export interface GitWorkflowStatus {
  id: string;
  repository: string;
  baseBranch: string;
  headBranch: string;
  contentPath: string;
  credentialConfigured: boolean;
  webhookConfigured: boolean;
  lastSyncStatus: string;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  operations: GitOperation[];
  pullRequests: Array<{
    id: string;
    number: number;
    url: string;
    title: string;
    draft: boolean;
    state: string;
    previews: Array<{ id: string; status: string; url: string | null; error: string | null }>;
  }>;
  files: Array<{ path: string }>;
}
