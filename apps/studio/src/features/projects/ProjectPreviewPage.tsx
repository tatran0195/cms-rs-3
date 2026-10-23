import { Button } from '@cms/design-system/components/ui/button';
import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { PageNode } from '@cms/sdk';
import { useBranches, useLanguages, usePage, usePages, useProject } from '@cms/sdk/react';
import {
  buildNavTree,
  DocumentationProjectPreviewLayout,
  DocumentationThemeProvider,
  Markdown,
  PageIcon,
  projectThemeCss,
  projectThemeStyle,
  projectThemeVariables,
  resolveProjectTheme,
  SiteNav,
} from '@cms/site';
import { ChevronDown, Eye, Link2, Moon, Sun } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

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

interface ScopeOption {
  value: string;
  label: ReactNode;
}

function ScopeSelect({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  options: ScopeOption[];
  value: string | undefined;
}) {
  return (
    <Select
      items={options}
      onValueChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
      value={value ?? null}
    >
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectPreviewPage({ projectId, search, onUpdateSearch }: ProjectPreviewPageProps) {
  const t = useT();
  const { data: project } = useProject(projectId);
  const { data: languages } = useLanguages(projectId);
  const { data: branches } = useBranches(projectId);
  const activeLanguageId = search.languageId ?? languages?.find((language) => language.isDefault)?.id ?? languages?.[0]?.id;
  const activeLanguage = languages?.find((language) => language.id === activeLanguageId);
  const contentDir = activeLanguage?.direction === 'RTL' ? 'rtl' : 'ltr';
  const activeBranchId = search.branchId ?? branches?.find((branch) => branch.isDefault)?.id ?? branches?.[0]?.id;
  const previewEnabled = Boolean(project);
  const { data: pages, isPending: pagesPending } = usePages(previewEnabled ? projectId : undefined, activeLanguageId, activeBranchId);
  const selected = useMemo(() => pages?.find((page) => page.id === search.pageId) ?? firstPage(pages), [pages, search.pageId]);
  const { data: page, isPending: pagePending } = usePage(previewEnabled ? projectId : undefined, selected?.id);
  const contentPending = pagesPending || (Boolean(selected) && pagePending);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>(() => (project?.config?.styling?.theme === 'dark' ? 'dark' : 'light'));
  const theme = resolveProjectTheme(project?.config);
  const themeCss = projectThemeCss(project?.config);

  const navNodes = useMemo(() => {
    if (!pages) return [];
    const snapshotPages = pages.map((page) => ({
      ...page,
      languageCode: activeLanguage?.code ?? '',
      versionId: activeBranchId ?? '',
      content: '',
    }));
    return buildNavTree(snapshotPages as any, activeLanguage?.code);
  }, [pages, activeLanguage?.code, activeBranchId]);

  const navAnchors = (project?.config?.navbar?.anchors ?? []) as Array<{ label: string; href: string; icon?: string; external?: boolean }>;
  const navAnchorsNode =
    navAnchors.length > 0 ? (
      <ul className="mb-4 space-y-1 border-border/60 border-b pb-3">
        {navAnchors.map((anchor) => (
          <li key={`${anchor.label}-${anchor.href}`}>
            <a
              href={anchor.href}
              target={anchor.external ? '_blank' : undefined}
              rel={anchor.external ? 'noopener noreferrer' : undefined}
              className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-card shadow-2xs transition-colors group-hover:border-primary/40 group-hover:text-primary">
                {anchor.icon ? <PageIcon name={anchor.icon} className="size-3.5" /> : <Link2 className="size-3.5" />}
              </span>
              <span className="truncate">{anchor.label}</span>
            </a>
          </li>
        ))}
      </ul>
    ) : null;

  const handleNavClick = (e: React.MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    if (anchor.getAttribute('target') === '_blank') return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    const cleanHref = href.split('?')[0]?.replace(/\/+$/, '') ?? '';
    const matched = pages?.find((p) => {
      if (p.kind !== 'PAGE' || !p.path) return false;
      return cleanHref.endsWith(`/${p.path}`) || cleanHref === p.path || cleanHref.endsWith(p.path);
    });
    if (matched) {
      onUpdateSearch({ pageId: matched.id });
    }
  };

  const branchOptions = useMemo<ScopeOption[]>(
    () =>
      (branches ?? []).map((branch) => ({
        value: branch.id,
        label: <span dir="ltr">{branch.name}</span>,
      })),
    [branches],
  );
  const languageOptions = useMemo<ScopeOption[]>(
    () =>
      (languages ?? []).map((language) => ({
        value: language.id,
        label: <span dir={language.direction === 'RTL' ? 'rtl' : 'ltr'}>{language.label}</span>,
      })),
    [languages],
  );
  const scopeSelects = (
    <>
      {branchOptions.length > 1 ? (
        <ScopeSelect
          ariaLabel={t('settings.git.productionBranch')}
          onChange={(branchId) => onUpdateSearch({ branchId, pageId: undefined })}
          options={branchOptions}
          value={activeBranchId}
        />
      ) : null}
      {languageOptions.length > 1 ? (
        <ScopeSelect
          ariaLabel={t('editor.addLanguage.languageField')}
          onChange={(languageId) => onUpdateSearch({ languageId, pageId: undefined })}
          options={languageOptions}
          value={activeLanguageId}
        />
      ) : null}
    </>
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
    <DocumentationThemeProvider
      appearance={previewTheme}
      className="flex h-full w-full min-h-0 flex-col overflow-hidden"
      context="project-preview"
      direction={contentDir}
      css={themeCss}
      style={{
        ...projectThemeVariables(project?.config, previewTheme),
        ...projectThemeStyle(project?.config),
      }}
      theme={theme}
    >
      <DocumentationProjectPreviewLayout
        mobileNavigation={
          <div className="border-border border-b bg-card/40 md:hidden" data-theme-region="sidebar">
            <button
              aria-controls="mobile-preview-navigation"
              aria-expanded={mobileNavigationOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-start"
              onClick={() => setMobileNavigationOpen((open) => !open)}
              type="button"
            >
              <Eye className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">{t('preview.title')}</span>
                <span className="block truncate text-muted-foreground text-xs">{selected?.title ?? t('preview.empty')}</span>
              </span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', mobileNavigationOpen && 'rotate-180')} />
            </button>

            {mobileNavigationOpen ? (
              <div
                className="max-h-[min(55vh,28rem)] overflow-y-auto border-border border-t p-3"
                id="mobile-preview-navigation"
                onClickCapture={(e) => {
                  handleNavClick(e);
                  setMobileNavigationOpen(false);
                }}
              >
                <div className="mb-3 grid gap-2">{scopeSelects}</div>
                {navAnchorsNode}
                {pagesPending ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-10/12" />
                  </div>
                ) : (
                  <SiteNav
                    nodes={navNodes}
                    projectId={projectId}
                    currentPath={selected?.path ?? ''}
                    lang={activeLanguage?.code}
                    version={activeBranchId}
                  />
                )}
              </div>
            ) : null}
          </div>
        }
        navigation={
          <>
            <div className="shrink-0 border-border border-b p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2 mb-2 font-semibold text-xs tracking-tight text-muted-foreground uppercase">
                <span className="flex items-center gap-1.5">
                  <Eye className="size-3.5" /> {t('preview.title')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setPreviewTheme((curr) => (curr === 'dark' ? 'light' : 'dark'))}
                  title={previewTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label="Toggle preview theme"
                >
                  {previewTheme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                </Button>
              </div>
              <div className="grid gap-1.5">{scopeSelects}</div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-3" onClickCapture={handleNavClick} data-theme-region="sidebar-content">
                {navAnchorsNode}
                {pagesPending ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-10/12" />
                    <Skeleton className="h-8 w-8/12" />
                  </div>
                ) : (
                  <SiteNav
                    nodes={navNodes}
                    projectId={projectId}
                    currentPath={selected?.path ?? ''}
                    lang={activeLanguage?.code}
                    version={activeBranchId}
                  />
                )}
              </div>
            </ScrollArea>
          </>
        }
        content={
          <main className="min-h-0 flex-1 overflow-y-auto bg-background" data-theme-region="preview-main">
            <article className="mx-auto max-w-4xl px-5 py-7 sm:px-8 md:px-10 md:py-10" data-theme-region="article" dir={contentDir}>
              {contentPending ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-10/12" />
                </div>
              ) : page ? (
                <>
                  <div className="mb-8 border-border border-b pb-5">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <PageIcon className="size-4" name={page.icon} />
                      {page.path || '/'}
                    </div>
                    <h1 className="mt-2 font-semibold text-3xl tracking-tight">{page.title}</h1>
                    {page.description ? <p className="mt-2 text-muted-foreground">{page.description}</p> : null}
                  </div>
                  <Markdown
                    content={page.content}
                    site={{
                      projectId,
                      lang: activeLanguage?.code,
                      version: activeBranchId,
                    }}
                  />
                </>
              ) : (
                <div className="text-muted-foreground text-sm">{t('preview.empty')}</div>
              )}
            </article>
          </main>
        }
      />
    </DocumentationThemeProvider>
  );
}
