# Modular Authorization System with Independent Custom Roles & Permissions Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entire authorization system in `cms-rs-3` to implement modular, defense-in-depth authorization with independent custom roles and 2D permission matrices per workspace and per project.

**Architecture:** Separation of concerns across crates: pure domain types and normalizers in `cms-entity`, trait-based single-query security context engine in `cms-authz`, declarative const-generic extractors in `cms-api`, invariant protection in `cms-biz`, and catalog-driven interactive matrix UI in `apps/studio` and `@cms/ui`.

**Tech Stack:** Rust (Axum, SQLx, PostgreSQL, serde, ts-rs), TypeScript/React (Vite, `@cms/ui`, TanStack Query, Tailwind CSS).

## Global Constraints

- Tenancy model is strictly internal company deployment (no billing, no marketing pages).
- All code, comments, and strings must be in English.
- Runtime for TypeScript is Bun (`bun run`, `bun test`, `bun run check`).
- Rust commands use `cargo test -p <crate>` and `cargo check --workspace`.
- Exact file paths and types must match the design specification in `docs/superpowers/specs/2026-10-07-authz-custom-roles-matrix-design.md`.

---

### Task 1: Database Migration for Custom Roles and Project Membership

**Files:**
- Create: `migrations/20260114000000_custom_roles_and_project_members.sql`
- Test: `tests/migration_test.rs` (or running existing migration suite)

**Interfaces:**
- Produces: PostgreSQL tables `"OrganizationRole"`, `"ProjectRole"`, `"ProjectMember"`, and partial unique indexes `organization_role_default_uq`, `project_role_default_uq`.

- [ ] **Step 1: Write the migration SQL file**

Create `migrations/20260114000000_custom_roles_and_project_members.sql`:
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

- [ ] **Step 2: Verify migration runs cleanly against database**

Run: `cargo test -p cms-db`
Expected: PASS (or verifies SQL syntax against pool)

- [ ] **Step 3: Commit migration**

```bash
git add migrations/20260114000000_custom_roles_and_project_members.sql
git commit -m "feat(db): add OrganizationRole, ProjectRole, and ProjectMember migration"
```

---

### Task 2: Pure Domain Types, 2D Matrix, and Normalization (`cms-entity`)

**Files:**
- Create: `crates/cms-entity/src/authz.rs`
- Modify: `crates/cms-entity/src/lib.rs`
- Test: `crates/cms-entity/tests/authz_matrix_test.rs`

**Interfaces:**
- Produces: `Action`, `WorkspaceResource`, `ProjectResource`, `WorkspacePermissions`, `ProjectPermissions`, `PermissionCatalog`, `PermissionCatalogResource`.

- [ ] **Step 1: Write failing unit tests for matrix operations**

Create `crates/cms-entity/tests/authz_matrix_test.rs`:
```rust
use cms_entity::authz::{Action, ProjectPermissions, ProjectResource, WorkspacePermissions, WorkspaceResource};

#[test]
fn test_project_matrix_normalization() {
    let raw = serde_json::json!({
        "pages": {
            "create": true,
            "read": true,
            "publish": true,
            "invalid_action": true
        },
        "danger_zone": {
            "read": true,
            "edit": true // unsupported on danger_zone
        },
        "unknown_resource": {
            "read": true
        }
    });

    let matrix = ProjectPermissions::normalize(raw);
    assert!(matrix.has_permission(ProjectResource::Pages, Action::Create));
    assert!(matrix.has_permission(ProjectResource::Pages, Action::Publish));
    assert!(matrix.has_permission(ProjectResource::DangerZone, Action::Read));
    // Unsupported action should be forced to false
    assert!(!matrix.has_permission(ProjectResource::DangerZone, Action::Edit));
}

#[test]
fn test_full_and_empty_matrices() {
    let full = ProjectPermissions::full();
    assert!(full.has_permission(ProjectResource::Pages, Action::Publish));
    assert!(full.has_permission(ProjectResource::Branches, Action::Delete));

    let empty = ProjectPermissions::empty();
    assert!(!empty.has_permission(ProjectResource::Pages, Action::Read));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-entity --test authz_matrix_test`
