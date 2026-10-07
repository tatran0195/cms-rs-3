# Design Specification: Modular Authorization System with Independent Custom Roles & Permissions Matrix

- **Date**: 2026-10-07
- **Target Platform**: `cms-rs-3` (Axum / SQLx / PostgreSQL + React / Vite / Studio)
- **Status**: Approved by User

---

## 1. Motivation & Context

In `cms-rs-3`, the authorization system currently relies on a coarse 4-tier enum (`MemberRole`: `Owner > Admin > Member > Guest`) scoped strictly to top-level `Organization` records. A dedicated `ProjectMember` table does not exist in PostgreSQL, forcing project role checks to proxy directly to organization membership. As a consequence, organization members inherit blanket access to all projects, and granular project-specific or custom roles cannot be defined.

Studying `itsaplan` reveals an effective pattern:
1. Roles are modeled as **2D permission matrices** (Resources × Actions) stored as JSONB.
2. Normalized in-memory structures coerce raw data into strict boolean sets with unsupported actions masked out.
3. Fast single-query resolution resolves user context and membership in a single join.
4. Administrative bypass grants owners unconditional access.
5. Dynamic catalogs decouple frontend matrix forms from hardcoded backend rules.
6. Atomic reassignment guards role deletion when in active use.

For `cms-rs-3`, the platform requires **Strict Dual-Domain Isolation**: custom roles must be definable and manageable per Workspace (Organization) and per Project **independently**.

---

## 2. Architecture & Tenancy Model

The system separates authorization into two independent domains:

```
┌────────────────────────────────────────────────────────┐
│               WORKSPACE DOMAIN (Organization)           │
│                                                        │
│   "OrganizationRole"                   "Member"        │
│   ├── id (UUID)                        ├── user_id     │
│   ├── organization_id                  ├── org_id      │
│   ├── name                             ├── role (enum) │
│   ├── is_default                       └── role_id ────┼─┐
│   └── permissions (JSONB)                              │ │
│                                                        │ │
└────────────────────────────────────────────────────────┘ │
                                                           │
┌────────────────────────────────────────────────────────┐ │
│                    PROJECT DOMAIN                      │ │
│                                                        │ │
│   "ProjectRole"                    "ProjectMember"     │ │
│   ├── id (UUID)                    ├── user_id         │ │
│   ├── project_id                   ├── project_id      │ │
│   ├── name                         ├── role (owner/mbr)│ │
│   ├── is_default                   └── role_id ────────┼─┼─┐
│   └── permissions (JSONB)                              │ │ │
│                                                        │ │ │
└────────────────────────────────────────────────────────┘ │ │
                                                           ▼ ▼
                                               Independent Evaluation
```

