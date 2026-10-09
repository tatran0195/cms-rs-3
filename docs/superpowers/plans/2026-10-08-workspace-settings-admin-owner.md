# Workspace Settings for Admin & Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated Workspace Settings area in `/app/settings` for Workspace Admin and Owner members, covering Workspace General settings, Members management, Custom Roles matrix, and Danger Zone actions (Transfer Ownership and Delete Workspace).

**Architecture:** Extend `/app/settings` sidebar navigation into "Account" and "Workspace" sections, gated by `canAdminister(currentRole)`. Wire backend workspace endpoints for ownership transfer and workspace deletion with Owner authorization checks. Build modular UI tabs for General, Members, Roles, and Danger Zone with explicit Owner-only destructive action confirmation guards.

**Tech Stack:** Rust / Axum (`cms-api`), TanStack React Router, TanStack React Query, TanStack Form, Tailwind CSS, Lucide icons, Vitest / Playwright.

## Global Constraints
- Internal company platform deployment: No billing, plan tiers, or pricing features.
- Follow existing monorepo architecture: `@cms/shared/rbac` for role helpers (`canAdminister`), `@cms/design-system` for UI primitives, and `apps/studio/src/features/project-settings/services/settings-api.ts` for API queries/mutations.
- Strict Owner guards: Deleting workspace or transferring ownership requires `MemberRole::Owner`.

---

### Task 1: Backend Workspace Ownership Transfer & Deletion Endpoints

**Files:**
- Modify: `crates/cms-api/src/workspace/handlers.rs`
- Modify: `crates/cms-api/src/workspace/mod.rs`
- Modify: `packages/sdk/src/resources/workspace.ts`

**Interfaces:**
- Consumes: `cms_biz::org::OrgService::delete_organization`, `cms_biz::org::OrgService::update_member_role`, `cms_db::org::MemberQueries`
- Produces: `POST /api/app/workspace/transfer-ownership`, `DELETE /api/app/workspace`, `cmsClient.workspace.transferOwnership`, `cmsClient.workspace.delete`

- [ ] **Step 1: Add workspace transfer and delete handlers in `crates/cms-api/src/workspace/handlers.rs`**

```rust
/// Transfer workspace ownership
pub async fn transfer_workspace_ownership_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    use cms_db::org::MemberQueries;

    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    let target_member_id = body
        .get("memberId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::InvalidInput("memberId is required".to_string()))?
        .to_string();

    // Verify caller is current owner of organization
    state.biz_context.authz.require_org_owner(&auth.user.id, &org_id).await?;

    // Promote target member to Owner
    cms_biz::org::OrgService::update_member_role(
        &state.biz_context,
        &auth.user.id,
        &org_id,
        &target_member_id,
        cms_entity::common::MemberRole::Owner,
    )
    .await?;

    // Demote current caller/previous owner to Admin
    let caller_member = MemberQueries::get_by_user_and_org(&state.biz_context.pool, &auth.user.id, &org_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Caller membership not found".to_string()))?;

    if caller_member.id != target_member_id {
        let _ = cms_biz::org::OrgService::update_member_role(
            &state.biz_context,
            &auth.user.id,
            &org_id,
            &caller_member.id,
            cms_entity::common::MemberRole::Admin,
        )
        .await;
    }

    Ok(Json(ApiResponse::new(serde_json::json!({ "success": true }))))
}

/// Delete workspace organization
pub async fn delete_workspace_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let org_id = resolve_workspace_org(&state, &auth.user.id).await?;
    state.biz_context.authz.require_org_owner(&auth.user.id, &org_id).await?;

    cms_biz::org::OrgService::delete_organization(&state.biz_context, &auth.user.id, &org_id).await?;

    Ok(Json(ApiResponse::new(serde_json::json!({ "success": true, "id": org_id }))))
}
```

- [ ] **Step 2: Register routes in `crates/cms-api/src/workspace/mod.rs`**

```rust
pub fn workspace_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_workspace_settings_handler))
        .route("/", patch(update_workspace_settings_handler))
        .route("/", delete(delete_workspace_handler))
        .route("/transfer-ownership", post(transfer_workspace_ownership_handler))
        .route("/analytics", get(get_workspace_analytics_handler))
        .with_state(state)
}
```

- [ ] **Step 3: Add SDK methods in `packages/sdk/src/resources/workspace.ts`**

