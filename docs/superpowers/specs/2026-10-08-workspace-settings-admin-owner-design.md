# Design: Workspace Settings Area for Admin and Owner

**Date**: 2026-10-08  
**Scope**: `apps/studio`, `crates/cms-api`, `packages/sdk`, `packages/shared`

---

## 1. Context & Motivation

Currently in `apps/studio`, navigating to `/app/settings` renders `WorkspaceSettingsPage`, which exclusively displays personal user preferences:
- `account` (User profile, email, password)
- `appearance` (Theme, font, display options)

There is no dedicated administrative settings area for workspace-level governance (Workspace Name/Logo, Members, Roles, Danger Zone). While `/app/members` exists as a standalone route, it is disconnected from the main settings navigation, and workspace general configuration and danger zone actions lack a dedicated UI.

This feature introduces a role-aware **Workspace Settings** section into `/app/settings`, accessible exclusively to Workspace `Admin` and `Owner` members, while preserving the standard `Account` section for all team members.

---

## 2. Navigation & Architecture

### 2.1 Sidebar Organization
In `WorkspaceSettingsPage.tsx`, the settings navigation is structured into two labeled groups:

1. **Account** *(Visible to all authenticated users)*:
   - `account` (`settings.tab.account`): User profile, email change, password update, OTP.
   - `appearance` (`settings.tab.appearance`): Light/dark theme toggle, typography settings.

2. **Workspace** *(Visible only when `canAdminister(currentRole)` is true)*:
   - `workspace-general` (`settings.tab.workspaceGeneral`): Workspace name, slug, description, logo, and overview metrics.
   - `workspace-members` (`settings.tab.workspaceMembers`): Team members list, role changes, member removal, and pending invitations.
   - `workspace-roles` (`settings.tab.workspaceRoles`): Custom workspace roles and 2D permission matrix editor.
   - `workspace-danger` (`settings.tab.workspaceDanger`): Transfer workspace ownership and delete workspace.

### 2.2 Route & Tab Types
The `WorkspaceSettingsTab` type in `apps/studio` expands to:
```typescript
export type WorkspaceSettingsTab =
  | 'account'
  | 'appearance'
  | 'workspace-general'
  | 'workspace-members'
  | 'workspace-roles'
  | 'workspace-danger';
```

Route search param validation in `apps/studio/src/routes/app/(dashboard)/settings.tsx`:
```typescript
export const Route = createFileRoute('/app/(dashboard)/settings')({
  component: WorkspaceSettingsRoute,
  validateSearch: (search: Record<string, unknown>): { tab: WorkspaceSettingsTab } => ({
    tab: isWorkspaceSettingsTab(search.tab) ? search.tab : 'account',
  }),
});
```

### 2.3 Access Control & Role Resolution
- The current user's role in the organization is determined reactively:
  ```typescript
  const { data: session } = useSession();
  const { data: rawMembers } = useMembers();
  const currentMember = rawMembers?.members?.find(
    (m) => m.user.id === session?.user?.id || m.user.email === session?.user?.email
  );
  const currentRole = currentMember?.role ?? 'member';
  const isAdminOrOwner = canAdminister(currentRole);
  const isOwner = currentRole === 'owner';
  ```
- If a non-administrative user directly navigates to any `workspace-*` tab via URL, the component automatically falls back to rendering `account`.

---

## 3. Frontend Component Specifications

### 3.1 Workspace General Tab (`WorkspaceGeneralTab.tsx`)
- **Card 1: Workspace Profile**:
  - `name`: Text input, required.
  - `slug`: Read-only identifier with click-to-copy button.
  - `description`: Textarea, optional.
  - `logo` / `logoUrl`: Image input with avatar preview.
  - Save action invokes `useUpdateWorkspaceSettings()`.
- **Card 2: Workspace Overview**:
  - Displays project count and active member count from `useWorkspaceSettings()`.

### 3.2 Workspace Members Tab (`WorkspaceMembersTab.tsx`)
- **Invite Member Section**:
  - Email input with regex validation.
  - Role dropdown selector (`Member`, `Admin`, or custom workspace roles).
  - Submit button triggers `useInviteMember()` with toast notification.
- **Pending Invitations Table**:
  - Displays recipient email, role, pending badge, and cancel action via `useCancelWorkspaceInvitation()`.
- **Active Members Table**:
  - Displays member name, avatar, email, joined date, and role badge.
  - Role selector dropdown: allows promoting/demoting members according to `canAssignRole(currentRole, targetRole)`.
  - Remove member button: opens a confirmation dialog (disabled for current user and the workspace owner).

