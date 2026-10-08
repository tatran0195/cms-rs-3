import { Button } from '@cms/design-system/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@cms/design-system/components/ui/input-otp';
import { Label } from '@cms/design-system/components/ui/label';
import { useT } from '@cms/i18n/react';
import type { CmsClient } from '@cms/sdk';
import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSendVerificationOtp, useVerifyEmail, useVerifyEmailOtp } from '../hooks/use-auth-mutations';

export interface VerifyEmailFormProps {
  client: CmsClient;
  email?: string;
  token?: string;
  deliveryFailed?: boolean;
  onSuccess?: () => void;
  onNavigateSignIn?: () => void;
}

export function VerifyEmailForm({
  client,
  email = '',
  token,
  deliveryFailed = false,
  onSuccess,
  onNavigateSignIn,
}: VerifyEmailFormProps) {
  const t = useT();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(deliveryFailed ? t('auth.verify.sendError') : null);

  const verifyTokenMutation = useVerifyEmail(client);
  const verifyOtpMutation = useVerifyEmailOtp(client);
  const sendOtpMutation = useSendVerificationOtp(client);

  const verifying = verifyTokenMutation.isPending || verifyOtpMutation.isPending;
  const sending = sendOtpMutation.isPending;

  // Handle token in URL automatically
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await verifyTokenMutation.mutateAsync(token);
        if (!cancelled) {
          onSuccess?.();
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = (err as { message?: string })?.message;
          setError(message || t('auth.verify.invalidLink'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, onSuccess, t, verifyTokenMutation.mutateAsync]);

  const resend = async () => {
    if (!email) {
      setError(t('auth.verify.noEmail'));
      return;
    }
    setError(null);
    try {
      await sendOtpMutation.mutateAsync({
        email,
        type: 'email-verification',
      });
      setOtp('');
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('auth.verify.sendError'));
    }
  };

  const verifyCode = async () => {
    if (!email || otp.length !== 6) {
      setError(t('auth.verify.invalidCode'));
      return;
    }
    setError(null);
    try {
      await verifyOtpMutation.mutateAsync({ email, otp });
      onSuccess?.();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message;
      setError(message || t('auth.verify.invalidCode'));
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await verifyCode();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Mail className="size-6" />
        </div>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col items-center gap-2" dir="ltr">
          <Label htmlFor="verify-otp">{t('auth.otp.label')}</Label>
          <InputOTP
            aria-invalid={Boolean(error)}
            autoComplete="one-time-code"
            autoFocus
            containerClassName="justify-center"
            disabled={verifying}
            id="verify-otp"
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

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button className="w-full" disabled={verifying || otp.length !== 6} type="submit">
          {verifying ? t('auth.otp.verifying') : t('auth.verify.submit')}
        </Button>

        <div className="flex items-center justify-between text-xs">
          {onNavigateSignIn ? (
            <button className="text-muted-foreground hover:text-foreground" onClick={onNavigateSignIn} type="button">
              {t('auth.signIn.submit')}
            </button>
          ) : <span />}
          <button
            className="text-primary hover:underline disabled:text-muted-foreground"
            disabled={sending || verifying}
            onClick={resend}
            type="button"
          >
            {sending ? t('auth.otp.sending') : t('auth.verify.resend')}
          </button>
        </div>
      </form>
    </div>
  );
}
