import { Label } from '@cms/design-system/components/ui/label';
import { Switch } from '@cms/design-system/components/ui/switch';
import { cn } from '@cms/design-system/lib/utils';
import { Check, MailCheck, ShieldCheck, UserCheck, Users } from 'lucide-react';

export interface AuthPoliciesData {
  allowPublicSignup: boolean;
  requireEmailVerification: boolean;
  enabledOauthProviders: string[];
}

interface AuthPoliciesStepProps {
  data: AuthPoliciesData;
  onChange: (patch: Partial<AuthPoliciesData>) => void;
  configuredOauthProviders: string[];
}

export function AuthPoliciesStep({ data, onChange, configuredOauthProviders }: AuthPoliciesStepProps) {
  const toggleOauth = (provider: string) => {
    const next = data.enabledOauthProviders.includes(provider)
      ? data.enabledOauthProviders.filter((p) => p !== provider)
      : [...data.enabledOauthProviders, provider];
    onChange({ enabledOauthProviders: next });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold">User Registration Mode</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ allowPublicSignup: false })}
            className={cn(
              'flex flex-col text-left p-4 rounded-xl border transition-all',
              !data.allowPublicSignup
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:bg-muted/40',
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span className="font-semibold text-sm">Invite-Only</span>
              </div>
              {!data.allowPublicSignup && <Check className="size-4 text-primary" />}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Recommended for internal companies. Only team members explicitly invited by an administrator can join.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChange({ allowPublicSignup: true })}
            className={cn(
              'flex flex-col text-left p-4 rounded-xl border transition-all',
              data.allowPublicSignup
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:bg-muted/40',
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-blue-600" />
                <span className="font-semibold text-sm">Open Registration</span>
              </div>
              {data.allowPublicSignup && <Check className="size-4 text-primary" />}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Anyone with network access to the platform can self-register an account.
            </p>
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="text-sm font-semibold">Verification & Security</Label>
        <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-card">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <MailCheck className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Require Email Verification</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Users must confirm their email address before accessing published workspaces.
            </p>
          </div>
          <Switch
            checked={data.requireEmailVerification}
            onCheckedChange={(checked) => onChange({ requireEmailVerification: checked })}
          />
        </div>
      </div>

      {configuredOauthProviders.length > 0 && (
        <div className="space-y-3 pt-2">
          <Label className="text-sm font-semibold">Single Sign-On (OAuth)</Label>
          <div className="space-y-2">
            {configuredOauthProviders.map((provider) => {
              const isEnabled = data.enabledOauthProviders.includes(provider);
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-card"
                >
                  <div className="flex items-center gap-3">
                    <UserCheck className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium capitalize">{provider} Authentication</p>
                      <p className="text-xs text-muted-foreground">
                        Allow team members to sign in with their {provider} identity.
                      </p>
                    </div>
                  </div>
                  <Switch checked={isEnabled} onCheckedChange={() => toggleOauth(provider)} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
