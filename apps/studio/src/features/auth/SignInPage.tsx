import { SignInForm } from '@cms/auth/forms';
import { useT } from '@cms/i18n/react';
import { useNavigate } from '@tanstack/react-router';
import { useGetPublicMeta } from '@/hooks/api/public';
import { readPendingInvitation } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';
import { AuthLayout } from './components/AuthLayout';

export interface SignInPageProps {
  search: {
    invite?: string;
    email?: string;
  };
}

export function SignInPage({ search }: SignInPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data: publicMeta } = useGetPublicMeta();
  const googleEnabled = publicMeta?.providers.google ?? false;

  const invitationId = search.invite ?? readPendingInvitation() ?? undefined;
  const afterAuthPath = invitationId ? `/accept-invite/${invitationId}` : '/app';

  const finishSignIn = async () => {
    if (invitationId) {
      await navigate({
        to: '/accept-invite/$invitationId',
        params: { invitationId },
      });
    } else {
      await navigate({ to: '/app' });
    }
  };

  return (
    <AuthLayout subtitle={t('auth.signIn.subtitle')}>
      <SignInForm
        afterAuthPath={afterAuthPath}
        client={cmsClient}
        googleEnabled={googleEnabled}
        initialEmail={search.email ?? ''}
        onNavigateSignUp={() => navigate({ to: '/sign-up' })}
        onSuccess={finishSignIn}
      />
    </AuthLayout>
  );
}
