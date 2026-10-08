import { useT } from '@cms/i18n/react';
import { KeyRound } from 'lucide-react';

export interface PasswordlessNoticeProps {
  messageKey?: 'auth.passwordless.description' | 'auth.passwordless.oldLink';
  onNavigateSignIn?: () => void;
}

export function PasswordlessNotice({
  messageKey = 'auth.passwordless.description',
  onNavigateSignIn,
}: PasswordlessNoticeProps) {
  const t = useT();
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-muted/40 px-5 py-6 text-center">
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <KeyRound className="size-5" />
      </span>
      <p className="text-muted-foreground text-sm leading-relaxed">{t(messageKey)}</p>
      {onNavigateSignIn ? (
        <button
          className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow-xs hover:bg-primary/90"
          onClick={onNavigateSignIn}
          type="button"
        >
          {t('auth.passwordless.continue')}
        </button>
      ) : null}
    </div>
  );
}