Expected: FAIL with module/types not found

- [ ] **Step 3: Implement `crates/cms-entity/src/authz.rs`**

```rust
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Create,
    Read,
    Edit,
    Delete,
    Publish,
}

impl Action {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Create),
            1 => Ok(Self::Read),
            2 => Ok(Self::Edit),
            3 => Ok(Self::Delete),
            4 => Ok(Self::Publish),
            _ => Err("Invalid action code"),
        }
    }
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

impl WorkspaceResource {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Projects),
            1 => Ok(Self::Members),
            2 => Ok(Self::Roles),
            3 => Ok(Self::ApiKeys),
            4 => Ok(Self::AuditLogs),
            5 => Ok(Self::Settings),
            6 => Ok(Self::DangerZone),
            _ => Err("Invalid workspace resource code"),
        }
    }

    pub fn supported_actions(&self) -> &'static [Action] {
        match self {
            Self::AuditLogs => &[Action::Read],
            Self::Settings => &[Action::Read, Action::Edit],
            Self::DangerZone => &[Action::Read, Action::Delete],
            _ => &[Action::Create, Action::Read, Action::Edit, Action::Delete],
        }
    }
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

impl ProjectResource {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Pages),
            1 => Ok(Self::Branches),
            2 => Ok(Self::Deployments),
            3 => Ok(Self::Domains),
            4 => Ok(Self::Openapi),
            5 => Ok(Self::Assets),
            6 => Ok(Self::Addons),
            7 => Ok(Self::Members),
            8 => Ok(Self::Roles),
            9 => Ok(Self::Analytics),
            10 => Ok(Self::Comments),
            11 => Ok(Self::DangerZone),
            _ => Err("Invalid project resource code"),
        }
    }

    pub fn supported_actions(&self) -> &'static [Action] {
        match self {
            Self::Pages => &[Action::Create, Action::Read, Action::Edit, Action::Delete, Action::Publish],
            Self::Deployments => &[Action::Create, Action::Read, Action::Delete, Action::Publish],
            Self::Analytics => &[Action::Read],
            Self::DangerZone => &[Action::Read, Action::Delete],
            _ => &[Action::Create, Action::Read, Action::Edit, Action::Delete],
        }
    }
}

pub type ResourcePermissions = HashMap<Action, bool>;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema, TS)]
pub struct ProjectPermissions(pub HashMap<ProjectResource, ResourcePermissions>);

impl ProjectPermissions {
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    pub fn full() -> Self {
        let mut map = HashMap::new();
        for res in [
            ProjectResource::Pages, ProjectResource::Branches, ProjectResource::Deployments,
            ProjectResource::Domains, ProjectResource::Openapi, ProjectResource::Assets,
            ProjectResource::Addons, ProjectResource::Members, ProjectResource::Roles,
            ProjectResource::Analytics, ProjectResource::Comments, ProjectResource::DangerZone,
        ] {
            let mut actions = HashMap::new();
            for act in res.supported_actions() {
                actions.insert(*act, true);
            }
            map.insert(res, actions);
        }
        Self(map)
    }

    pub fn has_permission(&self, resource: ProjectResource, action: Action) -> bool {
        self.0.get(&resource)
            .and_then(|acts| acts.get(&action))
            .copied()
            .unwrap_or(false)
    }

    pub fn normalize(raw: serde_json::Value) -> Self {
        let mut out = Self::empty();
        if let Some(obj) = raw.as_object() {
            for (res_str, acts_val) in obj {
                if let Ok(resource) = serde_json::from_value::<ProjectResource>(serde_json::Value::String(res_str.clone())) {
                    if let Some(acts_obj) = acts_val.as_object() {
                        let supported = resource.supported_actions();
                        let mut act_map = HashMap::new();
                        for (act_str, val) in acts_obj {
                            if let Ok(action) = serde_json::from_value::<Action>(serde_json::Value::String(act_str.clone())) {
                                if supported.contains(&action) {
                                    act_map.insert(action, val.as_bool().unwrap_or(false));
                                }
                            }
                        }
                        out.0.insert(resource, act_map);
                    }
                }
            }
        }
        out
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema, TS)]
pub struct WorkspacePermissions(pub HashMap<WorkspaceResource, ResourcePermissions>);

impl WorkspacePermissions {
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    pub fn full() -> Self {
        let mut map = HashMap::new();
        for res in [
            WorkspaceResource::Projects, WorkspaceResource::Members, WorkspaceResource::Roles,
            WorkspaceResource::ApiKeys, WorkspaceResource::AuditLogs, WorkspaceResource::Settings,
            WorkspaceResource::DangerZone,
        ] {
            let mut actions = HashMap::new();
            for act in res.supported_actions() {
                actions.insert(*act, true);
            }
            map.insert(res, actions);
        }
        Self(map)
    }

    pub fn has_permission(&self, resource: WorkspaceResource, action: Action) -> bool {
        self.0.get(&resource)
            .and_then(|acts| acts.get(&action))
            .copied()
            .unwrap_or(false)
    }

    pub fn normalize(raw: serde_json::Value) -> Self {
        let mut out = Self::empty();
        if let Some(obj) = raw.as_object() {
            for (res_str, acts_val) in obj {
                if let Ok(resource) = serde_json::from_value::<WorkspaceResource>(serde_json::Value::String(res_str.clone())) {
                    if let Some(acts_obj) = acts_val.as_object() {
                        let supported = resource.supported_actions();
                        let mut act_map = HashMap::new();
                        for (act_str, val) in acts_obj {
                            if let Ok(action) = serde_json::from_value::<Action>(serde_json::Value::String(act_str.clone())) {
                                if supported.contains(&action) {
                                    act_map.insert(action, val.as_bool().unwrap_or(false));
                                }
                            }
                        }
                        out.0.insert(resource, act_map);
                    }
                }
            }
        }
        out
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct PermissionCatalogResource<R> {
    pub key: R,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct PermissionCatalog<R> {
    pub resources: Vec<PermissionCatalogResource<R>>,
    pub actions: Vec<Action>,
}
```

