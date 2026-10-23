import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cms/design-system/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { useT } from '@cms/i18n/react';
import type { AnalyticsRange, Deployment } from '@cms/sdk';
import {
  useDeployments,
  useDomains,
  useLanguages,
  usePages,
  useProject,
  useProjectAnalytics,
  useProjectMembers,
  usePublishAnyway,
} from '@cms/sdk/react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  Languages,
  Link2Off,
  Loader2,
  PenLine,
  Rocket,
  ShieldCheck,
  SpellCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { env } from '@/env';
import { ViewsAreaChart } from '@/features/analytics';
import { deploymentStatusLabel, deploymentStatusVariant } from '@/shared/lib/deployment-status';
import { useFormatters, viewsTrend } from '@/shared/lib/format';

export interface ProjectOverviewPageProps {
  projectId: string;
}

const siteBaseDomain = () => env.VITE_SITE_BASE_DOMAIN?.replace(/^\*\./, '').replace(/\.$/, '') || undefined;
const siteUrl = (domain: string | null, projectId: string) => (domain ? `https://${domain}` : `/sites/${projectId}`);

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const { date, number, percent } = useFormatters();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data: project } = useProject(projectId);
  const { data: pages } = usePages(projectId);
  const { data: languages } = useLanguages(projectId);
  const { data: members } = useProjectMembers(projectId);
  const { data: deployments } = useDeployments(projectId);
  const { data: domains } = useDomains(projectId);
  const { data: analytics, isPending: analyticsPending } = useProjectAnalytics(projectId, range);

  const pagesList = pages ?? [];
  const pageCount = pagesList.filter((page) => page.kind === 'PAGE').length;
  const groupCount = pagesList.filter((page) => page.kind === 'GROUP').length;
  const draftCount = pagesList.filter((page) => page.hidden).length;
  const memberCount = members?.members.length ?? 0;
  const deployCount = (deployments ?? []).length;
  const latestDeployment = deployments?.[0];
  const hasReadyDeployment = (deployments ?? []).some((deployment) => deployment.status === 'READY');
  const publishFailed = latestDeployment?.status === 'FAILED';
  const primaryDomain = domains?.find((domain) => domain.isPrimary && domain.verified) ?? domains?.find((domain) => domain.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (project && baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, projectId);
  const trend = useMemo(() => viewsTrend(analytics?.timeseries ?? []), [analytics?.timeseries]);

  const defaultLang = languages?.find((l) => l.isDefault);
  const defaultPages = useMemo(
    () => pagesList.filter((p) => p.kind === 'PAGE' && (!p.languageId || (defaultLang && p.languageId === defaultLang.id))),
    [pagesList, defaultLang],
  );

  const activeLanguages = languages ?? [];
  const secondaryLanguages = activeLanguages.filter((l) => !l.isDefault);

  const translationStats = useMemo(() => {
    const totalDefault = defaultPages.length || 1;
    if (secondaryLanguages.length === 0) {
      return { overallPercent: 100, details: [] };
    }
    const details = secondaryLanguages.map((lang) => {
      const localizedCount = pagesList.filter((p) => p.kind === 'PAGE' && p.languageId === lang.id).length;
      const pct = Math.min(100, Math.round((localizedCount / totalDefault) * 100));
      return { lang, count: localizedCount, target: defaultPages.length, percent: pct };
    });
    const totalLocalized = details.reduce((acc, d) => acc + d.count, 0);
    const overallPercent = Math.min(100, Math.round((totalLocalized / (defaultPages.length * secondaryLanguages.length || 1)) * 100));
    return { overallPercent, details };
  }, [defaultPages.length, pagesList, secondaryLanguages]);

  const issues = useMemo(() => (latestDeployment ? publishIssuesOf(latestDeployment) : []), [latestDeployment]);
  const brokenLinksCount = issues.filter((i) => i.type === 'broken-link').length;
  const grammarCount = issues.filter((i) => i.type === 'grammar').length;

  const recentPages = useMemo(
    () =>
      pagesList
        .filter((p) => p.kind === 'PAGE')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [pagesList],
  );

  const copyLiveUrl = () => {
    const url = liveHref.startsWith('http') ? liveHref : `${window.location.origin}${liveHref}`;
    void navigator.clipboard.writeText(url);
    toast.success('Live URL copied to clipboard');
  };

  return (
    <div className="w-full px-6 py-8 xl:px-10 min-h-full flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-semibold text-2xl tracking-tight">{project?.name ?? t('overview.title')}</h1>
            {hasReadyDeployment ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">{t('overview.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            nativeButton={false}
            render={<Link params={{ projectId }} to="/app/projects/$projectId/editor" />}
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
          >
            <PenLine className="size-3.5" /> {t('overview.openEditor')}
          </Button>
        </div>
      </div>

      {/* Publish-failure triage */}
      {publishFailed && latestDeployment ? <PublishFailureCard projectId={projectId} deployment={latestDeployment} pages={pages ?? []} /> : null}

      {/* First-publish nudge */}
      {deployments && !hasReadyDeployment && !publishFailed ? <PublishNudge projectId={projectId} /> : null}

      {/* High-Density 5 KPI Strip */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <OverviewMetricCard
          label="Total Content"
          value={number(pageCount)}
          subtitle={`${groupCount} sections · ${draftCount} drafts`}
          icon={<FileText className="size-4 text-primary" />}
        />
        <OverviewMetricCard
          label="Translation Coverage"
          value={`${translationStats.overallPercent}%`}
          subtitle={`${activeLanguages.length} active ${activeLanguages.length === 1 ? 'locale' : 'locales'}`}
          icon={<Languages className="size-4 text-indigo-500" />}
        />
        <OverviewMetricCard
          label="Content Health"
          value={issues.length === 0 ? '100% Healthy' : `${issues.length} Issues`}
          subtitle={issues.length === 0 ? 'Zero broken links' : `${brokenLinksCount} broken links`}
          status={issues.length === 0 ? 'success' : 'warning'}
          icon={issues.length === 0 ? <ShieldCheck className="size-4 text-emerald-500" /> : <TriangleAlert className="size-4 text-amber-500" />}
        />
        <OverviewMetricCard
          label="Deployments & Team"
          value={`${deployCount} Deploys`}
          subtitle={`${memberCount} active ${memberCount === 1 ? 'member' : 'members'}`}
          icon={<Rocket className="size-4 text-sky-500" />}
        />
        <OverviewMetricCard
          label={t('overview.stats.pageviews')}
          value={analyticsPending ? '...' : number(analytics?.totalViews ?? 0)}
          subtitle={trend ? `${trend.pct > 0 ? '+' : ''}${percent(trend.pct)} vs last period` : 'Last 30 days'}
          icon={<BarChart3 className="size-4 text-emerald-500" />}
        />
      </div>

      {/* Content Health & Translation Completeness Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Translation Progress Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Translation Progress</CardTitle>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">
                {translationStats.overallPercent}% Translated
              </Badge>
            </div>
            <CardDescription className="text-xs">Localization coverage across registered project locales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                {activeLanguages.find((l) => l.isDefault)?.label ?? 'English'} (Default Source)
              </span>
              <span className="text-muted-foreground font-mono">{defaultPages.length} pages (100%)</span>
            </div>
            {translationStats.details.map((detail) => (
              <div key={detail.lang.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{detail.lang.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {detail.count}/{detail.target} pages ({detail.percent}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${detail.percent}%` }} />
                </div>
              </div>
            ))}
            {secondaryLanguages.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                Single default language configured. Add additional languages in{' '}
                <Link
                  to="/app/projects/$projectId/settings"
                  params={{ projectId }}
                  search={{ section: 'languages' }}
                  className="text-primary hover:underline"
                >
                  Project Settings
                </Link>{' '}
                to track multi-locale parity.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Content Health & Verification Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Content Health & Quality</CardTitle>
              </div>
              <Badge variant={issues.length === 0 ? 'outline' : 'destructive'} className="text-xs">
                {issues.length === 0 ? 'Verified' : `${issues.length} Attention Required`}
              </Badge>
            </div>
            <CardDescription className="text-xs">Automated link validation and publication diagnostics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {issues.length === 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-medium">All Document Links Validated</div>
                  <p className="text-muted-foreground text-[11px]">No broken links or syntax exceptions detected in the latest build pipeline.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.slice(0, 3).map((issue) => (
                  <div
                    key={`${issue.type}-${issue.pagePath}-${issue.detail}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs"
                  >
                    <span className="truncate font-medium">{issue.pageTitle || issue.pagePath}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 border-destructive/40 text-destructive">
                      {issue.type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60 text-xs text-muted-foreground">
              <div>
                Draft Pages: <span className="font-semibold text-foreground">{draftCount}</span>
              </div>
              <div>
                Grammar Issues: <span className="font-semibold text-foreground">{grammarCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic chart */}
      <ViewsAreaChart
        title={t('overview.viewsTitle')}
        description={t('overview.viewsDesc')}
        data={analytics?.timeseries ?? []}
        range={range}
        onRangeChange={setRange}
        loading={analyticsPending}
      />

      {/* Operational Hub: Recent Document Updates + Quick Deployment Actions */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Recent pages */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-border border-b px-5 py-3.5">
            <div>
              <h2 className="font-semibold text-sm">{t('overview.recentPages')}</h2>
              <p className="text-xs text-muted-foreground">Recently updated document pages</p>
            </div>
            <Link
              className="flex items-center gap-1 text-primary text-xs hover:underline font-medium"
              params={{ projectId }}
              to="/app/projects/$projectId/editor"
            >
              {t('overview.openEditor')} <ArrowRight className="size-3 rtl:-scale-x-100" />
            </Link>
          </div>
          {recentPages.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground text-sm">{t('overview.noPages')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('overview.col.page')}</TableHead>
                  <TableHead className="text-end text-xs">{t('overview.col.updated')}</TableHead>
                  <TableHead className="w-16 text-end text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPages.map((page) => (
                  <TableRow
                    key={page.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      void navigate({
                        to: '/app/projects/$projectId/editor',
                        params: { projectId },
                        search: { page: page.id },
                      })
                    }
                  >
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <span className="truncate font-medium text-xs block">{page.config?.sidebarTitle?.trim() || page.title}</span>
                          <span className="text-[11px] font-mono text-muted-foreground block truncate">/{page.path}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground text-xs py-2.5">{date(page.updatedAt)}</TableCell>
                    <TableCell className="text-end py-2.5">
                      <Button variant="ghost" size="xs" className="h-6 text-[11px] px-1.5 text-primary">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Right Column: Live Site + Deployment Hub + Quick Links */}
        <div className="flex flex-col gap-4">
          {/* Live site card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs tracking-tight text-muted-foreground uppercase flex items-center gap-1.5">
                <Globe2 className="size-3.5 text-primary" /> Live Site
              </span>
              <Button variant="ghost" size="xs" onClick={copyLiveUrl} className="h-6 gap-1 text-[11px] text-muted-foreground">
                <Copy className="size-3" /> Copy URL
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 p-2.5 text-xs">
              <a className="truncate font-mono text-primary text-xs hover:underline" href={liveHref} target="_blank" rel="noreferrer">
                {liveDomain ?? liveHref}
              </a>
              <a href={liveHref} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          {/* Deployment Activity Card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-xs tracking-tight text-muted-foreground uppercase flex items-center gap-1.5">
                <Rocket className="size-3.5 text-sky-500" /> Recent Deployment
              </h2>
              {latestDeployment ? (
                <Badge variant={deploymentStatusVariant(latestDeployment.status)} className="text-[11px]">
                  {deploymentStatusLabel(latestDeployment.status, t)}
                </Badge>
              ) : null}
            </div>
            {latestDeployment ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">v{latestDeployment.version}</span>
                  <span className="text-[11px]">{date(latestDeployment.completedAt ?? latestDeployment.createdAt)}</span>
                </div>
                <p className="text-muted-foreground truncate">{latestDeployment.commitMessage || t('overview.activity.publish')}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">{t('overview.activity.empty')}</p>
            )}
            <Button
              nativeButton={false}
              render={<Link params={{ projectId }} to="/app/projects/$projectId/editor" search={{ publish: true }} />}
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs font-normal"
            >
              <Rocket className="size-3.5" /> Publish New Version
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewMetricCard({
  label,
  value,
  subtitle,
  icon,
  status,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  status?: 'success' | 'warning' | 'normal';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2">
        <div className="text-xl font-semibold tracking-tight tabular-nums">{value}</div>
        {subtitle && (
          <div
            className={`mt-1 text-[11px] truncate ${
              status === 'success'
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : 'text-muted-foreground'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

const publishIssuesOf = (deployment: Deployment) => {
  const details = (deployment as Deployment & { errorDetails?: unknown }).errorDetails;
  if (!Array.isArray(details)) {
    return [];
  }
  return details.flatMap((issue) => {
    const parsed = z
      .object({
        type: z.enum(['broken-link', 'grammar']),
        pageTitle: z.string(),
        pagePath: z.string(),
        detail: z.string(),
      })
      .safeParse(issue);
    return parsed.success ? [parsed.data] : [];
  });
};

function PublishFailureCard({
  projectId,
  deployment,
  pages,
}: {
  projectId: string;
  deployment: Deployment;
  pages: Array<{ id: string; path: string }>;
}) {
  const t = useT();
  const issues = publishIssuesOf(deployment);
  const grammarOnly = issues.length > 0 && issues.every((issue) => issue.type === 'grammar');

  const publishAnyway = usePublishAnyway(projectId);
  const publishAnywayWithFeedback = () => {
    publishAnyway.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('overview.publishFailed.queued'));
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : t('overview.publishFailed.error')),
    });
  };

  const pageIdFor = (issuePath: string): string | undefined => {
    const clean = issuePath.replace(/^\/+/, '');
    return pages.find((page) => page.path === clean)?.id;
  };

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <TriangleAlert className="size-4" />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <div className="font-semibold text-sm">{t('overview.publishFailed.title', { version: deployment.version })}</div>
          <p className="mt-0.5 text-muted-foreground text-sm">
            {grammarOnly ? t('overview.publishFailed.grammarOnly') : t('overview.publishFailed.body')}
          </p>
        </div>
        {grammarOnly ? (
          <Button size="sm" disabled={publishAnyway.isPending} onClick={publishAnywayWithFeedback}>
            {publishAnyway.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
            {publishAnyway.isPending ? t('overview.publishFailed.publishing') : t('overview.publishFailed.publishAnyway')}
          </Button>
        ) : null}
      </div>
      {issues.length > 0 ? (
        <ul className="divide-y divide-border border-border border-t">
          {issues.map((issue) => {
            const pageId = pageIdFor(issue.pagePath);
            return (
              <li key={`${issue.type}-${issue.pagePath}-${issue.detail}`} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {issue.type === 'broken-link' ? <Link2Off className="size-3.5" /> : <SpellCheck className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1 leading-snug">
                  {pageId ? (
                    <Link
                      className="font-medium hover:underline"
                      to="/app/projects/$projectId/editor"
                      params={{ projectId }}
                      search={{ page: pageId }}
                    >
                      {issue.pageTitle || issue.pagePath}
                    </Link>
                  ) : (
                    <span className="font-medium">{issue.pageTitle || issue.pagePath}</span>
                  )}
                  <span className="ms-2 text-muted-foreground">{issue.detail}</span>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10.5px] text-muted-foreground uppercase tracking-wide">
                  {issue.type === 'broken-link' ? t('overview.publishFailed.type.brokenLink') : t('overview.publishFailed.type.grammar')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : deployment.error ? (
        <p className="border-border border-t px-5 py-3 text-muted-foreground text-sm">{deployment.error}</p>
      ) : null}
    </div>
  );
}

const nudgeDismissKey = (projectId: string) => `cms.publishNudge.${projectId}`;

function PublishNudge({ projectId }: { projectId: string }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(nudgeDismissKey(projectId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [projectId]);
  if (dismissed) {
    return null;
  }
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(nudgeDismissKey(projectId), '1');
    } catch {
      // ignore storage failures
    }
  };

  return (
    <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('overview.nudge.dismiss')}
        title={t('overview.nudge.dismiss')}
        className="absolute end-3 top-3 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Rocket className="size-4" />
        </span>
        <div className="leading-snug">
          <div className="font-semibold text-sm">{t('overview.nudge.title')}</div>
          <p className="mt-0.5 text-muted-foreground text-sm">{t('overview.nudge.body')}</p>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NudgeStep n={1} title={t('overview.nudge.step1')} desc={t('overview.nudge.step1Desc')}>
          <Link className="absolute inset-0" aria-label={t('overview.nudge.step1')} to="/app/projects/$projectId/editor" params={{ projectId }} />
        </NudgeStep>
        <NudgeStep n={2} title={t('overview.nudge.step2')} desc={t('overview.nudge.step2Desc')}>
          <Link
            className="absolute inset-0"
            aria-label={t('overview.nudge.step2')}
            to="/app/projects/$projectId/editor"
            params={{ projectId }}
            search={{ publish: true }}
          />
        </NudgeStep>
        <NudgeStep n={3} title={t('overview.nudge.step3')} desc={t('overview.nudge.step3Desc')}>
          <Link
            className="absolute inset-0"
            aria-label={t('overview.nudge.step3')}
            to="/app/projects/$projectId/settings"
            params={{ projectId }}
            search={{ section: 'domain' }}
          />
        </NudgeStep>
      </ol>
    </div>
  );
}

function NudgeStep({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <li className="relative flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-muted/40">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-[12px] text-primary">{n}</span>
      <div className="min-w-0 leading-snug">
        <div className="font-medium text-sm">{title}</div>
        <div className="mt-0.5 text-muted-foreground text-xs">{desc}</div>
      </div>
      {children}
    </li>
  );
}
