import { CmsMark } from '@cms/design-system/brand';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@cms/design-system/components/ui/input-group';
import { SegmentedControl, SegmentedControlItem } from '@cms/design-system/components/ui/segmented-control';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useDeployments, useDomains, useProjects } from '@cms/sdk/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight, BookText, FileText, Globe, LayoutGrid, List, PenLine, Plus, Rocket, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { env } from '@/env';
import { useFormatters } from '@/shared';
import { NewProjectDialog } from './components/NewProjectDialog';

export interface ProjectsOverviewPageProps {
  firstPublish?: boolean;
  newSite?: boolean;
  onNavigateToEditor?: (projectId: string, search: { firstPublish: true }) => void;
  onNavigateToProject?: (projectId: string) => void;
}

const siteBaseDomain = () => env.VITE_SITE_BASE_DOMAIN?.replace(/^\*\./, '').replace(/\.$/, '') || undefined;
const siteUrl = (domain: string | null, projectId: string) => (domain ? `https://${domain}` : `/sites/${projectId}`);

export function ProjectsOverviewPage({ firstPublish, newSite, onNavigateToEditor, onNavigateToProject }: ProjectsOverviewPageProps) {
  const { data: projects, isPending } = useProjects();
  const [newProjectOpen, setNewProjectOpen] = useState(Boolean(newSite));
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const t = useT();
  const navigate = useNavigate();
  const { number } = useFormatters();

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
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full min-h-full">
      {/* Sleek Top Action Bar: Search, View Mode Toggle, and Create Project Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b pb-4">
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
          <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5 shrink-0">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'site' : 'sites'}
          </Badge>
        </div>

        <div className="flex items-center gap-2.5">
          <SegmentedControl density="compact">
            <SegmentedControlItem active={viewMode === 'grid'} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view">
              <LayoutGrid className="size-3.5" />
            </SegmentedControlItem>
            <SegmentedControlItem active={viewMode === 'table'} onClick={() => setViewMode('table')} title="Table view" aria-label="Table view">
              <List className="size-3.5" />
            </SegmentedControlItem>
          </SegmentedControl>

          <Button onClick={() => setNewProjectOpen(true)} className="gap-1.5 h-8 text-xs font-medium cursor-pointer shadow-xs">
            <Plus className="size-3.5" />
            <span>Create project</span>
          </Button>
          <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
        </div>
      </div>

      {/* Projects Content Area */}
      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="grid place-items-center py-20 text-center rounded-xl border border-dashed border-border bg-card/40">
          <BookText className="size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold text-base text-foreground">{searchQuery ? 'No sites match your filter' : t('dashboard.empty.title')}</p>
          <p className="mt-1 max-w-sm text-muted-foreground text-xs">
            {searchQuery ? 'Try searching for a different name or clear the filter.' : t('dashboard.empty.body')}
          </p>
          {searchQuery ? (
            <Button variant="outline" size="sm" className="mt-4 text-xs" onClick={() => setSearchQuery('')}>
              Clear filter
            </Button>
          ) : (
            <Button className="mt-4 gap-2 text-xs" onClick={() => setNewProjectOpen(true)}>
              <Plus className="size-3.5" /> {t('dashboard.empty.cta')}
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Medusa / Vercel-style Project Cards with Deployed Domains */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCardItem
              key={project.id}
              project={project}
              number={number}
              onProjectClick={handleProjectClick}
              onEditorClick={handleEditorClick}
            />
          ))}
        </div>
      ) : (
        /* Table View with Deployed Domain Column */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.col.site')}</TableHead>
                <TableHead>Deployed Domain</TableHead>
                <TableHead className="text-end">{t('dashboard.col.pages')}</TableHead>
                <TableHead className="text-end">{t('dashboard.col.deploys')}</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((project) => (
                <ProjectTableRowItem
                  key={project.id}
                  project={project}
                  number={number}
                  onProjectClick={handleProjectClick}
                  onEditorClick={handleEditorClick}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Medusa-style Project Card displaying deployed domains, status indicators, and actions */
function ProjectCardItem({
  project,
  number,
  onProjectClick,
  onEditorClick,
}: {
  project: Project;
  number: (n: number) => string;
  onProjectClick: (id: string) => void;
  onEditorClick: (e: React.MouseEvent, id: string) => void;
}) {
  const { data: domains } = useDomains(project.id);
  const { data: deployments } = useDeployments(project.id);

  const primaryDomain = domains?.find((d) => d.isPrimary && d.verified) ?? domains?.find((d) => d.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, project.id);

  const latestDeployment = deployments?.[0];
  const isReady = latestDeployment?.status === 'READY';
  const isBuilding = latestDeployment?.status === 'BUILDING';
  const isFailed = latestDeployment?.status === 'FAILED';

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4.5 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div>
        {/* Top row: Brand Icon, Name, and Live Status Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/60 transition-colors group-hover:border-primary/30">
              <CmsMark className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                to="/app/projects/$projectId"
                params={{ projectId: project.id }}
                onClick={(e) => {
                  e.preventDefault();
                  onProjectClick(project.id);
                }}
                className="truncate font-semibold text-sm text-foreground hover:text-primary transition-colors block"
              >
                {project.name}
              </Link>
              <span className="font-mono text-[10.5px] text-muted-foreground block truncate">/{project.slug}</span>
            </div>
          </div>

          {/* Deployment Status Indicator */}
          <div className="shrink-0 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium border border-border/80 bg-background/60">
            {isReady ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-600 dark:text-emerald-400">Live</span>
              </>
            ) : isBuilding ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">Building</span>
              </>
            ) : isFailed ? (
              <>
                <span className="size-1.5 rounded-full bg-destructive" />
                <span className="text-destructive">Failed</span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                <span className="text-muted-foreground">Draft</span>
              </>
            )}
          </div>
        </div>

        {/* Medusa/Vercel-style Deployed Domain Pill */}
        <div className="mt-3.5 flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 transition-colors hover:bg-muted/60">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Globe className="size-3.5 text-emerald-500 shrink-0" />
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-xs text-foreground/90 hover:text-primary hover:underline truncate"
              title={liveHref}
            >
              {liveDomain ?? `sites/${project.id}`}
            </a>
          </div>
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground shrink-0 ms-1 p-0.5"
            aria-label={`Open live documentation for ${project.name}`}
          >
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>

        {/* Metadata row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
          <span className="flex items-center gap-1">
            <FileText className="size-3.5" />
            <span>{number(project._count?.pages ?? 0)} pages</span>
          </span>
          <span className="flex items-center gap-1">
            <Rocket className="size-3.5" />
            <span>{number(project._count?.deployments ?? 0)} deploys</span>
          </span>
        </div>
      </div>

      {/* Card Footer: Editor CTA & Overview Link */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs font-medium cursor-pointer hover:bg-primary hover:text-primary-foreground"
          onClick={(e) => onEditorClick(e, project.id)}
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
  );
}

/** Table Row displaying deployed domain */
function ProjectTableRowItem({
  project,
  number,
  onProjectClick,
  onEditorClick,
}: {
  project: Project;
  number: (n: number) => string;
  onProjectClick: (id: string) => void;
  onEditorClick: (e: React.MouseEvent, id: string) => void;
}) {
  const { data: domains } = useDomains(project.id);
  const primaryDomain = domains?.find((d) => d.isPrimary && d.verified) ?? domains?.find((d) => d.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, project.id);

  return (
    <TableRow key={project.id}>
      <TableCell>
        <Link
          to="/app/projects/$projectId"
          params={{ projectId: project.id }}
          onClick={(e) => {
            e.preventDefault();
            onProjectClick(project.id);
          }}
          className="flex items-center gap-3 hover:text-primary transition-colors"
        >
          <CmsMark className="size-7 shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">{project.name}</div>
            <div className="truncate font-mono text-muted-foreground text-xs">/{project.slug}</div>
          </div>
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
          <Globe className="size-3 text-emerald-500 shrink-0" />
          <a href={liveHref} target="_blank" rel="noreferrer" className="hover:underline hover:text-primary truncate max-w-[200px]">
            {liveDomain ?? `sites/${project.id}`}
          </a>
          <ArrowUpRight className="size-3 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="text-end tabular-nums text-xs">{number(project._count?.pages ?? 0)}</TableCell>
      <TableCell className="text-end tabular-nums text-xs">{number(project._count?.deployments ?? 0)}</TableCell>
      <TableCell className="text-end">
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => onEditorClick(e, project.id)}>
          <PenLine className="size-3" />
          <span>Editor</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}