Export `pub mod authz;` in `crates/cms-entity/src/lib.rs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p cms-entity --test authz_matrix_test`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add crates/cms-entity/src/authz.rs crates/cms-entity/src/lib.rs crates/cms-entity/tests/authz_matrix_test.rs
git commit -m "feat(entity): add strongly-typed authz resources, actions, and 2D permission matrices"
```

---

### Task 3: Database Query Models and Operations (`cms-db`)

**Files:**
- Create: `crates/cms-db/src/authz/mod.rs`, `crates/cms-db/src/authz/org_roles.rs`, `crates/cms-db/src/authz/project_roles.rs`, `crates/cms-db/src/authz/project_members.rs`
- Modify: `crates/cms-db/src/lib.rs`
- Test: `crates/cms-db/tests/authz_db_test.rs`

**Interfaces:**
- Produces: `OrgRoleQueries`, `ProjectRoleQueries`, `ProjectMemberQueries` for CRUD, usage counting, and atomic delete-with-reassign transactions.

- [ ] **Step 1: Write database query implementations**

Implement role CRUD and atomic delete queries with transaction:
- `OrgRoleQueries::create`, `get_by_id`, `list_by_org`, `get_default`, `count_usage`, `delete_with_reassign`.
- `ProjectRoleQueries::create`, `get_by_id`, `list_by_project`, `get_default`, `count_usage`, `delete_with_reassign`.
- `ProjectMemberQueries::create`, `get_by_user_and_project`, `list_by_project`, `update_role`, `remove`.

- [ ] **Step 2: Run cargo check on `cms-db`**

Run: `cargo check -p cms-db`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add crates/cms-db/src/authz/ crates/cms-db/src/lib.rs
git commit -m "feat(db): add OrgRole, ProjectRole, and ProjectMember queries"
```

---

### Task 4: Trait Refactoring & Evaluation Engine (`cms-authz`)

**Files:**
- Modify: `crates/cms-authz/src/lib.rs`
- Test: `crates/cms-authz/tests/authz_evaluation_test.rs`

