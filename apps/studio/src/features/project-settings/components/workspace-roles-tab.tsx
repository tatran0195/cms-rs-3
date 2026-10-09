import { WorkspaceRolesSection } from '@/features/workspace';
import { useMembers, useProjects } from '@/hooks/api';

export function WorkspaceRolesTab() {
  const { data: rawMembers } = useMembers();
  const { data: projects } = useProjects();

  const members = (rawMembers as { members?: Array<{ organizationId?: string; organization_id?: string }> } | undefined)?.members;
  const orgId =
    members?.[0]?.organizationId ??
    members?.[0]?.organization_id ??
    projects?.[0]?.organizationId;

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceRolesSection orgId={orgId} />
    </div>
  );
}
