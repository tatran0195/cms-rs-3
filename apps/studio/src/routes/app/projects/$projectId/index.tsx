import { createFileRoute } from '@tanstack/react-router';
import { ProjectOverviewPage } from '@/features/projects';

export const Route = createFileRoute('/app/projects/$projectId/')({
  component: SiteOverviewRoute,
});

function SiteOverviewRoute() {
  const { projectId } = Route.useParams();
  return <ProjectOverviewPage projectId={projectId} />;
}
