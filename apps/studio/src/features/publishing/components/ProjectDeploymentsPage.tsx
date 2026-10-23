import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cms/design-system/components/ui/card';
import { useConfirm } from '@cms/design-system/components/ui/confirm';
import { Input } from '@cms/design-system/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { Deployment, DeploymentStatus } from '@cms/sdk';
import { queryKeys, useDeployments, useDomains, usePendingChanges, useProject, usePublishAnyway, useRollback } from '@cms/sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileCode2,
  Globe2,
  Link2Off,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  SpellCheck,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { env } from '@/env';
import { PublishModal } from '@/features/publishing/components/PublishModal';
import { siteHref } from '@/shared';
import { deploymentStatusLabel, deploymentStatusVariant } from '@/shared/lib/deployment-status';
import { useFormatters } from '@/shared/lib/format';

export interface ProjectDeploymentsPageProps {
  projectId: string;
}

const siteBaseDomain = () => env.VITE_SITE_BASE_DOMAIN?.replace(/^\*\./, '').replace(/\.$/, '') || undefined;
const siteUrl = (domain: string | null, projectId: string) => (domain ? `https://${domain}` : `/sites/${projectId}`);

const STEP_KEYS = ['deploy.step.queued', 'deploy.step.building', 'deploy.step.indexing', 'deploy.step.live'] as const;

function activeStep(status: DeploymentStatus | undefined): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'BUILDING':
      return 1;
    case 'READY':
      return STEP_KEYS.length;
    case 'FAILED':
      return 1;
    default:
      return 0;
  }
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