1. **Workspace Scope**: Controls workspace-level resources (`projects`, `members`, `roles`, `api_keys`, `audit_logs`, `settings`, `danger_zone`).
2. **Project Scope**: Controls project-specific resources (`pages`, `branches`, `deployments`, `domains`, `openapi`, `assets`, `addons`, `members`, `roles`, `analytics`, `comments`, `danger_zone`).
3. **Administrative Hierarchy**:
   - Organization Owners (`Member.role == 'OWNER'`) and System Admins bypass both Workspace and Project matrices with full administrative rights (`is_owner = true`).
   - Project Owners (`ProjectMember.role == 'owner'`) bypass the Project role matrix with full project rights.
   - Project Collaborators (`ProjectMember.role == 'member'`) evaluate their assigned `ProjectRole.permissions` (or fallback to the project's default role).

---

## 3. Database Schema (PostgreSQL Migration)

Migration file: `migrations/20260114000000_custom_roles_and_project_members.sql`

```sql
-- 1. Workspace Custom Roles
CREATE TABLE IF NOT EXISTS "OrganizationRole" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_role_default_uq" 
    ON "OrganizationRole"(organization_id) 
    WHERE is_default = true;

ALTER TABLE "Member" 
    ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES "OrganizationRole"(id) ON DELETE SET NULL;

-- 2. Project Custom Roles
CREATE TABLE IF NOT EXISTS "ProjectRole" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_role_default_uq" 
    ON "ProjectRole"(project_id) 
    WHERE is_default = true;

-- 3. Project Membership
CREATE TABLE IF NOT EXISTS "ProjectMember" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    role_id TEXT REFERENCES "ProjectRole"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS "project_member_user_idx" ON "ProjectMember"(user_id);
CREATE INDEX IF NOT EXISTS "project_member_project_idx" ON "ProjectMember"(project_id);
```

---

## 4. Domain Types & Matrix Normalization (`cms-entity`)

Implemented in `crates/cms-entity/src/authz.rs`:

### 4.1. Resources & Actions
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Create,
    Read,
    Edit,
    Delete,
    Publish,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceResource {
    Projects,
    Members,
    Roles,
    ApiKeys,
    AuditLogs,
    Settings,
    DangerZone,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectResource {
    Pages,
    Branches,
    Deployments,
    Domains,
    Openapi,
    Assets,
    Addons,
    Members,
    Roles,
    Analytics,
    Comments,
    DangerZone,
}
```

### 4.2. Action Subsets (Sparse Masking)
```rust
pub fn supported_project_actions(resource: ProjectResource) -> &'static [Action] {
    match resource {
        ProjectResource::Pages => &[Action::Create, Action::Read, Action::Edit, Action::Delete, Action::Publish],
        ProjectResource::Deployments => &[Action::Create, Action::Read, Action::Delete, Action::Publish],
        ProjectResource::DangerZone => &[Action::Read, Action::Delete],
        ProjectResource::Analytics => &[Action::Read],
        _ => &[Action::Create, Action::Read, Action::Edit, Action::Delete],
    }
}
```

### 4.3. Normalization Rules
1. Non-boolean values are coerced to booleans (`true` or `false`).
2. Actions not supported by the resource are forced to `false`.
3. Unknown resource keys or action keys are discarded.
4. Missing keys are defaulted to `false`.

---

## 5. Evaluation Engine & Trait Architecture (`cms-authz`)

Implemented in `crates/cms-authz`:

### 5.1. Security Context Objects
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSecurityContext {
    pub user_id: UserId,
    pub org_id: OrgId,
    pub is_owner: bool,
    pub role_id: Option<String>,
    pub permissions: WorkspacePermissions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSecurityContext {
    pub user_id: UserId,
    pub project_id: ProjectId,
    pub org_id: OrgId,
    pub is_owner: bool,
    pub role_id: Option<String>,
    pub permissions: ProjectPermissions,
}
```

### 5.2. Resolution Pipeline
1. **`get_workspace_context(user_id, org_id)`**:
   - Single SQL query joining `Member` with `OrganizationRole`.
   - If `Member.role == 'OWNER'` or user is System Admin $\rightarrow$ `is_owner = true`, `permissions = WorkspacePermissions::full()`.
   - Else $\rightarrow$ normalizes `OrganizationRole.permissions` (or queries workspace default role).
2. **`get_project_context(user_id, project_id)`**:
   - Single SQL query verifying `Project.organization_id`, org standing, and `ProjectMember` joined with `ProjectRole`.
   - If user is Org Owner or System Admin $\rightarrow$ `is_owner = true`, `full()`.
   - If user has `ProjectMember.role == 'owner'` $\rightarrow$ `is_owner = true`, `full()`.
   - If user has `ProjectMember.role == 'member'` $\rightarrow$ normalizes `ProjectRole.permissions` (or project default role).
   - If user has no `ProjectMember` row $\rightarrow$ returns `403 Forbidden`.

---

## 6. Defense-in-Depth Enforcement (`cms-api` & `cms-biz`)

### 6.1. Edge Boundary (Axum Extractors in `cms-api`)
```rust
// Axum typed extractor
pub struct ProjectAuth<const R: u8, const A: u8>(pub ProjectSecurityContext);
pub struct WorkspaceAuth<const R: u8, const A: u8>(pub WorkspaceSecurityContext);
```
Handlers declare required permissions via const generic parameters:
```rust
pub async fn create_page_handler(
    State(state): State<Arc<AppState>>,
    ProjectAuth(ctx): ProjectAuth<{ ProjectResource::Pages as u8 }, { Action::Create as u8 }>,
    Json(body): Json<CreatePageRequest>,
) -> Result<Json<ApiResponse<PageResponse>>, AppError> {
    let page = state.biz_context.page_service.create(&ctx, body).await?;
    Ok(Json(ApiResponse::new(page)))
}
```

### 6.2. Domain Invariant Protection (`cms-biz`)
Services take `&SecurityContext` or call `ctx.authz.require_*` before executing state modifications:
- `PageService::publish`: asserts `(ProjectResource::Pages, Action::Publish)`.
- `BranchService::delete`: asserts `(ProjectResource::Branches, Action::Delete)`.
- `DomainService::verify`: asserts `(ProjectResource::Domains, Action::Edit)`.

---

## 7. REST API Surface

### 7.1. Catalogs
- `GET /api/v1/permissions/catalog` $\rightarrow$ returns dynamic catalog for workspace and project matrices.

### 7.2. Workspace Roles (`/api/v1/workspaces/:org_id/roles`)
- `GET /` $\rightarrow$ list workspace roles.
- `POST /` $\rightarrow$ create workspace role. Guarded by `(WorkspaceResource::Roles, Action::Create)`.
- `PATCH /:role_id` $\rightarrow$ update workspace role. Guarded by `(WorkspaceResource::Roles, Action::Edit)`.
- `GET /:role_id/usage` $\rightarrow$ returns member usage count.
- `DELETE /:role_id?target_role_id=...` $\rightarrow$ atomic reassign + delete. Default role cannot be deleted.

### 7.3. Project Roles (`/api/v1/projects/:project_id/roles`)
- `GET /` $\rightarrow$ list project roles.
- `POST /` $\rightarrow$ create project role. Guarded by `(ProjectResource::Roles, Action::Create)`.
- `PATCH /:role_id` $\rightarrow$ update project role. Guarded by `(ProjectResource::Roles, Action::Edit)`.
- `GET /:role_id/usage` $\rightarrow$ returns member usage count.
- `DELETE /:role_id?target_role_id=...` $\rightarrow$ atomic reassign + delete. Default role cannot be deleted.

### 7.4. Project Membership (`/api/v1/projects/:project_id/members`)
- Backed by the real `ProjectMember` table with full role assignment support.

---

## 8. Studio Frontend UI (`apps/studio` & `@cms/ui`)

1. **`PermissionMatrix`**:
   - Reusable read-only table displaying check / dash icons grouped by category.
2. **`RoleEditorPanel`**:
   - Slide-over drawer with role name, description, default flag toggle, and interactive matrix.
   - Tri-state column bulk toggles (toggle action across all resources).
   - Tri-state row group bulk toggles (toggle all actions for a category).
3. **Route Integration**:
   - `/app/settings` $\rightarrow$ new tab `Roles` for workspace roles.
   - `/app/projects/$projectId/settings` $\rightarrow$ updated `Members & Roles` section.
