import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AcceptInvitePage } from '@/features/auth';

const acceptInvitationSearchSchema = z.object({
  token: z.string().optional(),
  invitationId: z.string().optional(),
});

export const Route = createFileRoute('/accept-invitation')({
  validateSearch: (search: Record<string, unknown>) => acceptInvitationSearchSchema.parse(search),
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AcceptInvitationRoute,
});

function AcceptInvitationRoute() {
  const { token, invitationId } = Route.useSearch();
  const activeId = token || invitationId;
  return <AcceptInvitePage invitationId={activeId} />;
}
