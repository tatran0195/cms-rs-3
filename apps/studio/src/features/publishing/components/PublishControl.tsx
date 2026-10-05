import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { DeployPipeline } from '@/features/publishing/components/DeployPipeline';
import { PublishModal } from '@/features/publishing/components/PublishModal';
import { useDeployments } from '@/hooks/api';
import type { Project } from '@/hooks/api/types';

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
    <div className="flex items-center gap-2">
      <Button
        aria-label={building ? t('project.publishing') : t('project.publish')}
        disabled={building}
        onClick={() => setPublishOpen(true)}
        size="sm"
      >
        <Rocket className="size-3.5" />
        <span className="hidden sm:inline">{building ? t('project.publishing') : t('project.publish')}</span>
      </Button>

      <PublishModal
        onOpenChange={setPublishOpen}
        onPublished={(deployment) => {
          setPublishedDeploymentId(deployment.id);
          setDeployOpen(true);
        }}
        open={publishOpen}
        project={project}
      />
      <DeployPipeline
        onOpenChange={setDeployOpen}
        open={deployOpen}
        project={project}
        trackedDeploymentId={publishedDeploymentId}
      />
    </div>
  );
}
