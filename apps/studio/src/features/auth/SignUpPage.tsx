import { SignUpForm } from '@cms/auth/forms';
import { useT } from '@cms/i18n/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useGetPublicMeta } from '@/hooks/api/public';
import { readPendingInvitation } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';
import { AuthLayout } from './components/AuthLayout';

export interface SignUpPageProps {
  search: {
    invite?: string;
    email?: string;
    intent?: 'first-publish';
  };
}

export function SignUpPage({ search }: SignUpPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data: publicMeta } = useGetPublicMeta();
  const googleEnabled = publicMeta?.providers.google ?? false;
  const signupDisabled = publicMeta?.signupDisabled ?? true;

  const invitationId = search.invite ?? readPendingInvitation() ?? undefined;
  const firstPublish = search.intent === 'first-publish';
  const afterAuthPath = invitationId ? `/accept-invite/${invitationId}` : firstPublish ? '/app?firstPublish=true' : '/app';

  const finishSignUp = async () => {
    if (invitationId) {
      await navigate({
        to: '/accept-invite/$invitationId',
        params: { invitationId },
      });
    } else {
      await navigate({
        to: '/app',
        search: firstPublish ? { firstPublish: true } : {},
      });
    }
  };

  if (signupDisabled) {
    return (
      <AuthLayout subtitle={t('auth.signUp.subtitle')}>
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-center text-muted-foreground text-sm">
          {t('auth.legal.signupDisabled')}
        </p>
        <p className="mt-5 text-center text-muted-foreground text-sm">
          {t('auth.signUp.haveAccount')}{' '}
          <Link className="text-primary hover:underline" to="/sign-in">
            {t('auth.signIn.submit')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle={t('auth.signUp.subtitle')}>
      <SignUpForm
        afterAuthPath={afterAuthPath}
        client={cmsClient}
        googleEnabled={googleEnabled}
        initialEmail={search.email ?? ''}
        lockedEmail={Boolean(search.email)}
        onNavigateSignIn={() => navigate({ to: '/sign-in' })}
        onSuccess={finishSignUp}
      />
    </AuthLayout>
  );
}
