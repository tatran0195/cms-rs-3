import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isSectionId, ProjectSettingsPage, type SectionId } from '@/features/project-settings';

export const Route = createFileRoute('/app/projects/$projectId/settings')({
  component: ProjectSettingsRoute,
  validateSearch: (search: Record<string, unknown>): { section: SectionId } => ({
    // Analytics moved under Integrations — keep old ?section=analytics links working.
    section: isSectionId(search.section) ? search.section : search.section === 'analytics' ? 'integrations' : 'general',
  }),
});

function ProjectSettingsRoute() {
  const { projectId } = Route.useParams();
  const { section } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ProjectSettingsPage projectId={projectId} section={section} onSectionChange={(next) => navigate({ search: { section: next }, replace: true })} />
  );
}