```typescript
  /**
   * Transfer workspace ownership to another member
   */
  async transferOwnership<T = { success: boolean }>(memberId: string): Promise<T> {
    return this.http.post<T>('/api/app/workspace/transfer-ownership', { memberId });
  }

  /**
   * Delete current workspace organization
   */
  async delete<T = { success: boolean; id: string }>(): Promise<T> {
    return this.http.delete<T>('/api/app/workspace');
  }
```

- [ ] **Step 4: Verify build with `cargo check -p cms-api`**

Run: `cargo check -p cms-api`
Expected: Clean compilation with 0 errors.

---

### Task 2: Studio API Hooks for Workspace Management

**Files:**
- Modify: `apps/studio/src/features/project-settings/services/settings-api.ts`

**Interfaces:**
- Consumes: `cmsClient.workspace.transferOwnership`, `cmsClient.workspace.delete`, `queryKeys`
- Produces: `useTransferWorkspaceOwnership`, `useDeleteWorkspace`

- [ ] **Step 1: Add mutations in `apps/studio/src/features/project-settings/services/settings-api.ts`**

```typescript
export const useTransferWorkspaceOwnership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => await cmsClient.workspace.transferOwnership(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.settings() });
    },
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => await cmsClient.workspace.delete(),
    onSuccess: () => {
      queryClient.clear();
    },
  });
};
```

- [ ] **Step 2: Verify type check in `@cms/studio`**

Run: `bun --filter=@cms/studio run typecheck`
Expected: 0 type errors.

---

### Task 3: Workspace General Settings Component

**Files:**
- Create: `apps/studio/src/features/project-settings/components/workspace-general-tab.tsx`
- Create: `apps/studio/src/features/project-settings/components/workspace-general-tab.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceSettings`, `useUpdateWorkspaceSettings`, `SettingsSection` from `./section`
- Produces: `<WorkspaceGeneralTab />`

- [ ] **Step 1: Write failing unit test in `workspace-general-tab.test.tsx`**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceGeneralTab } from './workspace-general-tab';

