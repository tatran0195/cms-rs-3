import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { useT } from '@cms/i18n/react';
import type { PageNode } from '@cms/sdk';
import { useBranches, useLanguages, usePage, usePages, useProject } from '@cms/sdk/react';
import { extractHeadings } from '@cms/shared';
import { buildNavTree, resolveSiteFeatures, SiteApiProvider, SiteLayout, type SitePage, SitePageView, type SiteShell } from '@cms/site';
import { Eye } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { cmsClient, QueryProvider } from '@/shared';

export interface ProjectPreviewPageProps {
  projectId: string;
  search: {
    branchId?: string;
    languageId?: string;
    pageId?: string;
  };
  onUpdateSearch: (patch: Partial<{ branchId?: string; languageId?: string; pageId?: string }>) => void;
}

const firstPage = (pages: PageNode[] | undefined): PageNode | undefined => pages?.find((page) => page.kind === 'PAGE' && !page.hidden);

export function ProjectPreviewPage({ projectId, search, onUpdateSearch }: ProjectPreviewPageProps) {
  const t = useT();
  const { data: project } = useProject(projectId);
  const { data: languages } = useLanguages(projectId);
  const { data: branches } = useBranches(projectId);
  const activeLanguageId = search.languageId ?? languages?.find((language) => language.isDefault)?.id ?? languages?.[0]?.id;
  const activeLanguage = languages?.find((language) => language.id === activeLanguageId);
  const activeBranchId = search.branchId ?? branches?.find((branch) => branch.isDefault)?.id ?? branches?.[0]?.id;
  const activeBranch = branches?.find((branch) => branch.id === activeBranchId);
  const previewEnabled = Boolean(project);

  const { data: pages, isPending: pagesPending } = usePages(previewEnabled ? projectId : undefined, activeLanguageId, activeBranchId);
  const selected = useMemo(() => pages?.find((page) => page.id === search.pageId) ?? firstPage(pages), [pages, search.pageId]);
  const { data: page, isPending: pagePending } = usePage(previewEnabled ? projectId : undefined, selected?.id);
  const contentPending = pagesPending || (Boolean(selected) && pagePending);

  const navNodes = useMemo(() => {
    if (!pages) return [];
    const snapshotPages = pages.map((p) => ({
      ...p,
      languageCode: activeLanguage?.code ?? '',
      versionId: activeBranchId ?? '',
      content: '',
    }));
    return buildNavTree(snapshotPages as any, activeLanguage?.code);
  }, [pages, activeLanguage?.code, activeBranchId]);

  const breadcrumbs = useMemo(() => {
    if (!selected?.path) return [];
    const segments = selected.path.replace(/^\/+|\/+$/g, '').split('/');
    let current = '';
    return segments.map((seg) => {
      current = current ? `${current}/${seg}` : seg;
      const matchedNode = pages?.find((p) => p.path?.replace(/^\/+|\/+$/g, '') === current);
      return {
        title: matchedNode?.title ?? seg,
        path: current,
      };
    });
  }, [selected?.path, pages]);

  const { prevPage, nextPage } = useMemo(() => {
    if (!pages || !selected) return { prevPage: null, nextPage: null };
    const docPages = pages.filter((p) => p.kind === 'PAGE' && !p.hidden && p.path);
    const idx = docPages.findIndex((p) => p.id === selected.id);
    return {
      prevPage: idx > 0 ? docPages[idx - 1] : null,
      nextPage: idx >= 0 && idx < docPages.length - 1 ? docPages[idx + 1] : null,
    };
  }, [pages, selected]);

  const headings = useMemo(() => {
    if (!page?.content) return [];
    return extractHeadings(page.content);
  }, [page?.content]);

  const previewSiteShell = useMemo<SiteShell | null>(() => {
    if (!project) return null;
    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description ?? null,
        config: project.config ?? null,
        features: resolveSiteFeatures(project.config),
        primaryDomain: null,
      },
      nav: navNodes,
      languages: (languages ?? []).map((l) => ({
        code: l.code,
        label: l.label,
        direction: l.direction,
        isDefault: l.isDefault,
        enabled: l.enabled,
      })),
      versions: (branches ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.name,
        isDefault: b.isDefault,
      })),
      activeLanguage: activeLanguage?.code ?? 'en',
      activeVersion: activeBranch?.name ?? 'main',
      languageConfig: null,
      version: 1,
      generatedAt: new Date().toISOString(),
    };
  }, [project, navNodes, languages, branches, activeLanguage?.code, activeBranch?.name]);

  const previewSitePage = useMemo<SitePage | null>(() => {
    if (!previewSiteShell || !page) return null;
    return {
      project: previewSiteShell.project,
      page: {
        id: page.id,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        title: page.title,
        description: page.description ?? null,
        excerpt: page.description ?? '',
        icon: page.icon ?? null,
        path: page.path ?? '',
        content: page.content ?? '',
        headings,
        config: page.config ?? null,
      },
      activeLanguage: activeLanguage?.code ?? 'en',
      activeVersion: activeBranch?.name ?? 'main',
      versions: previewSiteShell.versions,
      languageConfig: null,
      languages: (languages ?? []).map((l) => ({
        code: l.code,
        isDefault: l.isDefault,
        path: page.path ?? '',
      })),
      breadcrumbs,
      prev: prevPage ? { title: prevPage.title, path: prevPage.path ?? '' } : null,
      next: nextPage ? { title: nextPage.title, path: nextPage.path ?? '' } : null,
    };
  }, [previewSiteShell, page, activeLanguage?.code, activeBranch?.name, languages, breadcrumbs, prevPage, nextPage, headings]);

  const handleNavigate = useCallback(
    (targetHref: string) => {
      const clean = (targetHref.split('?')[0] ?? '').replace(/^\/+|\/+$/g, '');
      const matched = pages?.find((p) => {
        if (p.kind !== 'PAGE' || !p.path) return false;
        const pClean = p.path.replace(/^\/+|\/+$/g, '');
        return clean.endsWith(pClean) || clean === pClean;
      });
      if (matched) {
        onUpdateSearch({ pageId: matched.id });
      }
    },
    [pages, onUpdateSearch],
  );

  const handleLanguageChange = useCallback(
    (code: string) => {
      const matched = languages?.find((l) => l.code === code);
      if (matched) {
        onUpdateSearch({ languageId: matched.id, pageId: undefined });
      }
    },
    [languages, onUpdateSearch],
  );

  const handleVersionChange = useCallback(
    (slug: string) => {
      const matched = branches?.find((b) => b.name === slug || b.id === slug);
      if (matched) {
        onUpdateSearch({ branchId: matched.id, pageId: undefined });
      }
    },
    [branches, onUpdateSearch],
  );

  if (!previewEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-12">
        <div className="mb-3 flex items-center gap-2 font-semibold text-lg">
          <Eye className="size-5 text-muted-foreground" /> {t('preview.title')}
        </div>
        <p className="text-muted-foreground text-sm">{t('preview.disabled')}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-background" data-theme-region="preview-root">
      <QueryProvider>
        <SiteApiProvider
          config={{
            search: (options) =>
              cmsClient.sites.search(options.projectId, options.query, {
                language: options.language,
                version: options.version,
                limit: options.limit,
              }),
          }}
        >
          <SiteLayout
            site={previewSiteShell}
            projectId={projectId}
            lang={activeLanguage?.code}
            basePath={`/app/projects/${projectId}/preview`}
            onNavigate={handleNavigate}
            onLanguageChange={handleLanguageChange}
            onVersionChange={handleVersionChange}
          >
            {contentPending ? (
              <div className="mx-auto max-w-[var(--fd-page-width,900px)] px-6 py-12 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : previewSitePage ? (
              <SitePageView projectId={projectId} lang={activeLanguage?.code} data={previewSitePage} />
            ) : (
              <div className="p-12 text-center text-muted-foreground text-sm">{t('preview.empty')}</div>
            )}
          </SiteLayout>
        </SiteApiProvider>
      </QueryProvider>
    </div>
  );
}
