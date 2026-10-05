import { createFileRoute } from '@tanstack/react-router';
import { AcceptInvitePage } from '@/features/auth';

export const Route = createFileRoute('/accept-invite/$invitationId')({
  // Not under the (auth) layout, so noindex it directly: the URL carries a live
  // invitation token that must never be crawled or indexed.
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AcceptInviteRoute,
});

function AcceptInviteRoute() {
  const { invitationId } = Route.useParams();
  return <AcceptInvitePage invitationId={invitationId} />;
}
