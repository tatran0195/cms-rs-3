import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';

export interface AdminAccountData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface AdminAccountStepProps {
  data: AdminAccountData;
  onChange: (patch: Partial<AdminAccountData>) => void;
  errors: Record<string, string>;
}

export function AdminAccountStep({ data, onChange, errors }: AdminAccountStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground/90">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 shrink-0 text-primary mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Primary Superadministrator</p>
            <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
              This account will have root administrative permissions across all workspaces, documentation projects, and security policies.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="admin-name">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="admin-name"
              placeholder="e.g. Jane Doe"
              className="pl-9"
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
              autoFocus
            />
          </div>
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-email">Work Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@company.com"
              className="pl-9"
              value={data.email}
              onChange={(e) => onChange({ email: e.target.value })}
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="admin-password"
              type="password"
              placeholder="Minimum 8 characters"
              className="pl-9"
              value={data.password}
              onChange={(e) => onChange({ password: e.target.value })}
            />
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-confirm-password">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="admin-confirm-password"
              type="password"
              placeholder="Re-enter password"
              className="pl-9"
              value={data.confirmPassword}
              onChange={(e) => onChange({ confirmPassword: e.target.value })}
            />
          </div>
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
        </div>
      </div>
    </div>
  );
}
