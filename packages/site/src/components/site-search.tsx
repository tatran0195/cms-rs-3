import { Command, CommandGroup, CommandItem, CommandList } from '@cms/design-system/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@cms/design-system/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { siteT } from '@cms/i18n/site';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { ChevronRight, FileText, Loader2, Search, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSiteAnalytics } from '../context/site-analytics-provider';
import { useSiteSearch } from '../hooks/use-site-search';
import { siteHref } from '../lib/site-paths';
import type { SiteSearchHit } from '../types';
import { hasIcon, PageIcon } from './page-icon';

// ── Highlight matched query tokens ────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = useMemo(
    () =>
      query
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 2)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    [query],
  );

  if (!tokens.length || !text) return <>{text}</>;

  const splitRe = new RegExp(`(${tokens.join('|')})`, 'gi');
  const testRe = new RegExp(`^(${tokens.join('|')})$`, 'i');
  const parts: Array<{ key: string; value: string }> = [];
  let offset = 0;
  for (const value of text.split(splitRe)) {
    parts.push({ key: `${offset}-${value}`, value });
    offset += value.length;
  }

  return (
    <>
      {parts.map(({ key, value }) =>
        testRe.test(value) ? (
          <mark key={key} className="rounded-xs bg-primary/20 px-0.5 font-semibold text-primary">
            {value}
          </mark>
        ) : (
          <span key={key}>{value}</span>
        ),
      )}
    </>
  );
}

