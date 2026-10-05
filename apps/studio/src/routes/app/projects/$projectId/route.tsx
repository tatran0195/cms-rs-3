import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectAccessBoundary, ProjectLayout } from '@/features/projects';

export const Route = createFileRoute('/app/projects/$projectId')({
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  return (
    <ProjectAccessBoundary projectId={projectId}>
      <ProjectLayout projectId={projectId}>
        <Outlet />
      </ProjectLayout>
    </ProjectAccessBoundary>
  );
}