vi.mock('@/hooks/api', () => ({
  useWorkspaceSettings: () => ({
    data: { name: 'Acme Corp', slug: 'acme-corp', project_count: 5, member_count: 12 },
    isPending: false,
  }),
  useUpdateWorkspaceSettings: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe('WorkspaceGeneralTab', () => {
  it('renders workspace profile fields and stats', () => {
    render(<WorkspaceGeneralTab />);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('acme-corp')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun --filter=@cms/studio test workspace-general-tab.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `workspace-general-tab.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Textarea } from '@cms/design-system/components/ui/textarea';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { useT } from '@cms/i18n/react';
import { Copy, Check, Building2, FolderGit2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/hooks/api';
import { copyToClipboard } from '@/shared';
import { SettingsSection } from './section';

export function WorkspaceGeneralTab() {
  const t = useT();
  const { data: workspace, isPending } = useWorkspaceSettings();
  const updateSettings = useUpdateWorkspaceSettings();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [copied, setCopied] = useState(false);

  if (workspace && !initialized) {
    setName(workspace.name || '');
    setDescription((workspace as any).description || '');
    setLogoUrl((workspace as any).logo || (workspace as any).logoUrl || '');
    setInitialized(true);
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const handleCopySlug = async () => {
    if (workspace?.slug) {
      await copyToClipboard(workspace.slug);
      setCopied(true);
      toast.success(t('common.copied') || 'Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Workspace name is required');
      return;
    }
    try {
      await updateSettings.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      toast.success(t('settings.saved') || 'Workspace settings updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update workspace settings');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSave}>
        <SettingsSection
          title={t('settings.workspace.general.title') || 'Workspace Profile'}
          description={t('settings.workspace.general.description') || 'Manage your company workspace identity and branding.'}
          footer={
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? t('common.saving') || 'Saving...' : t('common.save') || 'Save Changes'}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ws-name">{t('settings.workspace.name') || 'Workspace Name'}</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-slug">{t('settings.workspace.slug') || 'Workspace Identifier (Slug)'}</Label>
              <div className="flex items-center gap-2">
                <Input id="ws-slug" value={workspace?.slug ?? ''} readOnly className="bg-muted text-muted-foreground font-mono text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopySlug} title="Copy slug">
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-logo">{t('settings.workspace.logo') || 'Logo URL'}</Label>
              <Input id="ws-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-desc">{t('settings.workspace.description') || 'Description'}</Label>
              <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief description of this workspace" />
            </div>
          </div>
        </SettingsSection>
      </form>

      <SettingsSection
        title={t('settings.workspace.overview.title') || 'Workspace Overview'}
        description={t('settings.workspace.overview.description') || 'Operational metrics for this organization.'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{workspace?.project_count ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t('nav.sites') || 'Documentation Projects'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{workspace?.member_count ?? 1}</div>
              <div className="text-xs text-muted-foreground">{t('members.title') || 'Team Members'}</div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --filter=@cms/studio test workspace-general-tab.test.tsx`
Expected: PASS.

---

### Task 4: Workspace Members & Roles Tabs Components

**Files:**
- Create: `apps/studio/src/features/project-settings/components/workspace-members-tab.tsx`
- Create: `apps/studio/src/features/project-settings/components/workspace-roles-tab.tsx`

**Interfaces:**
- Consumes: `useMembers`, `useInviteMember`, `useUpdateMemberRole`, `useRemoveMember`, `WorkspaceRolesSection`
- Produces: `<WorkspaceMembersTab />`, `<WorkspaceRolesTab />`

- [ ] **Step 1: Implement `workspace-members-tab.tsx`**

Extract and embed the team management view (invite form, pending invites table, active members table with role selector) using existing hooks from `apps/studio/src/features/workspace/WorkspaceMembersPage.tsx`.

- [ ] **Step 2: Implement `workspace-roles-tab.tsx`**

Wrapper component that resolves `orgId` from `useMembers()` or projects query, and mounts `<WorkspaceRolesSection orgId={orgId} />`.

- [ ] **Step 3: Verify build in `@cms/studio`**

Run: `bun --filter=@cms/studio run typecheck`
Expected: 0 type errors.

---

### Task 5: Workspace Danger Zone Component

**Files:**
- Create: `apps/studio/src/features/project-settings/components/workspace-danger-tab.tsx`
- Create: `apps/studio/src/features/project-settings/components/workspace-danger-tab.test.tsx`

**Interfaces:**
- Consumes: `useTransferWorkspaceOwnership`, `useDeleteWorkspace`, `useMembers`, `useSession`, `SettingsSection`
- Produces: `<WorkspaceDangerTab />`

- [ ] **Step 1: Write failing unit test in `workspace-danger-tab.test.tsx`**

Verify that an Admin sees the disabled informational cards, and an Owner sees active dialog triggers.

- [ ] **Step 2: Implement `workspace-danger-tab.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cms/design-system/components/ui/dialog';
import { useT } from '@cms/i18n/react';
import { AlertTriangle, ShieldAlert, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/features/auth';
import { useMembers, useWorkspaceSettings } from '@/hooks/api';
import { useTransferWorkspaceOwnership, useDeleteWorkspace } from '../services/settings-api';
import { SettingsSection } from './section';

export function WorkspaceDangerTab() {
  const t = useT();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: rawMembers } = useMembers();
  const { data: workspace } = useWorkspaceSettings();

  const transferMutation = useTransferWorkspaceOwnership();
  const deleteMutation = useDeleteWorkspace();

  const members = (rawMembers as any)?.members ?? [];
  const currentMember = members.find(
    (m: any) => m.user?.id === session?.user?.id || m.user?.email === session?.user?.email
  );
  const isOwner = currentMember?.role === 'owner';

  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const eligibleTargets = members.filter((m: any) => m.id !== currentMember?.id && m.role !== 'owner');

  const handleTransfer = async () => {
    if (!selectedTargetId) return;
    try {
      await transferMutation.mutateAsync(selectedTargetId);
      toast.success(t('settings.workspace.transferSuccess') || 'Workspace ownership transferred successfully');
      setTransferOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
    }
  };

  const handleDelete = async () => {
    if (confirmName !== workspace?.name) {
      toast.error('Workspace name does not match');
      return;
    }
    try {
      await deleteMutation.mutateAsync();
      toast.success('Workspace deleted');
      setDeleteOpen(false);
      navigate({ to: '/app' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Transfer Ownership Card */}
      <SettingsSection
        title={t('settings.workspace.danger.transferTitle') || 'Transfer Workspace Ownership'}
        description={
          t('settings.workspace.danger.transferDesc') ||
          'Transfer ownership to another member. You will become an Admin and lose owner-level permissions.'
        }
        footer={
          isOwner ? (
            <Button variant="outline" onClick={() => setTransferOpen(true)} disabled={eligibleTargets.length === 0}>
              <UserCheck className="size-4 mr-2" />
              {t('settings.workspace.danger.transferBtn') || 'Transfer Ownership'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="size-4 text-amber-500" />
              Only the workspace owner can transfer ownership.
            </span>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {eligibleTargets.length === 0
            ? 'You must have at least one other workspace member before ownership can be transferred.'
            : 'Transferring ownership is immediate. Ensure the target member is trusted with workspace deletion rights.'}
        </p>
      </SettingsSection>

      {/* Delete Workspace Card */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              {t('settings.workspace.danger.deleteTitle') || 'Delete Workspace'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('settings.workspace.danger.deleteDesc') ||
                'Permanently remove this workspace, including all documentation projects, sites, and roles. This action cannot be undone.'}
            </p>
          </div>
          {isOwner ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              {t('settings.workspace.danger.deleteBtn') || 'Delete Workspace'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
              <ShieldAlert className="size-4 text-amber-500" />
              Only the workspace owner can delete the workspace.
            </span>
          )}
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Workspace Ownership</DialogTitle>
            <DialogDescription>
              Select an active workspace member to become the new owner. Your role will be changed to Admin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="target-member">Select Member</Label>
            <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
              <SelectTrigger id="target-member" className="w-full mt-1.5">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {eligibleTargets.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.user?.name || m.user?.email} ({m.user?.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={!selectedTargetId || transferMutation.isPending}>
              {transferMutation.isPending ? 'Transferring...' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Entire Workspace</DialogTitle>
            <DialogDescription>
              This is an irreversible destructive action. To confirm, type <strong>{workspace?.name}</strong> below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="confirm-ws-name">Type workspace name</Label>
            <Input
              id="confirm-ws-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspace?.name}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={confirmName !== workspace?.name || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Permanently Delete Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `bun --filter=@cms/studio test workspace-danger-tab.test.tsx`
Expected: PASS.

---

### Task 6: Integrate Role-Gated Groups in `WorkspaceSettingsPage`

**Files:**
- Modify: `apps/studio/src/features/project-settings/WorkspaceSettingsPage.tsx`
- Modify: `apps/studio/src/routes/app/(dashboard)/settings.tsx`
- Create: `apps/studio/src/features/project-settings/WorkspaceSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `canAdminister` from `@cms/shared/rbac`, `useSession`, `useMembers`, `WorkspaceGeneralTab`, `WorkspaceMembersTab`, `WorkspaceRolesTab`, `WorkspaceDangerTab`
- Produces: Updated `<WorkspaceSettingsPage />` with categorized sidebar

- [ ] **Step 1: Write test for role-based section gating in `WorkspaceSettingsPage.test.tsx`**

Test that standard members see only Account tabs, whereas Admins/Owners see Account and Workspace tabs.

- [ ] **Step 2: Update `WorkspaceSettingsPage.tsx`**

- Update `WorkspaceSettingsTab` union:
  `'account' | 'appearance' | 'workspace-general' | 'workspace-members' | 'workspace-roles' | 'workspace-danger'`.
- Define `ACCOUNT_SECTIONS` and `WORKSPACE_SECTIONS`.
- Resolve `currentRole` from `session` + `useMembers()`.
- Compute `isAdminOrOwner = canAdminister(currentRole)`.
- If tab starts with `workspace-` but `!isAdminOrOwner`, fallback content to `<AccountTab />`.
- Render grouped navigation on the left with group headings ("Account" and "Workspace").
- Mount respective tab component for the active tab.

- [ ] **Step 3: Update `apps/studio/src/routes/app/(dashboard)/settings.tsx`**

Ensure `validateSearch` supports the new tab strings.

- [ ] **Step 4: Run unit tests**

Run: `bun --filter=@cms/studio test WorkspaceSettingsPage.test.tsx`
Expected: PASS.

---

### Task 7: Full Monorepo Typecheck & Playwright Verification

**Files:**
- Verify: Full workspace

- [ ] **Step 1: Monorepo typecheck**

Run: `bun run typecheck`
Expected: Clean with 0 errors across packages and apps.

- [ ] **Step 2: Verify in browser on `http://localhost:4310/app/settings`**

Navigate through all tabs (`?tab=workspace-general`, `?tab=workspace-members`, `?tab=workspace-roles`, `?tab=workspace-danger`) and verify layout, styling, and interactions.