export function ProjectDeploymentsPage({ projectId }: ProjectDeploymentsPageProps) {
  const t = useT();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { date, number } = useFormatters();

  const [filterQuery, setFilterQuery] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);

  const { data: project } = useProject(projectId);
  const { data: domains } = useDomains(projectId);
  const { data: pending, isPending: pendingLoading } = usePendingChanges(projectId);

  const rollback = useRollback(projectId);
  const publishAnyway = usePublishAnyway(projectId);

  // Poll while building/pending
  const { data: deployments, isLoading: deploymentsLoading } = useDeployments(projectId, {
    pollIntervalMs: 1500,
  });

  const latestDeployment = deployments?.[0];
  const isBuilding = latestDeployment?.status === 'PENDING' || latestDeployment?.status === 'BUILDING';
  const publishFailed = latestDeployment?.status === 'FAILED';

  const currentLive = useMemo(() => (deployments ?? []).find((d) => d.status === 'READY'), [deployments]);

  const primaryDomain = domains?.find((d) => d.isPrimary && d.verified) ?? domains?.find((d) => d.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (project && baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, projectId);

  const changesCount = pending?.changes?.length ?? 0;
  const addedCount = pending?.changes?.filter((c) => c.status === 'added').length ?? 0;
  const modifiedCount = pending?.changes?.filter((c) => c.status === 'modified').length ?? 0;
  const removedCount = pending?.changes?.filter((c) => c.status === 'removed').length ?? 0;
  const hasRedirectIssues = (pending?.redirectIssues?.length ?? 0) > 0;

  const copyLiveUrl = () => {
    const url = liveHref.startsWith('http') ? liveHref : `${window.location.origin}${liveHref}`;
    void navigator.clipboard.writeText(url);
    toast.success('Live URL copied to clipboard');
  };

  const handleRollback = async (target: Deployment) => {
    const ok = await confirm({
      title: t('deploy.rollback'),
      description: t('deploy.rollback.confirmDesc', { version: target.version }),
      confirmLabel: t('deploy.rollback'),
      destructive: true,
    });
    if (!ok) return;

    rollback.mutate(target.id, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryKeys.deployments.baseline(projectId) });
        qc.invalidateQueries({ queryKey: queryKeys.deployments.changes(projectId) });
        qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
        toast.success(t('deploy.rollback.success', { version: target.version }));
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : t('deploy.rollback.error'));
      },
    });
  };

  const filteredDeployments = useMemo(() => {
    const list = deployments ?? [];
    if (!filterQuery.trim()) return list;
    const q = filterQuery.toLowerCase();
    return list.filter((d) => d.version.toString().includes(q) || d.commitMessage?.toLowerCase().includes(q) || d.status.toLowerCase().includes(q));
  }, [deployments, filterQuery]);

  const issues = useMemo(() => (latestDeployment ? publishIssuesOf(latestDeployment) : []), [latestDeployment]);
  const grammarOnly = issues.length > 0 && issues.every((issue) => issue.type === 'grammar');

  const stepIndex = activeStep(latestDeployment?.status);

  return (
    <div className="w-full px-6 py-8 xl:px-10 min-h-full flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-semibold text-2xl tracking-tight">Deployments & Publishing</h1>
            {isBuilding ? (
              <Badge variant="secondary" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                <Loader2 className="size-3 animate-spin" /> Building v{latestDeployment?.version}
              </Badge>
            ) : currentLive ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live v{currentLive.version}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Monitor production status, audit version history, review pending changes, and perform rollbacks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            nativeButton={false}
            render={<a href={liveHref} target="_blank" rel="noreferrer" aria-label={t('overview.viewSite')} />}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs font-normal"
          >
            <ExternalLink className="size-3.5" /> View Live Site
          </Button>

          <Button size="sm" disabled={isBuilding} onClick={() => setPublishOpen(true)} className="h-8 gap-1.5 text-xs font-medium shadow-xs">
            <Rocket className="size-3.5" />
            <span>Publish New Version</span>
            {changesCount > 0 ? (
              <span className="rounded bg-primary-foreground/20 px-1 py-0.2 font-mono text-[10px] text-primary-foreground font-semibold">
                {changesCount}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {/* 3 High-Density Status Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Live Site Status Card */}
        <Card>
          <CardHeader className="pb-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Globe2 className="size-3.5 text-primary" /> Live Production
              </span>
              {currentLive ? (
                <span className="font-mono text-xs text-muted-foreground">v{currentLive.version}</span>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  No Release
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 p-2 text-xs">
              <a className="truncate font-mono text-primary text-xs hover:underline" href={liveHref} target="_blank" rel="noreferrer">
                {liveDomain ?? liveHref}
              </a>
              <Button variant="ghost" size="xs" onClick={copyLiveUrl} className="h-6 gap-1 text-[11px] text-muted-foreground shrink-0">
                <Copy className="size-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last Published:</span>
              <span className="font-medium text-foreground">{currentLive ? date(currentLive.completedAt ?? currentLive.createdAt) : 'Never'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Pending Changes Card */}
        <Card>
          <CardHeader className="pb-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <FileCode2 className="size-3.5 text-indigo-500" /> Pending Changes
              </span>
              <Badge variant={changesCount > 0 ? 'secondary' : 'outline'} className="text-[11px] font-mono">
                {pendingLoading ? 'Checking...' : `${changesCount} unreleased`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                  <Plus className="size-3" /> {addedCount}
                </span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                  <Pencil className="size-3" /> {modifiedCount}
                </span>
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-mono text-[11px]">
                  <Minus className="size-3" /> {removedCount}
                </span>
              </div>
              <Button
                variant="outline"
                size="xs"
                disabled={changesCount === 0 || isBuilding}
                onClick={() => setPublishOpen(true)}
                className="h-6 text-[11px]"
              >
                Review Diff
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Preflight Health:</span>
              {hasRedirectIssues ? (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <TriangleAlert className="size-3" /> Issues Blocked
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="size-3.5" /> Healthy
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Build Telemetry Card */}
        <Card>
          <CardHeader className="pb-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Clock className="size-3.5 text-sky-500" /> Deployment Telemetry
              </span>
              <span className="font-mono text-xs text-muted-foreground">{number((deployments ?? []).length)} total</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Successful Releases:</span>
              <span className="font-mono font-medium text-foreground">{(deployments ?? []).filter((d) => d.status === 'READY').length}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
              <span>Failed Builds:</span>
              <span className="font-mono font-medium text-foreground">{(deployments ?? []).filter((d) => d.status === 'FAILED').length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embedded Active Pipeline Banner (If Building/Pending) */}
      {isBuilding && latestDeployment ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Loader2 className="size-4 animate-spin text-amber-600 dark:text-amber-400" />
                <CardTitle className="text-sm font-semibold">Deployment in Progress — Version {latestDeployment.version}</CardTitle>
              </div>
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                {siteHref(projectId)}
              </span>
            </div>
            <CardDescription className="text-xs">Live build pipeline is actively compiling and indexing site assets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {STEP_KEYS.map((key, i) => {
                const isStepDone = i < stepIndex;
                const isStepActive = i === stepIndex;
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors',
                      isStepDone && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium',
                      isStepActive && 'border-primary/40 bg-primary/10 text-primary font-medium animate-pulse',
                      !isStepDone && !isStepActive && 'border-border/60 bg-muted/30 text-muted-foreground',
                    )}
                  >
                    {isStepDone ? (
                      <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : isStepActive ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/40 ms-1 shrink-0" />
                    )}
                    <span className="truncate">{t(key)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Failure Diagnostics Banner (If Failed) */}
      {publishFailed && latestDeployment ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlert className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <div className="font-semibold text-sm">Deployment Failed for Version {latestDeployment.version}</div>
              <p className="mt-0.5 text-muted-foreground text-sm">
                {grammarOnly
                  ? 'Build halted due to content grammar check exceptions.'
                  : latestDeployment.error || 'The build pipeline encountered an error during indexing.'}
              </p>
            </div>
            {grammarOnly ? (
              <Button
                size="sm"
                disabled={publishAnyway.isPending}
                onClick={() =>
                  publishAnyway.mutate(undefined, {
                    onSuccess: () => toast.success(t('overview.publishFailed.queued')),
                    onError: (err) => toast.error(err instanceof Error ? err.message : t('overview.publishFailed.error')),
                  })
                }
              >
                {publishAnyway.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
                Publish Anyway
              </Button>
            ) : null}
          </div>

          {issues.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-border border-t pt-2">
              {issues.map((issue) => (
                <li key={`${issue.type}-${issue.pagePath}-${issue.detail}`} className="flex items-start gap-3 py-2 text-xs">
                  <span className="mt-0.5 shrink-0 text-muted-foreground">
                    {issue.type === 'broken-link' ? <Link2Off className="size-3.5" /> : <SpellCheck className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1 leading-snug">
                    <span className="font-medium text-foreground">{issue.pageTitle || issue.pagePath}</span>
                    <span className="ms-2 text-muted-foreground">{issue.detail}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-destructive/40 text-destructive uppercase">
                    {issue.type}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Deployment History Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm">Version History & Deployment Log</h2>
            <p className="text-xs text-muted-foreground">Complete historical record of all site publications with instant rollback capabilities.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter by version or message..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="h-8 pl-8 text-xs w-full"
              />
            </div>
          </div>
        </div>

        {deploymentsLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground text-sm gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading deployment history...
          </div>
        ) : filteredDeployments.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {filterQuery ? 'No deployments match your search filter.' : 'No deployments recorded yet.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-xs">Version</TableHead>
                <TableHead className="w-28 text-xs">Status</TableHead>
                <TableHead className="text-xs">Commit / Release Note</TableHead>
                <TableHead className="w-40 text-xs">Deployed At</TableHead>
                <TableHead className="w-36 text-end text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeployments.map((deployment) => {
                const isCurrent = currentLive?.id === deployment.id;
                const canRollback =
                  deployment.status === 'READY' && !isCurrent && currentLive && deployment.version < currentLive.version && !isBuilding;

                return (
                  <TableRow key={deployment.id} className="hover:bg-muted/40">
                    <TableCell className="py-3 font-mono text-xs font-semibold">v{deployment.version}</TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={deploymentStatusVariant(deployment.status)} className="text-[11px]">
                          {deploymentStatusLabel(deployment.status, t)}
                        </Badge>
                        {isCurrent ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                            Current
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs">
                      <span className="truncate block max-w-md text-foreground">{deployment.commitMessage || 'Manual publication'}</span>
                      {deployment.error ? <span className="text-destructive text-[11px] block truncate mt-0.5">{deployment.error}</span> : null}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">{date(deployment.completedAt ?? deployment.createdAt)}</TableCell>
                    <TableCell className="py-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {canRollback ? (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={rollback.isPending}
                            onClick={() => handleRollback(deployment)}
                            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="size-3" />
                            <span>Rollback</span>
                          </Button>
                        ) : null}
                        {deployment.status === 'READY' ? (
                          <Button
                            nativeButton={false}
                            render={
                              <a href={siteUrl(liveDomain, projectId)} target="_blank" rel="noreferrer" aria-label="View site at this version" />
                            }
                            variant="ghost"
                            size="icon-xs"
                            className="size-7 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Publish Changes Modal */}
      {project ? (
        <PublishModal
          open={publishOpen}
          onOpenChange={setPublishOpen}
          project={project}
          onPublished={() => {
            qc.invalidateQueries({ queryKey: queryKeys.deployments.baseline(projectId) });
            qc.invalidateQueries({ queryKey: queryKeys.deployments.changes(projectId) });
            qc.invalidateQueries({ queryKey: queryKeys.deployments.all(projectId) });
          }}
        />
      ) : null}
    </div>
  );
}
