import { AcceptInviteForm } from '@cms/auth/forms';
import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/features/auth';
import { clearPendingInvitation, setPendingInvitation, useGetInvitationInfo } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';
import { AuthLayout } from './components/AuthLayout';
import { AuthProviders } from './components/AuthProviders';

export interface AcceptInvitePageProps {
  invitationId?: string;
}

export function AcceptInvitePage({ invitationId: propInvitationId }: AcceptInvitePageProps = {}) {
  const params = useParams({ strict: false }) as { invitationId?: string };
  const invitationId = propInvitationId ?? params.invitationId ?? '';

  return (
    <AuthProviders>
      <AcceptInviteContent invitationId={invitationId} />
    </AuthProviders>
  );
}

function AcceptInviteContent({ invitationId }: { invitationId: string }) {
  const t = useT();
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const invitation = useGetInvitationInfo(invitationId);
  const info = invitation.data ?? null;

  // Stash the invitation so sign-in/up can route back here afterwards.
  useEffect(() => {
    if (!isPending && !session && invitationId) {
      setPendingInvitation(invitationId);
    }
  }, [isPending, session, invitationId]);

  const handleSuccess = () => {
    clearPendingInvitation();
    toast.success(t('auth.invite.acceptedToast'));
    navigate({ to: '/app' });
  };

  const workspaceName = info?.workspaceName;
  const subtitle = workspaceName ? t('auth.invite.joinPrompt', { org: workspaceName }) : t('auth.invite.subtitle');

  if (isPending || invitation.isPending) {
    return (
      <AuthLayout subtitle={subtitle}>
        <p className="text-center text-muted-foreground text-sm">{t('common.loading')}</p>
      </AuthLayout>
    );
  }

  if (!info) {
    return (
      <AuthLayout subtitle={subtitle}>
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-destructive text-sm">
          {t('auth.invite.notFound')}
        </p>
      </AuthLayout>
    );
  }

  if (info.expired) {
    return (
      <AuthLayout subtitle={subtitle}>
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-destructive text-sm">
          {t('auth.invite.expiredError')}
        </p>
      </AuthLayout>
    );
  }

  if (!session) {
    const search = { invite: invitationId, email: info.email };
    return (
      <AuthLayout subtitle={subtitle}>
        <div className="flex flex-col gap-4">
          <p className="text-center text-muted-foreground text-sm">{t('auth.invite.invitedAs', { email: info.email })}</p>
          <p className="text-center text-muted-foreground text-sm">{t('auth.invite.signInPrompt')}</p>
          <Button className="w-full" nativeButton={false} render={<Link search={search} to="/sign-up" />}>
            {t('auth.invite.createAccountToJoin')}
          </Button>
          <p className="text-center text-muted-foreground text-sm">
            {t('auth.signUp.haveAccount')}{' '}
            <Link className="text-primary hover:underline" search={search} to="/sign-in">
              {t('auth.invite.signInToJoin')}
            </Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  // Signed in, but with a different address than the invite was sent to.
  const mismatch = session.user.email.toLowerCase() !== info.email.toLowerCase();

  return (
    <AuthLayout subtitle={subtitle}>
      <div className="flex flex-col gap-4">
        <p className="text-center text-muted-foreground text-sm">{t('auth.invite.invitedAs', { email: info.email })}</p>
        {mismatch ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
            {t('auth.invite.wrongAccount', { email: info.email })}
          </p>
        ) : (
          <>
            <p className="text-center text-muted-foreground text-sm">{t('auth.invite.acceptPrompt')}</p>
            <AcceptInviteForm client={cmsClient} invitationId={invitationId} recipientEmail={info.email} onSuccess={handleSuccess} />
          </>
        )}
        <Link className="text-center text-muted-foreground text-sm hover:underline" to="/app">
          {t('auth.invite.skip')}
        </Link>
      </div>
    </AuthLayout>
  );
}
