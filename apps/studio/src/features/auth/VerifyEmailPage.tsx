import { VerifyEmailForm } from '@cms/auth/forms';
import { useT } from '@cms/i18n/react';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useSession } from '@/features/auth';
import { readPendingInvitation } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';
import { AuthLayout } from './components/AuthLayout';

export interface VerifyEmailPageProps {
  search: {
    email?: string;
    token?: string;
    invite?: string;
    delivery?: 'sent' | 'failed';
  };
}

export function VerifyEmailPage({ search }: VerifyEmailPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const email = search.email || session?.user?.email || '';

  const continueAfterVerification = useCallback(() => {
    const inviteId = search.invite ?? readPendingInvitation() ?? undefined;
    if (inviteId) {
      navigate({
        to: '/accept-invite/$invitationId',
        params: { invitationId: inviteId },
      });
      return;
    }
    navigate({ to: '/app' });
  }, [navigate, search.invite]);

  return (
    <AuthLayout subtitle={t('auth.verify.subtitle')}>
      <VerifyEmailForm
        client={cmsClient}
        deliveryFailed={search.delivery === 'failed'}
        email={email}
        onNavigateSignIn={() => navigate({ to: '/sign-in', search: { email, invite: search.invite } })}
        onSuccess={continueAfterVerification}
        token={search.token}
      />
    </AuthLayout>
  );
}
