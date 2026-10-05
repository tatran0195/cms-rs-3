import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceMembersPage } from '@/features/workspace';

export const Route = createFileRoute('/app/(dashboard)/members')({
  component: WorkspaceMembersPage,
});
