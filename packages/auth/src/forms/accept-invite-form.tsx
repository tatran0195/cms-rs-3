import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import type { CmsClient } from '@cms/sdk';
import { useState } from 'react';
import { useAcceptInvitation } from '../hooks/use-auth-mutations';

export interface AcceptInviteFormProps {
  client: CmsClient;
  invitationId: string;
  recipientEmail?: string;
  onSuccess?: () => void;
  onNavigateSignIn?: () => void;
}

export function AcceptInviteForm({
  client,
  invitationId,
  recipientEmail,
  onSuccess,
  onNavigateSignIn,
}: AcceptInviteFormProps) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = useAcceptInvitation(client);
  const isAccepting = acceptMutation.isPending;

  const handleAccept = async () => {
    setError(null);
    try {
      await acceptMutation.mutateAsync({ invitationId });
      onSuccess?.();
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      const blob = `${errObj.code ?? ''} ${errObj.message ?? ''}`.toUpperCase();
      if (blob.includes('RECIPIENT') && recipientEmail) {
        setError(t('auth.invite.wrongAccount', { email: recipientEmail }));
      } else if (blob.includes('EXPIRED')) {
        setError(t('auth.invite.expiredError'));
      } else {
        setError(errObj.message ?? t('auth.invite.error'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Button className="w-full" disabled={isAccepting} onClick={handleAccept} type="button">
        {isAccepting ? t('auth.invite.accepting') : t('auth.invite.accept')}
      </Button>

      {onNavigateSignIn ? (
        <p className="text-center text-muted-foreground text-xs">
          <button className="text-primary hover:underline" onClick={onNavigateSignIn} type="button">
            {t('auth.invite.signInPrompt')}
          </button>
        </p>
      ) : null}
    </div>
  );
}
