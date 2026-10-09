import { Building2, CheckCircle2, Lock, Palette, Shield, Sparkles, UserCheck } from 'lucide-react';
import type { AdminAccountData } from './AdminAccountStep';
import type { AppearanceData } from './AppearanceStep';
import type { AuthPoliciesData } from './AuthPoliciesStep';
import type { WorkspaceProfileData } from './WorkspaceProfileStep';

interface ReviewLaunchStepProps {
  admin: AdminAccountData;
  workspace: WorkspaceProfileData;
  auth: AuthPoliciesData;
  appearance: AppearanceData;
}

export function ReviewLaunchStep({ admin, workspace, auth, appearance }: ReviewLaunchStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-950 dark:text-emerald-200">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Ready to Initialize Platform</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Please review your configuration below. Submitting will create your administrator account, apply instance settings, and log you directly into your workspace.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Admin Card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <UserCheck className="size-4 text-primary" />
            <span>Administrator Account</span>
          </div>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p><strong className="text-foreground">Name:</strong> {admin.name}</p>
            <p><strong className="text-foreground">Email:</strong> {admin.email}</p>
            <p><strong className="text-foreground">Role:</strong> Platform Superadmin</p>
          </div>
        </div>

        {/* Workspace Card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Building2 className="size-4 text-primary" />
            <span>Workspace Profile</span>
          </div>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p><strong className="text-foreground">Name:</strong> {workspace.name}</p>
            <p><strong className="text-foreground">Slug:</strong> <code className="font-mono bg-muted px-1 py-0.5 rounded">{workspace.slug}</code></p>
            {workspace.logoUrl && <p className="truncate"><strong className="text-foreground">Logo:</strong> {workspace.logoUrl}</p>}
          </div>
        </div>

        {/* Auth Policies Card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Shield className="size-4 text-primary" />
            <span>Access Policies</span>
          </div>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p>
              <strong className="text-foreground">Registration:</strong>{' '}
              {auth.allowPublicSignup ? 'Open Self-Registration' : 'Invite-Only (Restricted)'}
            </p>
            <p>
              <strong className="text-foreground">Email Verification:</strong>{' '}
              {auth.requireEmailVerification ? 'Required' : 'Optional'}
            </p>
            <p>
              <strong className="text-foreground">SSO Providers:</strong>{' '}
              {auth.enabledOauthProviders.length > 0 ? auth.enabledOauthProviders.join(', ') : 'None enabled'}
            </p>
          </div>
        </div>

        {/* Appearance Card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Palette className="size-4 text-primary" />
            <span>Appearance & Locale</span>
          </div>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p><strong className="text-foreground">Default Theme:</strong> <span className="capitalize">{appearance.defaultTheme}</span></p>
            <p><strong className="text-foreground">Interface Language:</strong> <span className="uppercase">{appearance.defaultLocale}</span></p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Lock className="size-3.5 text-muted-foreground shrink-0" />
        <span>Setup will be permanently locked after initial deployment to secure the instance.</span>
      </div>
    </div>
  );
}
