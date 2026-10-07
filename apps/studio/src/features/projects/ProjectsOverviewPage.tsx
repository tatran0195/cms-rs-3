import { CmsMark } from '@cms/design-system/brand';
import { Button } from '@cms/design-system/components/ui/button';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { useT } from '@cms/i18n/react';
import { useNavigate } from '@tanstack/react-router';
import { BarChart3, BookText, FileText, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SectionCard, ViewsAreaChart } from '@/features/analytics';
import type { AnalyticsRange } from '@/hooks/api';
import { useProjects, useWorkspaceAnalytics } from '@/hooks/api';
import { useFormatters, viewsTrend } from '@/shared';
import { NewProjectDialog } from './components/NewProjectDialog';

export interface ProjectsOverviewPageProps {
  firstPublish?: boolean;
  newSite?: boolean;
  onNavigateToEditor?: (projectId: string, search: { firstPublish: true }) => void;
  onNavigateToProject?: (projectId: string) => void;
}

export function ProjectsOverviewPage({ firstPublish, newSite, onNavigateToEditor, onNavigateToProject }: ProjectsOverviewPageProps) {
  const { data: projects, isPending } = useProjects();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data: analytics, isPending: analyticsPending } = useWorkspaceAnalytics(range);
  const [newProjectOpen, setNewProjectOpen] = useState(Boolean(newSite));
  const t = useT();
  const navigate = useNavigate();
  const { number } = useFormatters();

  const totalPages = (projects ?? []).reduce((sum, p) => sum + (p._count?.pages ?? 0), 0);
  const trend = useMemo(() => viewsTrend(analytics?.timeseries ?? []), [analytics?.timeseries]);
  const viewsByProject = useMemo(
    () => new Map<string, number>((analytics?.byProject ?? []).map((b: { projectId: string; views: number }) => [b.projectId, b.views])),
    [analytics?.byProject],
  );

  useEffect(() => {
    const starterProject = projects?.[0];
    if (!firstPublish || !starterProject) return;
    if (onNavigateToEditor) {
      onNavigateToEditor(starterProject.id, { firstPublish: true });
    } else {
      void navigate({
        to: '/app/projects/$projectId/editor',
        params: { projectId: starterProject.id },
        search: { firstPublish: true },
        replace: true,
      } as any);
    }
  }, [firstPublish, navigate, onNavigateToEditor, projects]);

  const handleProjectClick = (projectId: string) => {
    if (onNavigateToProject) {
      onNavigateToProject(projectId);
    } else {
      void navigate({
        to: '/app/projects/$projectId',
        params: { projectId },
      } as any);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">{t('dashboard.subtitle')}</p>
        </div>
        <Button onClick={() => setNewProjectOpen(true)}>
          <Plus className="size-4" /> {t('dashboard.newProject')}
        </Button>
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SectionCard label={t('dashboard.stats.projects')} value={projects?.length ?? 0} icon={<BookText className="size-4" />} loading={isPending} />
        <SectionCard label={t('dashboard.stats.pages')} value={totalPages} icon={<FileText className="size-4" />} loading={isPending} />
        <SectionCard
          label={t('dashboard.stats.pageViews')}
          value={analytics?.totalViews ?? 0}
          icon={<BarChart3 className="size-4" />}
          trend={trend}
          hint={trend ? t('analytics.vsPrevious') : undefined}
          loading={analyticsPending}
        />
        {/* No visitor-specific timeseries exists yet, so no trend badge here —
            the page-views trend would be misleading on a visitors metric. */}
        <SectionCard
          label={t('dashboard.stats.visitors')}
          value={analytics?.uniqueVisitors ?? 0}
          icon={<Users className="size-4" />}
          loading={analyticsPending}
        />
      </div>

      {/* Interactive views chart */}
      <ViewsAreaChart
        title={t('dashboard.viewsTitle')}
        description={t('dashboard.viewsDesc')}
        data={analytics?.timeseries ?? []}
        range={range}
        onRangeChange={setRange}
        loading={analyticsPending}
      />

      {/* Sites table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-border border-b px-5 py-3.5">
          <h2 className="font-semibold text-sm">{t('dashboard.sitesTable')}</h2>
        </div>
        {isPending ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (projects ?? []).length === 0 ? (
          // Also the recovery path for a user whose workspace provisioning
          // failed at sign-up: creating a project mints a fresh workspace.
          <div className="grid place-items-center py-16 text-center">
            <BookText className="size-7 text-muted-foreground" />
            <p className="mt-3 font-medium">{t('dashboard.empty.title')}</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">{t('dashboard.empty.body')}</p>
            <Button className="mt-4" onClick={() => setNewProjectOpen(true)}>
              <Plus className="size-4" /> {t('dashboard.empty.cta')}
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.col.site')}</TableHead>
                <TableHead className="text-end">{t('dashboard.col.pages')}</TableHead>
                <TableHead className="text-end">{t('dashboard.col.deploys')}</TableHead>
                <TableHead className="text-end">{t('dashboard.col.views')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(projects ?? []).map((project) => (
                <TableRow key={project.id} className="cursor-pointer" onClick={() => handleProjectClick(project.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CmsMark className="size-8 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{project.name}</div>
                        <div className="truncate font-mono text-muted-foreground text-xs">/{project.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{number(project._count?.pages ?? 0)}</TableCell>
                  <TableCell className="text-end tabular-nums">{number(project._count?.deployments ?? 0)}</TableCell>
                  <TableCell className="text-end tabular-nums">{number(viewsByProject.get(project.id) ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