**Interfaces:**
- Consumes: `cms_entity::authz::*`, `cms_db::authz::*`
- Produces: `Authz` trait with `get_workspace_context`, `get_project_context`, `require_workspace_permission`, `require_project_permission`, `WorkspaceSecurityContext`, `ProjectSecurityContext`, `ProductionAuthz`, `NoopAuthz`.

- [ ] **Step 1: Write unit tests for context evaluation and bypass**

Create `crates/cms-authz/tests/authz_evaluation_test.rs`:
```rust
use cms_authz::{NoopAuthz, Authz, WorkspaceSecurityContext, ProjectSecurityContext};
use cms_entity::authz::{Action, ProjectResource, WorkspaceResource};

#[tokio::test]
async fn test_noop_authz_passes_all_checks() {
    let authz = NoopAuthz;
    assert!(authz.require_project_permission("user1", "proj1", ProjectResource::Pages, Action::Publish).await.is_ok());
    assert!(authz.require_workspace_permission("user1", "org1", WorkspaceResource::Settings, Action::Edit).await.is_ok());
}
```

- [ ] **Step 2: Implement context structures and `ProductionAuthz` evaluation**

Update `crates/cms-authz/src/lib.rs`:
- Define `WorkspaceSecurityContext` and `ProjectSecurityContext` with `.can(...)` and `.require(...)`.
- Update `Authz` trait.
- Implement single-query `get_workspace_context` and `get_project_context` in `ProductionAuthz`.
- Implement `NoopAuthz` covering all new trait methods.

- [ ] **Step 3: Run tests in `cms-authz`**

Run: `cargo test -p cms-authz`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add crates/cms-authz/
git commit -m "feat(authz): refactor Authz trait with dual-domain single-query security context engine"
```

---

### Task 5: Domain Invariant Protection in Business Services (`cms-biz`)

**Files:**
- Modify: `crates/cms-biz/src/project.rs`, `crates/cms-biz/src/branch.rs`, `crates/cms-biz/src/page.rs`, `crates/cms-biz/src/comment.rs`
- Test: Existing tests in `crates/cms-biz`

**Interfaces:**
- Consumes: `Authz` trait methods, `ProjectSecurityContext`
- Ensures: Services enforce matrix invariants for critical actions before mutating state.

- [ ] **Step 1: Update `cms-biz` service methods to verify permissions**

- Update `PageService::publish` to assert `(ProjectResource::Pages, Action::Publish)`.
- Update `BranchService::delete` to assert `(ProjectResource::Branches, Action::Delete)`.
- Update `ProjectService::archive` and `delete` to assert `(ProjectResource::DangerZone, Action::Delete)`.

- [ ] **Step 2: Run `cms-biz` tests**

Run: `cargo test -p cms-biz`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add crates/cms-biz/
git commit -m "feat(biz): enforce authorization invariants in domain services"
```

---

### Task 6: Declarative Axum Extractors & Guards (`cms-api`)

**Files:**
- Create: `crates/cms-api/src/extractors/authz.rs`
- Modify: `crates/cms-api/src/extractors/mod.rs`
- Test: `crates/cms-api/tests/extractor_test.rs`

**Interfaces:**
- Produces: `ProjectAuth<const R: u8, const A: u8>`, `WorkspaceAuth<const R: u8, const A: u8>`.

- [ ] **Step 1: Implement `ProjectAuth` and `WorkspaceAuth` extractors**

Implement `FromRequestParts` parsing path parameters, retrieving `AppState`, authenticating user, resolving security context, asserting permission, and injecting `ProjectSecurityContext` / `WorkspaceSecurityContext`.

- [ ] **Step 2: Run `cargo check -p cms-api`**

