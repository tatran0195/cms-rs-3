import { cn } from '@cms/design-system/lib/utils';
import { siteT } from '@cms/i18n/site';
import { protectMarkdownCode } from '@cms/shared/markdown-code';
import { CalendarClock, Check, CircleAlert, Clock3, Image, PencilLine, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSiteAnalytics } from '../context/site-analytics-provider';
import { FluxTOC } from '../layouts/flux';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from '../layouts/page';
import { localeTag } from '../lib/format';
import { siteHref } from '../lib/site-paths';
import { resolveSiteFeatures, type SiteFeatures, type SitePage } from '../types';
import { useDocumentationTheme } from './documentation-theme-provider';
import { Markdown } from './markdown';
import { useSitePageAlternates } from './page-alternates-context';
import { SitePageFooter } from './site-page-footer';
import { TableOfContents } from './toc';
import { TOCPopover } from './toc-popover';

const applyUrlTemplate = (template: string | undefined, path: string, fallbackUrl: string): string | null => {
  const trimmed = template?.trim();
  if (!trimmed) {
    return null;
  }
  const pagePath = path.replace(/^\/+/, '');
  return trimmed
    .replaceAll('{path}', pagePath)
    .replaceAll('{encodedPath}', encodeURIComponent(pagePath))
    .replaceAll('{url}', encodeURIComponent(fallbackUrl));
};

/** "Was this page helpful?" + edit/issue links, rendered at the end of the
 *  article so it always aligns with the reading column. */
