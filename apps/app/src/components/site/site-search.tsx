import { hasIcon, PageIcon } from '@/components/site/page-icon';
import { useAnswerSite, useSiteSearch } from '@/hooks/api/site-search';
import type { SiteSearchHit } from '@/hooks/api/types';
import { siteHref } from '@/lib/site-paths';
import { useSiteAnalytics } from '@/providers/site-analytics-provider';
import { Button } from '@cms/design-system/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@cms/design-system/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@cms/design-system/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { cn } from '@cms/design-system/lib/utils';
import { siteT } from '@cms/i18n/site';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, Copy, CornerDownLeft, FileText, Loader2, Search, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Fallback data (used when project has no custom config) ───────────────────

const FALLBACK_AI_QUESTIONS: Array<{ question: string; category?: string; icon?: string }> = [
  { question: 'What is this documentation about?', category: 'Overview & Introduction', icon: 'book-open' },
  { question: 'How do I get started?', category: 'Quickstart & Setup', icon: 'rocket' },
  { question: 'What are the core features and guides?', category: 'Architecture & Capabilities', icon: 'layers' },
  { question: 'Where can I find API endpoints?', category: 'Developer Reference', icon: 'code' },
];

// ── Question card accent colours (index-based) ────────────────────────────────

const Q_COLORS = [
  { border: 'border-s-violet-500/60', icon: 'bg-violet-500/10 text-violet-500', active: 'hover:border-s-violet-500' },
  { border: 'border-s-blue-500/60', icon: 'bg-blue-500/10 text-blue-500', active: 'hover:border-s-blue-500' },
  { border: 'border-s-emerald-500/60', icon: 'bg-emerald-500/10 text-emerald-500', active: 'hover:border-s-emerald-500' },
  { border: 'border-s-amber-500/60', icon: 'bg-amber-500/10 text-amber-500', active: 'hover:border-s-amber-500' },
  { border: 'border-s-rose-500/60', icon: 'bg-rose-500/10 text-rose-500', active: 'hover:border-s-rose-500' },
  { border: 'border-s-cyan-500/60', icon: 'bg-cyan-500/10 text-cyan-500', active: 'hover:border-s-cyan-500' },
] as const;

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
  aiAnswers = true,
  suggestedQuestions,
  popularSearches,
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
  aiAnswers?: boolean;
  suggestedQuestions?: Array<{ question: string; category?: string; icon?: string }> | null;
  popularSearches?: Array<string | { label: string; icon?: string }> | null;
}) {
  const { track } = useSiteAnalytics();
  const t = siteT(lang);
  const arabic = lang?.toLowerCase().startsWith('ar') ?? false;

  // ── Local state ─────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(version);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const activeQuestions = useMemo(() => (suggestedQuestions?.length ? suggestedQuestions.slice(0, 8) : FALLBACK_AI_QUESTIONS), [suggestedQuestions]);
  const versionOptions = useMemo(() => versions.map((v) => ({ value: v.isDefault ? '__default' : v.slug, label: v.name })), [versions]);

  // ── Search query (debounced) ─────────────────────────────────────────────────
  const [debouncedQuery] = useDebouncedValue(query, { wait: 180 });
  const hitsQuery = useSiteSearch(projectId, debouncedQuery.trim(), undefined, selectedVersion, maxResults, open && !showAnswer);
  const hits = useMemo(() => hitsQuery.data ?? [], [hitsQuery.data]);

  // ── AI answer mutation ───────────────────────────────────────────────────────
  const answerMutation = useAnswerSite();
  const answer = answerMutation.isPending ? null : (answerMutation.data ?? null);
  const answerError = !answerMutation.isPending && answerMutation.error ? t('answerFailed') : null;
  const citations = useMemo(() => (!answer ? [] : ((answer as any).citations ?? (answer as any).sources ?? [])), [answer]);

  // ── Ask AI ───────────────────────────────────────────────────────────────────
  const askWithQuery = useCallback(
    (customQuery?: string) => {
      const q = (customQuery ?? query).trim();
      if (q.length < 2 || answerMutation.isPending) return;
      if (customQuery) setQuery(customQuery);
      setShowAnswer(true);
      answerMutation.mutate({
        projectId,
        query: q,
        ...(lang ? { language: lang } : {}),
        ...(selectedVersion ? { version: selectedVersion } : {}),
      });
    },
    [answerMutation, lang, projectId, query, selectedVersion],
  );

  const backToSearch = () => {
    setShowAnswer(false);
    answerMutation.reset();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const copyAnswer = () => {
    if (!answer?.answer) return;
    navigator.clipboard.writeText(answer.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Reset on close ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setSelectedVersion(version);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setShowAnswer(false);
      answerMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
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

  // ── Input key handling ───────────────────────────────────────────────────────
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (aiAnswers && (e.metaKey || e.ctrlKey || showAnswer || hits.length === 0)) {
        e.preventDefault();
        askWithQuery();
      }
    } else if (e.key === 'Escape' && showAnswer) {
      e.preventDefault();
      backToSearch();
    }
  };

  // ── Derived view booleans ────────────────────────────────────────────────────
  const hasQuery = query.trim().length >= 2;
  const isAnswering = answerMutation.isPending;
  const hasAnswer = !!answer;
  const hasError = !!answerError;

  // ─────────────────────────────────────────────────────────────────────────────

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
          {/* Leading icon */}
          <div className="flex shrink-0 items-center">
            {isAnswering ? (
              <Loader2 className="size-4.5 animate-spin text-primary" />
            ) : showAnswer ? (
              <Sparkles className="size-4.5 text-primary" />
            ) : (
              <Search className="size-4.5 text-muted-foreground/70" />
            )}
          </div>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] font-normal outline-none placeholder:text-muted-foreground/55"
            placeholder={showAnswer ? t('searchPrompt') || 'Ask a follow-up question…' : placeholder?.trim() || t('searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Typing while showing an answer switches back to search
              if (showAnswer && !isAnswering) backToSearch();
            }}
            onKeyDown={onInputKeyDown}
          />

          {/* Right controls */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Clear */}
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  if (showAnswer) backToSearch();
                  inputRef.current?.focus();
                }}
                className="grid size-6 place-items-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
                title="Clear"
              >
                <X className="size-3.5" />
              </button>
            ) : null}

            {/* Version filter */}
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

            {/* Ask AI — only visible when AI is enabled; only active when query exists */}
            {aiAnswers ? (
              <button
                type="button"
                onClick={() => (hasQuery ? askWithQuery() : inputRef.current?.focus())}
                disabled={isAnswering}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all select-none',
                  hasQuery
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                    : 'border border-border/70 bg-muted/50 text-muted-foreground/60 cursor-default',
                )}
                title={hasQuery ? `${t('askAi')} (Enter)` : t('searchPrompt')}
              >
                <Sparkles className={cn('size-3.5', hasQuery ? 'text-primary-foreground' : 'text-primary/50')} />
                {t('askAi')}
                {hasQuery ? (
                  <kbd className="ms-0.5 rounded bg-primary-foreground/20 px-1 py-px font-mono text-[9.5px] text-primary-foreground">↵</kbd>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        {showAnswer ? (
          // ── AI Answer panel ──────────────────────────────────────────────────
          <div className="max-h-[58vh] overflow-y-auto p-4 sm:p-5" dir={arabic ? 'rtl' : 'ltr'}>
            {/* Topbar: back + badge + copy */}
            <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={backToSearch}
                className="-ms-2 h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
                {t('backToSearch')}
              </Button>

              <div className="flex items-center gap-2">
                {isAnswering || hasAnswer || hasError ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-primary ring-1 ring-primary/20">
                    <Sparkles className="size-3" />
                    {t('askAi')}
                  </span>
                ) : null}
                {hasAnswer ? (
                  <button
                    type="button"
                    onClick={copyAnswer}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 text-emerald-500" />
                        {t('copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        {t('copyCode')}
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Question recap */}
            {query ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3.5 py-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm italic text-muted-foreground">&ldquo;{query}&rdquo;</p>
              </div>
            ) : null}

            {/* Loading */}
            {isAnswering ? (
              <div className="space-y-3.5 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  {t('synthesizing')}
                </div>
                <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-muted/70" />
                  <div className="h-3.5 w-full animate-pulse rounded-full bg-muted/55" />
                  <div className="h-3.5 w-5/6 animate-pulse rounded-full bg-muted/70" />
                  <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-muted/55" />
                </div>
              </div>
            ) : null}

            {/* Error */}
            {hasError ? (
              <div
                className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">{answerError}</p>
                  <p className="mt-1 text-destructive/70">{t('connectionError')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => askWithQuery()}
                    className="mt-3 h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                  >
                    {t('retry')}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Answer */}
            {hasAnswer ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" dir={arabic ? 'rtl' : 'ltr'}>
                    {answer!.answer}
                  </div>
                </div>

                {citations.length > 0 ? (
                  <div className="space-y-2.5 border-t border-border/50 pt-4">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <BookOpen className="size-3.5" />
                      {t('sources')} ({citations.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {citations.map((citation: any, idx: number) => (
                        <a
                          key={citation.id ?? idx}
                          className="group block rounded-xl border border-border/70 bg-card p-3 text-start transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-xs"
                          href={siteHref(projectId, citation.path, { lang, version: selectedVersion })}
                          dir={citation.direction}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                              {citation.title || 'Document'}
                            </span>
                            <ChevronRight className="size-3 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          </div>
                          {citation.path ? (
                            <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                              {citation.path.startsWith('/') ? citation.path : `/${citation.path}`}
                            </span>
                          ) : null}
                          {citation.snippet ? (
                            <p className="mt-1 line-clamp-2 text-[11.5px] leading-normal text-muted-foreground">{citation.snippet}</p>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Idle answer state — shouldn't normally be visible but guards blank screen */}
            {!isAnswering && !hasAnswer && !hasError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="grid size-12 place-items-center rounded-xl bg-primary/10">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">{t('readyToAnswer')}</p>
                <p className="text-xs text-muted-foreground">{t('readyToAnswerHint')}</p>
              </div>
            ) : null}
          </div>
        ) : (
          // ── Search panel ─────────────────────────────────────────────────────
          <div className="max-h-[58vh] overflow-y-auto">
            {!query.trim() ? (
              aiAnswers && activeQuestions.length > 0 ? (
                // Empty state — Popular Questions (instant AI answer)
                <div className="p-4 sm:p-5">
                  <div className="mb-3.5 flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="flex size-5 items-center justify-center rounded-md bg-primary/10">
                        <Sparkles className="size-3 text-primary" />
                      </div>
                      {t('popularQuestions')}
                    </div>
                    <span className="text-[11px] text-muted-foreground/60">{t('clickInstantAnswer')}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {activeQuestions.map((item, idx) => {
                      const c = Q_COLORS[idx % Q_COLORS.length]!;
                      const hasCustomIcon = item.icon && hasIcon(item.icon);
                      return (
                        <button
                          key={`${item.question}-${idx}`}
                          type="button"
                          onClick={() => askWithQuery(item.question)}
                          className={cn(
                            'group flex cursor-pointer items-start gap-3 rounded-xl border border-s-2 bg-muted/20 p-3 text-start transition-all duration-150 hover:bg-muted/40 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                            c.border,
                            c.active,
                          )}
                        >
                          <div
                            className={cn(
                              'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105',
                              c.icon,
                            )}
                          >
                            {hasCustomIcon ? <PageIcon name={item.icon!} className="size-3.5" /> : <Sparkles className="size-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                              {item.question}
                            </span>
                            {item.category ? (
                              <span className="mt-1 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground/75">
                                <span className="opacity-50">#</span>
                                {item.category}
                              </span>
                            ) : null}
                          </div>
                          <CornerDownLeft className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 group-hover:text-primary" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Clean empty state when AI search is disabled or no questions configured
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <div className="mb-3 grid size-10 place-items-center rounded-full bg-muted/60 text-muted-foreground/70">
                    <Search className="size-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{t('searchDocumentation')}</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t('searchPrompt')}</p>
                </div>
              )
            ) : (
              // Search results
              <Command shouldFilter={false} className="max-h-full">
                <CommandList className="max-h-full space-y-1 p-2">
                  {/* Ask AI action row */}
                  {aiAnswers ? (
                    <CommandGroup>
                      <CommandItem
                        value={`ask-ai-action ${query}`}
                        onSelect={() => askWithQuery(query)}
                        className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/8 to-primary/4 p-3 transition-all hover:border-primary/40 hover:from-primary/12 hover:to-primary/6 hover:shadow-xs aria-selected:from-primary/15 aria-selected:to-primary/8"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
                            <Sparkles className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-primary">{t('askAi')}</span>
                              <span className="truncate text-xs text-foreground">&ldquo;{query}&rdquo;</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{t('groundedAnswerBody')}</span>
                          </div>
                        </div>
                        <kbd className="hidden shrink-0 items-center rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary sm:inline-flex">
                          ↵ {t('askAi')}
                        </kbd>
                      </CommandItem>
                    </CommandGroup>
                  ) : null}

                  {/* Loading spinner */}
                  {hitsQuery.isFetching && hits.length === 0 ? (
                    <div className="flex items-center justify-center gap-2.5 py-8 text-xs text-muted-foreground">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      {t('searching')}
                    </div>
                  ) : null}

                  {/* Results */}
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
                      {aiAnswers ? <p className="mt-1.5 text-xs text-muted-foreground/65">{t('readyToAnswerHint')}</p> : null}
                    </div>
                  ) : null}
                </CommandList>
              </Command>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> select{aiAnswers ? ' / ask' : ''}
            </span>
            {aiAnswers ? (
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Kbd>⌘↵</Kbd> ask AI
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[10.5px]">
            {aiAnswers ? (
              <>
                <Sparkles className="size-3 text-primary" />
                {t('hybridSearch')}
              </>
            ) : (
              <>
                <Search className="size-3 text-muted-foreground" />
                {t('search')}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