### 3.3 Workspace Roles Tab (`WorkspaceRolesTab.tsx`)
- Embeds `WorkspaceRolesSection` passing `orgId`.
- Lists built-in and custom workspace roles.
- Allows creating, editing, and deleting custom roles using `RoleEditorPanel` with the 2D workspace permission matrix (`Projects`, `Members`, `Roles`, `ApiKeys`, `AuditLogs`, `Settings`, `DangerZone`).

### 3.4 Workspace Danger Zone Tab (`WorkspaceDangerTab.tsx`)
- **Card 1: Transfer Ownership**:
  - Explains the implications of ownership transfer.
  - Member selector dropdown listing active workspace members (excluding the current owner).
  - Confirmation dialog with explicit confirmation prompt.
  - **Owner Guard**: Active and executable for `Owner`. For `Admin`, renders in an informational disabled state: *"Only the workspace owner can transfer ownership."*
- **Card 2: Delete Workspace**:
  - Red-bordered destructive card explaining permanent deletion of all projects, sites, and documents.
  - Trigger button opens modal requiring typing the exact workspace name to confirm.
  - **Owner Guard**: Active and executable for `Owner`. For `Admin`, renders in an informational disabled state: *"Only the workspace owner can delete the workspace."*

---

## 4. Backend Endpoints & API Data Flow

### 4.1 Endpoints in `crates/cms-api/src/workspace/`
1. `GET /api/app/workspace`:
   - Returns `WorkspaceSettingsResponse` with `name`, `slug`, `project_count`, `member_count`.
2. `PATCH /api/app/workspace`:
   - Accepts `UpdateWorkspaceSettingsRequest` (`name`, `description`, `logo`).
   - Requires caller to be an organization member with admin privilege.
3. `POST /api/app/workspace/transfer-ownership`:
   - Accepts `{ "memberId": string }`.
   - Requires caller to be the organization `Owner` (`ctx.authz.require_org_owner(&auth.user.id, &org_id)`).
   - Atomically updates target member's role to `Owner` and current owner to `Admin`.
4. `DELETE /api/app/workspace`:
   - Requires caller to be the organization `Owner` (`ctx.authz.require_org_owner(&auth.user.id, &org_id)`).
   - Calls `OrgService::delete_organization(&state.biz_context, &auth.user.id, &org_id)`.

### 4.2 SDK Additions in `packages/sdk/src/resources/workspace.ts`
- `transferOwnership(memberId: string): Promise<{ success: boolean }>`
- `delete(): Promise<{ success: boolean }>`

### 4.3 Studio API Mutations in `settings-api.ts`
- `useTransferWorkspaceOwnership()`: Calls SDK `workspace.transferOwnership` and invalidates `queryKeys.members.all()`.
- `useDeleteWorkspace()`: Calls SDK `workspace.delete()`, clears cache, and navigates to `/sign-in` or `/app`.

---

## 5. Error Handling & Invariants

1. **Role Enforcement**:
   - Backend returns `403 Forbidden` (`AppError::Forbidden`) for non-owners attempting destructive or transfer operations.
   - Frontend prevents access by disabling controls and redirecting non-admin users to `tab=account`.
2. **Self-Demotion / Disconnect Safeguards**:
   - A workspace must always retain exactly one owner.
   - Owners cannot remove themselves or demote themselves without transferring ownership.
3. **Form Validation**:
   - Workspace name cannot be blank.
   - Destructive deletion requires typing the exact workspace name.

---

## 6. Testing Strategy

1. **Unit & Component Tests**:
   - `WorkspaceSettingsPage.test.tsx`:
     - Test that standard members only see the Account group (`account`, `appearance`).
     - Test that Admin and Owner see both Account and Workspace groups.
     - Test fallback redirect when a member accesses `tab=workspace-general`.
   - `WorkspaceGeneralTab.test.tsx`: Form submission and cache updates.
   - `WorkspaceDangerTab.test.tsx`: Owner actions vs Admin disabled state.
2. **Backend Tests**:
   - `transfer_workspace_ownership_handler`: Owner success, admin forbidden, non-member rejection.
   - `delete_workspace_handler`: Owner success, admin forbidden.
3. **E2E / Browser Verification**:
   - Navigate to `/app/settings` on `localhost:4310`.
   - Verify layout, tab switching, and reactive updates for all tabs.