function ReaderActions({ projectId, path, language, features }: { projectId: string; path: string; language?: string; features: SiteFeatures }) {
  const t = siteT(language);
  const { track } = useSiteAnalytics();
  const [sentiment, setSentiment] = useState<'helpful' | 'not_helpful' | null>(null);
  const [pageUrl, setPageUrl] = useState(() => `/sites/${projectId}/${path}`);
  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);
  const editUrl = features.editSuggestions.enabled ? applyUrlTemplate(features.editSuggestions.url ?? undefined, path, pageUrl) : null;
  const issueUrl = features.issueLinks.enabled ? applyUrlTemplate(features.issueLinks.url ?? undefined, path, pageUrl) : null;
  const showFeedback = features.feedback.enabled;
  const presentation = features.feedback.presentation;

  if (!showFeedback && !editUrl && !issueUrl) {
    return null;
  }

  const sendFeedback = (query: 'helpful' | 'not_helpful') => {
    setSentiment(query);
    track({
      name: 'feedback_submitted',
      path,
      feedback: query,
      target: 'page',
    });
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between',
        presentation === 'card' ? 'mt-8 rounded-xl border border-border bg-muted/30 p-4 sm:p-5' : 'mt-14 border-border/70 border-t pt-6',
      )}
    >
      {showFeedback ? (
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          {sentiment ? (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Check className="size-4 text-primary" /> {t('feedbackThanks')}
            </span>
          ) : (
            <>
              <span>{t('feedbackQuestion')}</span>
              <div className="flex items-center gap-1.5">
                <button
                  className="grid size-8 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => sendFeedback('helpful')}
                  type="button"
                  aria-label={t('feedbackYes')}
                >
                  <ThumbsUp className="size-3.5" />
                </button>
                <button
                  className="grid size-8 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  onClick={() => sendFeedback('not_helpful')}
                  type="button"
                  aria-label={t('feedbackNo')}
                >
                  <ThumbsDown className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div />
      )}

      {editUrl || issueUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          {editUrl ? (
            <a
              className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
              href={editUrl}
              rel="noreferrer"
              target="_blank"
            >
              <PencilLine className="size-3.5" /> {t('editPage')}
            </a>
          ) : null}
          {issueUrl ? (
            <a
              className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
              href={issueUrl}
              rel="noreferrer"
              target="_blank"
            >
              <CircleAlert className="size-3.5" /> {t('raiseIssue')}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SitePageView({ projectId, lang, data }: { projectId: string; lang?: string; data: SitePage }) {
  const { setAlternates } = useSitePageAlternates();

  useEffect(() => {
    setAlternates(data?.languages ?? []);
    return () => setAlternates([]);
  }, [data?.languages, setAlternates]);

  const { page, breadcrumbs, prev, next } = data;
  const language = data.activeLanguage ?? lang;
  // Build links with the RESOLVED version, not the raw first-path-segment
  // candidate the route passes in: for a page like `getting-started/quickstart`
  // that candidate is a content segment, and prefixing it onto sibling links
  // would produce `/getting-started/getting-started/…`.
  const resolvedVersion = data.versions.find((item) => item.slug === data.activeVersion);
  const versionPrefix = resolvedVersion && !resolvedVersion.isDefault ? resolvedVersion.slug : undefined;
  const defaultLanguage = data.languages.find((item) => item.isDefault)?.code;
  const navigationLanguage = data.activeLanguage !== defaultLanguage ? data.activeLanguage : undefined;
  // Article-level chrome strings follow the page's RESOLVED language (which can
  // differ from the URL param on fallback pages) so labels match the content.
  const tArticle = siteT(language);
  // Per-page layout behaviour (Mintlify-style `mode`/`hideToc`): `wide` drops the
  // TOC and fills the width, `center` narrows + centers the column.
  const mode = page.config?.mode ?? 'default';
  const showToc = mode === 'default' && !page.config?.hideToc && page.headings.length > 0;
  const ancestors = breadcrumbs.slice(0, -1);
  // Whether ReaderActions will render — when it doesn't, the prev/next pager
  // takes over the article-footer divider it normally provides.
  const features = data.project.features ?? resolveSiteFeatures(data.project.config);
  const _hasReaderActions =
    features.feedback.enabled ||
    (features.editSuggestions.enabled && Boolean(features.editSuggestions.url)) ||
    (features.issueLinks.enabled && Boolean(features.issueLinks.url));
  const readerActionsAfterNavigation = features.feedback.placement === 'after-navigation';
  const readableText = page.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[`#*_>[\](){}|~-]/g, ' ');
  const readingMinutes = Math.max(1, Math.ceil(readableText.split(/\s+/).filter(Boolean).length / 220));
  const imageCount = (protectMarkdownCode(page.content).content.match(/!\[[^\]]*\]\([^)]*\)|<img\b/gi) ?? []).length;
  const updatedLabel = new Intl.DateTimeFormat(localeTag(language || 'en'), {
    dateStyle: 'medium',
  }).format(new Date(page.updatedAt));
  const currentTheme = useDocumentationTheme();
  const tocStyle = currentTheme?.layout?.tocStyle ?? 'clerk';
  const tocDepth = currentTheme?.layout?.tocDepth ?? 3;
  const isFlux = currentTheme?.layout?.docsLayout === 'flux';

  const breadcrumbsElement =
    ancestors.length > 0 ? (
      <div className="mb-3 flex flex-wrap items-center gap-1.5 font-semibold text-primary text-sm">
        {ancestors.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className="text-muted-foreground/60" aria-hidden>
                /
              </span>
            ) : null}
            <a
              href={siteHref(projectId, crumb.path, {
                lang: navigationLanguage,
                version: versionPrefix,
              })}
              className="transition-opacity hover:opacity-80"
            >
              {crumb.title}
            </a>
          </span>
        ))}
      </div>
    ) : null;

  const tableOfContentsElement =
    mode !== 'center' && showToc && !isFlux ? (
      <TableOfContents headings={page.headings} label={tArticle('onThisPage')} style={tocStyle} depth={tocDepth} />
    ) : null;

  const tocPopoverElement =
    mode !== 'center' && showToc ? (
      isFlux ? (
        <FluxTOC
          headings={page.headings.map((h) => ({
            id: h.id,
            title: h.text,
            url: `#${h.id}`,
            depth: h.depth ?? 2,
          }))}
          style={tocStyle}
        />
      ) : (
        <TOCPopover headings={page.headings} label={tArticle('onThisPage')} style={tocStyle} depth={tocDepth} />
      )
    ) : null;

  return (
    <DocsPage
      breadcrumb={breadcrumbsElement}
      tableOfContents={tableOfContentsElement}
      tocPopover={tocPopoverElement}
      full={mode === 'wide' || currentTheme?.layout?.contentWidth === 'wide'}
      className={cn(mode === 'center' && 'mx-auto max-w-[42rem]', (mode === 'wide' || currentTheme?.layout?.contentWidth === 'wide') && 'max-w-none')}
    >
      <DocsTitle>{page.title}</DocsTitle>
      {page.description ? <DocsDescription>{page.description}</DocsDescription> : null}
      <DocsBody>
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs" aria-label={tArticle('articleDetails')}>
          <li className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden /> {readingMinutes} {tArticle('minRead')}
          </li>
          {imageCount > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <Image className="size-3.5" aria-hidden /> {imageCount} {tArticle(imageCount === 1 ? 'screenshot' : 'screenshots')}
            </li>
          ) : null}
          <li className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden /> {tArticle('updated')} {updatedLabel}
          </li>
        </ul>
        {page.config?.tags?.length ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={tArticle('tags')}>
            {page.config.tags.map((tag) => (
              <li className="rounded-full border border-border bg-muted/45 px-2.5 py-1 font-medium text-muted-foreground text-xs" key={tag}>
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-8">
          <Markdown
            content={page.content}
            site={{
              projectId,
              lang: language,
              defaultLanguage,
              version: versionPrefix,
            }}
          />
        </div>

        {readerActionsAfterNavigation ? null : <ReaderActions projectId={projectId} path={page.path} language={language} features={features} />}

        {prev || next ? (
          <SitePageFooter
            previous={
              prev
                ? {
                    title: prev.title,
                    href: siteHref(projectId, prev.path, {
                      lang: navigationLanguage,
                      version: versionPrefix,
                    }),
                  }
                : null
            }
            next={
              next
                ? {
                    title: next.title,
                    href: siteHref(projectId, next.path, {
                      lang: navigationLanguage,
                      version: versionPrefix,
                    }),
                  }
                : null
            }
          />
        ) : null}
        {readerActionsAfterNavigation ? <ReaderActions projectId={projectId} path={page.path} language={language} features={features} /> : null}
      </DocsBody>
    </DocsPage>
  );
}
