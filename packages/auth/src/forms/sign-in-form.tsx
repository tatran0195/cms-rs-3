import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@cms/design-system/components/ui/input-otp';
import { Label } from '@cms/design-system/components/ui/label';
import { useOtpResendCountdown } from '@cms/design-system/hooks/use-otp-resend-countdown';
import { useT } from '@cms/i18n/react';
import type { CmsClient } from '@cms/sdk';
import { ArrowLeft } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useSendVerificationOtp, useSignInEmailOtp, useSignInSocial } from '../hooks/use-auth-mutations';
import type { AuthSessionData } from '../types';
import { GoogleIcon } from './google-icon';

export interface SignInFormProps {
  client: CmsClient;
  initialEmail?: string;
  onSuccess?: (session: AuthSessionData) => void;
  onNavigateSignUp?: () => void;
  googleEnabled?: boolean;
  afterAuthPath?: string;
}

export function SignInForm({
  client,
  initialEmail = '',
  onSuccess,
  onNavigateSignUp,
  googleEnabled = false,
  afterAuthPath = '/app',
}: SignInFormProps) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { resendIn, resetCountdown, startCountdown } = useOtpResendCountdown();

  const sendOtpMutation = useSendVerificationOtp(client);
  const signInMutation = useSignInEmailOtp(client);
  const socialMutation = useSignInSocial(client);

  const isSubmitting = sendOtpMutation.isPending || signInMutation.isPending;
  const isGoogleSubmitting = socialMutation.isPending;
  const normalizedEmail = email.trim().toLowerCase();

  const requestCode = async () => {
    setError(null);
    try {
      await sendOtpMutation.mutateAsync({
        email: normalizedEmail,
        type: 'sign-in',
      });
      setCodeSent(true);
      startCountdown();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('auth.otp.sendError'));
    }
  };

  const verifyCode = async () => {
    setError(null);
    try {
      const session = await signInMutation.mutateAsync({
        email: normalizedEmail,
        otp: otp.trim(),
      });
      onSuccess?.(session);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('auth.otp.invalid'));
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await socialMutation.mutateAsync({
        provider: 'google',
        callbackURL: afterAuthPath,
      });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('auth.signIn.error'));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (codeSent) {
      await verifyCode();
    } else {
      await requestCode();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!codeSent && googleEnabled ? (
        <>
          <Button
            className="mb-4 w-full gap-2"
            disabled={isGoogleSubmitting}
            onClick={signInWithGoogle}
            type="button"
            variant="outline"
          >
            <GoogleIcon className="size-4" />
            {isGoogleSubmitting ? t('auth.google.submitting') : t('auth.google.signIn')}
          </Button>
          <div className="mb-4 flex items-center gap-3 text-muted-foreground text-xs">
            <span className="h-px flex-1 bg-border" />
            <span>{t('auth.divider.or')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={submit}>
        {!codeSent ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t('auth.field.email')}</Label>
            <Input
              autoComplete="email"
              autoFocus
              id="email"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2" dir="ltr">
            <Label htmlFor="otp">{t('auth.otp.label')}</Label>
            <InputOTP
              aria-invalid={Boolean(error)}
              autoComplete="one-time-code"
              autoFocus
              containerClassName="justify-center"
              disabled={isSubmitting}
              id="otp"
              inputMode="numeric"
              maxLength={6}
              onChange={setOtp}
              onComplete={verifyCode}
              value={otp}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button className="w-full" disabled={isSubmitting || (codeSent && otp.length !== 6)} type="submit">
          {isSubmitting
            ? codeSent
              ? t('auth.otp.verifying')
              : t('auth.otp.sending')
            : codeSent
              ? t('auth.otp.verifySignIn')
              : t('auth.signIn.submit')}
        </Button>

        {codeSent ? (
          <div className="flex items-center justify-between text-xs">
            <button
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCodeSent(false);
                setOtp('');
                setError(null);
                resetCountdown();
              }}
              type="button"
            >
              <ArrowLeft className="size-3" />
              {t('auth.otp.differentEmail')}
            </button>
            <button
              className="text-primary hover:underline disabled:text-muted-foreground"
              disabled={resendIn > 0 || isSubmitting}
              onClick={requestCode}
              type="button"
            >
              {resendIn > 0 ? t('auth.otp.resendIn', { seconds: resendIn }) : t('auth.otp.resend')}
            </button>
          </div>
        ) : onNavigateSignUp ? (
          <p className="text-center text-muted-foreground text-sm">
            {t('auth.signIn.noAccount')}{' '}
            <button className="text-primary hover:underline" onClick={onNavigateSignUp} type="button">
              {t('auth.signUp.submit')}
            </button>
          </p>
        ) : null}
      </form>
    </div>
  );
}
