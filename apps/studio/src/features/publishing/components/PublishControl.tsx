import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cms/design-system/components/ui/dropdown-menu';
import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useDeployments } from '@cms/sdk/react';
import { ChevronDown, History, Rocket } from 'lucide-react';
import { useState } from 'react';
import { DeployPipeline } from '@/features/publishing/components/DeployPipeline';
import { PublishModal } from '@/features/publishing/components/PublishModal';

export interface PublishControlProps {
  project: Project;
  initialPublishOpen?: boolean;
}

/** Top-bar status badge + Publish button. Publishing happens through the modal → pipeline flow.
 *  `initialPublishOpen` opens the publish modal on mount (deep link: editor?publish=true). */
export function PublishControl({ project, initialPublishOpen = false }: PublishControlProps) {
  const [publishOpen, setPublishOpen] = useState(initialPublishOpen);
  const [deployOpen, setDeployOpen] = useState(false);
  const [publishedDeploymentId, setPublishedDeploymentId] = useState<string | null>(null);
  const t = useT();

  const deployments = useDeployments(project.id, { pollIntervalMs: 1500 });
  const latest = deployments.data?.[0];
  const building = latest?.status === 'PENDING' || latest?.status === 'BUILDING';

  return (
    <div className="flex items-center">
      <div className="inline-flex items-center -space-x-px rounded-md shadow-xs">
        <Button
          aria-label={building ? t('project.publishing') : t('project.publish')}
          disabled={building}
          onClick={() => setPublishOpen(true)}
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-e-none border-border bg-background px-2.5 text-xs font-normal hover:bg-muted/60"
        >
          <Rocket className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">{building ? t('project.publishing') : t('project.publish')}</span>
          {building && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Building
            </Badge>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-7 items-center justify-center rounded-s-none rounded-e-md border border-border border-s-0 bg-background px-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Publish options"
          >
            <ChevronDown className="size-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setPublishOpen(true)} className="gap-2 text-xs">
              <Rocket className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t('project.publish')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeployOpen(true)} className="gap-2 text-xs">
              <History className="size-3.5 text-muted-foreground" />
              <span>Deploy pipeline & history</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PublishModal
        onOpenChange={setPublishOpen}
        onPublished={(deployment) => {
          setPublishedDeploymentId(deployment.id);
          setDeployOpen(true);
        }}
        open={publishOpen}
        project={project}
      />
      <DeployPipeline onOpenChange={setDeployOpen} open={deployOpen} project={project} trackedDeploymentId={publishedDeploymentId} />
    </div>
  );
}