Run: `cargo check -p cms-api`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add crates/cms-api/src/extractors/
git commit -m "feat(api): add declarative const-generic ProjectAuth and WorkspaceAuth extractors"
```

---

### Task 7: REST API Endpoints for Catalogs, Roles CRUD, and Project Membership (`cms-api`)

**Files:**
- Create: `crates/cms-api/src/authz/mod.rs`, `crates/cms-api/src/authz/handlers.rs`, `crates/cms-api/src/authz/routes.rs`
- Modify: `crates/cms-api/src/project/handlers/members.rs`, `crates/cms-api/src/project/mod.rs`, `crates/cms-api/src/lib.rs`
- Test: `crates/cms-api/tests/role_endpoints_test.rs`

**Interfaces:**
- Produces:
  - `GET /api/v1/permissions/catalog`
  - `/api/v1/workspaces/:org_id/roles` (GET, POST, PATCH, GET /usage, DELETE)
  - `/api/v1/projects/:project_id/roles` (GET, POST, PATCH, GET /usage, DELETE)
  - `/api/v1/projects/:project_id/members` wired to real `ProjectMember` table.

- [ ] **Step 1: Write integration test for role CRUD and deletion safety**

Create `crates/cms-api/tests/role_endpoints_test.rs`:
Verify creating a role, fetching catalogs, updating permissions, and asserting atomic reassign-on-delete.

- [ ] **Step 2: Implement handlers and route registration**

Implement endpoints in `crates/cms-api/src/authz/handlers.rs` and update `crates/cms-api/src/project/handlers/members.rs`.

- [ ] **Step 3: Run API tests**

Run: `cargo test -p cms-api`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add crates/cms-api/src/authz/ crates/cms-api/src/project/
git commit -m "feat(api): add permission catalog, role management endpoints, and project members"
```

---

### Task 8: Reusable Matrix & Role Editor Components (`@cms/ui`)

**Files:**
- Create: `packages/ui/src/components/permissions/PermissionMatrix.tsx`
- Create: `packages/ui/src/components/permissions/RoleEditorPanel.tsx`
- Modify: `packages/ui/src/components/permissions/index.ts`, `packages/ui/src/index.ts`
- Test: `packages/ui/src/components/permissions/PermissionMatrix.test.tsx`

**Interfaces:**
- Produces: `PermissionMatrix`, `RoleEditorPanel` components with tri-state column and group bulk toggles.

- [ ] **Step 1: Write component test for matrix rendering and tri-state toggles**

Create `packages/ui/src/components/permissions/PermissionMatrix.test.tsx`:
Test rendering resources, action columns, and check/dash indicators.

- [ ] **Step 2: Implement `PermissionMatrix` and `RoleEditorPanel`**

Port and adapt catalog-driven matrix and slide-over panel with category groupings and tri-state checkbox toggles.

- [ ] **Step 3: Run package test**

Run: `bun run --filter @cms/ui test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add packages/ui/src/components/permissions/ packages/ui/src/index.ts
git commit -m "feat(ui): add reusable PermissionMatrix and RoleEditorPanel components"
```

---

### Task 9: Studio Settings Integration (`apps/studio`)

**Files:**
- Create: `apps/studio/src/features/workspace/WorkspaceRolesSection.tsx`
- Modify: `apps/studio/src/features/workspace/WorkspaceMembersPage.tsx`
- Modify: `apps/studio/src/features/project-settings/components/members-section.tsx`
- Modify: `packages/sdk/src/resources/roles.ts` (API client endpoints)

**Interfaces:**
- Consumes: `@cms/ui` permission components, role endpoints from `@cms/sdk`.
- Produces: Integrated Roles tabs in `/app/settings` and `/app/projects/$projectId/settings`.

- [ ] **Step 1: Add SDK resources for roles & catalogs**

Implement `getPermissionCatalog`, `listWorkspaceRoles`, `createWorkspaceRole`, `listProjectRoles`, `createProjectRole`, etc. in `@cms/sdk`.

- [ ] **Step 2: Integrate into Workspace and Project Settings**

Add role listing, creation drawer, and role selector to `members-section.tsx` and workspace settings.

- [ ] **Step 3: Run Studio build and test**

Run: `bun run --filter @cms/studio check`
Expected: PASS with 0 lint/format/type errors.

- [ ] **Step 4: Commit changes**

```bash
git add apps/studio/ packages/sdk/
git commit -m "feat(studio): integrate custom roles and permission matrix into settings pages"
```
