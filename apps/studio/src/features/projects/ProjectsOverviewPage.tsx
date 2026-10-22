import { CmsMark } from '@cms/design-system/brand';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@cms/design-system/components/ui/input-group';
import { SegmentedControl, SegmentedControlItem } from '@cms/design-system/components/ui/segmented-control';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { useT } from '@cms/i18n/react';
import type { AnalyticsRange } from '@cms/sdk';
import { useProjects, useWorkspaceAnalytics } from '@cms/sdk/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, BarChart3, BookText, FileText, LayoutGrid, List, PenLine, Plus, Rocket, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SectionCard, ViewsAreaChart } from '@/features/analytics';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const t = useT();
  const navigate = useNavigate();
  const { number } = useFormatters();

  const totalPages = (projects ?? []).reduce((sum, p) => sum + (p._count?.pages ?? 0), 0);
  const trend = useMemo(() => viewsTrend(analytics?.timeseries ?? []), [analytics?.timeseries]);
  const viewsByProject = useMemo(
    () => new Map<string, number>((analytics?.byProject ?? []).map((b: { projectId: string; views: number }) => [b.projectId, b.views])),
    [analytics?.byProject],
  );

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [projects, searchQuery]);

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
      });
    }
  }, [firstPublish, navigate, onNavigateToEditor, projects]);

  const handleProjectClick = (projectId: string) => {
    if (onNavigateToProject) {
      onNavigateToProject(projectId);
    } else {
      void navigate({
        to: '/app/projects/$projectId',
        params: { projectId },
      });
    }
  };

  const handleEditorClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    void navigate({
      to: '/app/projects/$projectId/editor',
      params: { projectId },
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Top Banner: Heading + New Project button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">{t('dashboard.subtitle')}</p>
        </div>
        <Button onClick={() => setNewProjectOpen(true)} className="gap-2">
          <Plus className="size-4" /> {t('dashboard.newProject')}
        </Button>
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      </div>

      {/* KPI Stats Cards */}
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
        <SectionCard
          label={t('dashboard.stats.visitors')}
          value={analytics?.uniqueVisitors ?? 0}
          icon={<Users className="size-4" />}
          loading={analyticsPending}
        />
      </div>

      {/* Views chart if there is data */}
      {(analytics?.totalViews ?? 0) > 0 ? (
        <ViewsAreaChart
          title={t('dashboard.viewsTitle')}
          description={t('dashboard.viewsDesc')}
          data={analytics?.timeseries ?? []}
          range={range}
          onRangeChange={setRange}
          loading={analyticsPending}
        />
      ) : null}

      {/* Sites Section Header: Search Filter + View Mode Toggle */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <InputGroup className="w-full">
              <InputGroupAddon>
                <Search className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Filter sites by name or slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter sites"
              />
            </InputGroup>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              {filteredProjects.length} of {projects?.length ?? 0} sites
            </span>
            <SegmentedControl density="compact">
              <SegmentedControlItem active={viewMode === 'grid'} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view">
                <LayoutGrid className="size-3.5" />
              </SegmentedControlItem>
              <SegmentedControlItem active={viewMode === 'table'} onClick={() => setViewMode('table')} title="Table view" aria-label="Table view">
                <List className="size-3.5" />
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>

        {/* Sites Content */}
        {isPending ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="grid place-items-center py-16 text-center rounded-xl border border-dashed border-border bg-card/50">
            <BookText className="size-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-base">{searchQuery ? 'No sites match your filter' : t('dashboard.empty.title')}</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">
              {searchQuery ? 'Try searching for a different name or clear the filter.' : t('dashboard.empty.body')}
            </p>
            {searchQuery ? (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearchQuery('')}>
                Clear filter
              </Button>
            ) : (
              <Button className="mt-4 gap-2" onClick={() => setNewProjectOpen(true)}>
                <Plus className="size-4" /> {t('dashboard.empty.cta')}
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Mintlify-style Project Cards Grid */
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 transition-colors group-hover:border-primary/30">
                        <CmsMark className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/app/projects/$projectId"
                          params={{ projectId: project.id }}
                          onClick={(e) => {
                            if (onNavigateToProject) {
                              e.preventDefault();
                              handleProjectClick(project.id);
                            }
                          }}
                          className="truncate font-semibold text-base text-foreground hover:text-primary transition-colors block"
                        >
                          {project.name}
                        </Link>
                        <Badge variant="secondary" className="mt-0.5 font-mono text-[10px] px-1.5 py-0">
                          /{project.slug}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="mt-5 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1.5">
                      <FileText className="size-3.5" />
                      <span>{number(project._count?.pages ?? 0)} pages</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Rocket className="size-3.5" />
                      <span>{number(project._count?.deployments ?? 0)} deploys</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BarChart3 className="size-3.5" />
                      <span>{number(viewsByProject.get(project.id) ?? 0)} views</span>
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 flex items-center justify-between border-t border-border pt-3.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs font-medium cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={(e) => handleEditorClick(e, project.id)}
                  >
                    <PenLine className="size-3" />
                    <span>Open editor</span>
                  </Button>
                  <Link
                    to="/app/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    <span>Overview</span>
                    <ArrowRight className="size-3.5 rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.col.site')}</TableHead>
                  <TableHead className="text-end">{t('dashboard.col.pages')}</TableHead>
                  <TableHead className="text-end">{t('dashboard.col.deploys')}</TableHead>
                  <TableHead className="text-end">{t('dashboard.col.views')}</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        to="/app/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="flex items-center gap-3 hover:text-primary transition-colors"
                      >
                        <CmsMark className="size-8 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{project.name}</div>
                          <div className="truncate font-mono text-muted-foreground text-xs">/{project.slug}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{number(project._count?.pages ?? 0)}</TableCell>
                    <TableCell className="text-end tabular-nums">{number(project._count?.deployments ?? 0)}</TableCell>
                    <TableCell className="text-end tabular-nums">{number(viewsByProject.get(project.id) ?? 0)}</TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => handleEditorClick(e, project.id)}>
                        <PenLine className="size-3" />
                        <span>Editor</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
