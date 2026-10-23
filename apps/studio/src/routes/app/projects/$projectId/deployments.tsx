import { createFileRoute } from '@tanstack/react-router';
import { ProjectDeploymentsPage } from '@/features/publishing';

export const Route = createFileRoute('/app/projects/$projectId/deployments')({
  component: ProjectDeploymentsRoute,
});

function ProjectDeploymentsRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDeploymentsPage projectId={projectId} />;
}