// ── kbd shortcut chip ─────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">{children}</kbd>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SiteSearch({
  projectId,
  open,
  onOpenChange,
  lang,
  version,
  placeholder,
  hotkey,
  maxResults,
  versions = [],
  versionFilterEnabled = true,
  popularSearches,
  direction = 'ltr',
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang?: string;
  version?: string;
  placeholder?: string;
  hotkey?: 'cmdk' | 'slash';
  maxResults?: number;
  versions?: Array<{ id: string; name: string; slug: string; isDefault: boolean }>;
  versionFilterEnabled?: boolean;
  popularSearches?: Array<string | { label: string; icon?: string }> | null;
  direction?: 'ltr' | 'rtl';
}) {
  const { track } = useSiteAnalytics();
  const t = siteT(lang);

  const [query, setQuery] = useState('');
  const [selectedVersion, setSelectedVersion] = useState(version);
  const inputRef = useRef<HTMLInputElement>(null);

  const activePopularSearches = useMemo(() => {
    if (!popularSearches?.length) return [];
    return popularSearches
      .map((item) => (typeof item === 'string' ? { label: item, icon: undefined } : item))
      .filter((item) => Boolean(item?.label?.trim()));
  }, [popularSearches]);

  const versionOptions = useMemo(() => versions.map((v) => ({ value: v.isDefault ? '__default' : v.slug, label: v.name })), [versions]);

  const [debouncedQuery] = useDebouncedValue(query, { wait: 180 });
  const hitsQuery = useSiteSearch(projectId, debouncedQuery.trim(), undefined, selectedVersion, maxResults, open);
  const hits = useMemo(() => hitsQuery.data ?? [], [hitsQuery.data]);

  useEffect(() => {
    if (open) {
      setSelectedVersion(version);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open, version]);

  useEffect(() => {
    const isInput = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) || node.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (hotkey === 'slash' && e.key === '/' && !e.metaKey && !e.ctrlKey && !isInput(e.target)) {
        e.preventDefault();
        onOpenChange(true);
        return;
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, hotkey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(88vh,760px)] w-full max-w-2xl overflow-hidden rounded-2xl border border-border/70 bg-background/96 p-0 shadow-2xl backdrop-blur-xl sm:max-w-2xl"
        data-theme-surface="search"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t('searchDocumentation')}</DialogTitle>
        <DialogDescription className="sr-only">{t('searchDescription')}</DialogDescription>

        {/* ── Search bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <div className="flex shrink-0 items-center">
            <Search className="size-4.5 text-muted-foreground/70" />
          </div>

          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] font-normal outline-none placeholder:text-muted-foreground/55"
            placeholder={placeholder?.trim() || t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="flex shrink-0 items-center gap-1.5">
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="grid size-6 place-items-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
                title="Clear"
              >
                <X className="size-3.5" />
              </button>
            ) : null}

            {versionFilterEnabled && versions.length > 1 ? (
              <Select
                items={versionOptions}
                onValueChange={(val) => setSelectedVersion(!val || val === '__default' ? undefined : val)}
                value={selectedVersion ?? '__default'}
              >
                <SelectTrigger aria-label={t('searchFilterVersion')} className="h-7 border-border/70 bg-background/70 text-xs sm:w-28">
                  <SelectValue placeholder={t('searchFilterVersion')} />
                </SelectTrigger>
                <SelectContent>
                  {versionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <div className="max-h-[58vh] overflow-y-auto">
          {!query.trim() ? (
            activePopularSearches.length > 0 ? (
              <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 px-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <TrendingUp className="size-3.5 text-primary" />
                    <span>{t('popularTopics')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activePopularSearches.map((topic) => (
                      <button
                        key={topic.label}
                        type="button"
                        onClick={() => {
                          setQuery(topic.label);
                          inputRef.current?.focus();
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/70 bg-muted/25 px-2.5 py-1 text-xs font-medium text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        {topic.icon && hasIcon(topic.icon) ? (
                          <PageIcon name={topic.icon} className="size-3" />
                        ) : (
                          <Search className="size-3 text-muted-foreground/60" />
                        )}
                        <span>{topic.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <div className="mb-3 grid size-10 place-items-center rounded-full bg-muted/60 text-muted-foreground/70">
                  <Search className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">{t('searchDocumentation')}</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t('searchPrompt')}</p>
              </div>
            )
          ) : (
            <Command shouldFilter={false} className="max-h-full">
              <CommandList className="max-h-full space-y-1 p-2">
                {hitsQuery.isFetching && hits.length === 0 ? (
                  <div className="flex items-center justify-center gap-2.5 py-8 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    {t('searching')}
                  </div>
                ) : null}

                {hits.length > 0 ? (
                  <CommandGroup
                    heading={
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>{t('results')}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{hits.length}</span>
                      </div>
                    }
                  >
                    {hits.map((hit: SiteSearchHit, index: number) => (
                      <CommandItem
                        key={hit.id}
                        value={`${hit.title} ${hit.snippet ?? ''} ${hit.path} ${query} ${hit.id}`}
                        onSelect={() => {
                          track({
                            name: 'search_result_clicked',
                            path: hit.path,
                            resultId: hit.id,
                            resultPosition: index + 1,
                            language: hit.language,
                          });
                          onOpenChange(false);
                          window.location.href = siteHref(projectId, hit.path, { lang: hit.language, version: selectedVersion });
                        }}
                        className="group flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors aria-selected:bg-muted/70 hover:bg-muted/60"
                      >
                        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background text-muted-foreground transition-all group-hover:border-primary/40 group-hover:text-primary">
                          {hasIcon(hit.icon) ? <PageIcon name={hit.icon} className="size-4" /> : <FileText className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1" dir="auto" lang={hit.language}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              <Highlight text={hit.title} query={debouncedQuery} />
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {hit.path.startsWith('/') ? hit.path : `/${hit.path}`}
                            </span>
                          </div>
                          {hit.snippet ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              <Highlight text={hit.snippet} query={debouncedQuery} />
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/35 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : !hitsQuery.isFetching && query.trim() ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground">{t('searchEmpty')}</p>
                  </div>
                ) : null}
              </CommandList>
            </Command>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> select
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[10.5px]">
            <Search className="size-3 text-muted-foreground" />
            {t('search')}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
