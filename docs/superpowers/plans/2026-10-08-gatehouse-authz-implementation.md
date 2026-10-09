# Gatehouse Authorization Engine Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy custom authz with the in-process Gatehouse authorization engine (`thepartly/gatehouse`) across `cms-rs-3`, introducing strongly typed Platform and Project policy domains, database-backed FactSource caching, and snapshot-first Axum route authorization.

**Architecture:** Copy the Gatehouse engine source from `target/temp-gatehouse/src` directly into `crates/cms-authz`. Define `PlatformDomain` and `ProjectDomain` policies with `DbProjectRelationshipSource` fact loading. Embed `GatehouseState` into shared `AppState`, refactor `cms-biz` and `cms-api` handlers to authorize loaded immutable snapshots instead of speculative extractors, and eliminate legacy workspace/org authz constructs.

**Tech Stack:** Rust (edition 2021, rust-version 1.82+), Axum 0.8, Gatehouse (`crates/cms-authz`), SQLx / PostgreSQL (`cms-db`), Tokio, Async-trait.

## Global Constraints
- Internal company platform deployment: No billing, plan tiers, or pricing features.
- Remove legacy authz abstractions: `TenantContext`, `WorkspaceSecurityContext`, `ProjectSecurityContext`, `WorkspacePermissions`, `WorkspaceResource`, and `require_org_*`.
- Idiomatic Gatehouse design: Snapshot authorization only (resource loaded before authz), no speculative permission checks.
- Zero compile errors across the entire Rust workspace (`cargo check --workspace`).

---

### Task 1: Replace `crates/cms-authz` with Gatehouse Engine Source

**Files:**
- Modify: `crates/cms-authz/Cargo.toml`
- Overwrite/Create: `crates/cms-authz/src/*` (copied from `target/temp-gatehouse/src/`)
- Verify: `cargo test -p cms-authz`

**Interfaces:**
- Consumes: `target/temp-gatehouse/src/` engine files.
- Produces: `cms_authz::PolicyDomain`, `cms_authz::PermissionChecker`, `cms_authz::PolicyBuilder`, `cms_authz::RebacPolicy`, `cms_authz::FactSource`, `cms_authz::FactRegistry`, `cms_authz::EvaluationSession`, `cms_authz::AccessError`, `cms_authz::RelationshipQuery`, `cms_authz::FactLoadResult`.

- [ ] **Step 1: Update `crates/cms-authz/Cargo.toml` with Gatehouse dependencies**

Update `crates/cms-authz/Cargo.toml` to declare dependencies required by Gatehouse while preserving workspace integration:

```toml
[package]
name = "cms-authz"
version = "0.1.0"
edition = "2021"
rust-version = "1.82"

[dependencies]
async-trait = { workspace = true }
futures-channel = "0.3"
tracing = { workspace = true }
serde = { workspace = true, features = ["derive"] }
sqlx = { workspace = true }
cms-db = { path = "../cms-db" }
cms-entity = { path = "../cms-entity" }
cms-error = { path = "../cms-error" }

[dev-dependencies]
tokio = { workspace = true, features = ["full", "test-util"] }
serde_json = { workspace = true }
uuid = { workspace = true }
chrono = { workspace = true }

[lints]
workspace = true
```

- [ ] **Step 2: Copy Gatehouse engine source files from `target/temp-gatehouse/src/` to `crates/cms-authz/src/`**

Run shell command to copy all engine modules:
```powershell
Copy-Item -Path "target/temp-gatehouse/src/*" -Destination "crates/cms-authz/src/" -Recurse -Force
```

- [ ] **Step 3: Verify Gatehouse engine compiles and passes internal unit tests**

Run: `cargo test -p cms-authz --lib`
Expected: Gatehouse internal engine unit tests compile and pass.

- [ ] **Step 4: Commit engine import**

```bash
git add crates/cms-authz/
git commit -m "feat(authz): import gatehouse authorization engine core"
```

---

### Task 2: Implement Platform and Project Policy Domains & FactSource

**Files:**
- Create: `crates/cms-authz/src/domains/mod.rs`
- Create: `crates/cms-authz/src/domains/platform.rs`
- Create: `crates/cms-authz/src/domains/project.rs`
- Create: `crates/cms-authz/src/domains/state.rs`
- Create: `crates/cms-authz/tests/domains_test.rs`
- Modify: `crates/cms-authz/src/lib.rs`

**Interfaces:**
- Consumes: Gatehouse engine types (`PolicyDomain`, `PolicyBuilder`, `RebacPolicy`, `FactSource`, `FactRegistry`, `PermissionChecker`, `RelationshipQuery`, `FactLoadResult`), `cms_db::PgPool`.
- Produces:
  - `cms_authz::AuthUser`
  - `cms_authz::PlatformDomain`, `cms_authz::PlatformAction`, `cms_authz::build_platform_checker`
  - `cms_authz::ProjectDomain`, `cms_authz::ProjectAction`, `cms_authz::ProjectTarget`, `cms_authz::ProjectRelation`, `cms_authz::ProjectRelationship`, `cms_authz::DbProjectRelationshipSource`, `cms_authz::build_project_checker`
  - `cms_authz::GatehouseState`

- [ ] **Step 1: Write failing integration test in `crates/cms-authz/tests/domains_test.rs`**

```rust
use std::sync::Arc;
use cms_authz::{
    build_platform_checker, build_project_checker, AuthUser, EvaluationSession,
    PlatformAction, ProjectAction, ProjectRelation, ProjectRelationship, ProjectTarget,
    FactLoadResult, FactRegistry, FactSource, async_trait,
};

struct MockProjectRelationshipSource;

#[async_trait]
impl FactSource<ProjectRelationship> for MockProjectRelationshipSource {
    async fn load_many(&self, keys: &[ProjectRelationship]) -> Vec<FactLoadResult<bool>> {
        keys.iter()
            .map(|key| {
                let is_member = key.subject_id == "editor-user" && key.resource_id == "proj-1" && key.relation == ProjectRelation::Editor;
                FactLoadResult::Found(is_member)
            })
            .collect()
    }
}

#[tokio::test]
async fn test_platform_admin_policy() {
    let checker = build_platform_checker();
    let session = EvaluationSession::empty();

    let admin = AuthUser {
        id: "admin-1".to_string(),
        email: "admin@company.com".to_string(),
        is_admin: true,
    };
    let normal_user = AuthUser {
        id: "user-1".to_string(),
        email: "user@company.com".to_string(),
        is_admin: false,
    };

    // Admin allowed to manage users
    assert!(checker.bind(&session, &admin, &PlatformAction::ManageUsers, &()).authorize(&()).await.is_ok());

    // Normal user forbidden from managing users
    assert!(checker.bind(&session, &normal_user, &PlatformAction::ManageUsers, &()).authorize(&()).await.is_err());

    // Normal user allowed to create project
    assert!(checker.bind(&session, &normal_user, &PlatformAction::CreateProject, &()).authorize(&()).await.is_ok());
}

#[tokio::test]
async fn test_project_domain_policies() {
    let checker = build_project_checker();
    let registry = FactRegistry::builder()
        .with_arc::<ProjectRelationship>(Arc::new(MockProjectRelationshipSource))
        .build();
    let session = registry.session();

    let admin = AuthUser {
        id: "admin-1".to_string(),
        email: "admin@company.com".to_string(),
        is_admin: true,
    };
    let editor = AuthUser {
        id: "editor-user".to_string(),
        email: "editor@company.com".to_string(),
        is_admin: false,
    };
    let stranger = AuthUser {
        id: "stranger".to_string(),
        email: "stranger@company.com".to_string(),
        is_admin: false,
    };

    let target = ProjectTarget {
        id: "proj-1".to_string(),
        is_public: false,
        owner_id: Some("owner-1".to_string()),
    };

    // Admin override grants view and delete
    assert!(checker.bind(&session, &admin, &ProjectAction::Delete, &()).authorize(&target).await.is_ok());

    // Editor grants Edit but not Delete
    assert!(checker.bind(&session, &editor, &ProjectAction::Edit, &()).authorize(&target).await.is_ok());
    assert!(checker.bind(&session, &editor, &ProjectAction::Delete, &()).authorize(&target).await.is_err());

    // Stranger forbidden on private project
    assert!(checker.bind(&session, &stranger, &ProjectAction::View, &()).authorize(&target).await.is_err());

    // Stranger allowed to view public project
    let public_target = ProjectTarget {
        id: "proj-public".to_string(),
        is_public: true,
        owner_id: Some("owner-1".to_string()),
    };
    assert!(checker.bind(&session, &stranger, &ProjectAction::View, &()).authorize(&public_target).await.is_ok());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-authz --test domains_test`
Expected: FAIL (modules and types not found).

- [ ] **Step 3: Implement `PlatformDomain` in `crates/cms-authz/src/domains/platform.rs`**

```rust
use crate::{
    builder::PolicyBuilder,
    checker::PermissionChecker,
    policy::{Policy, PolicyDomain},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub is_admin: bool,
}

pub struct PlatformDomain;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PlatformAction {
    AccessAdmin,
    ManageUsers,
    ManageSystemSettings,
    ViewAuditLogs,
    CreateProject,
}

impl PolicyDomain for PlatformDomain {
    type Subject = AuthUser;
    type Action = PlatformAction;
    type Resource = ();
    type Context = ();
}

pub fn admin_only_policy() -> Box<dyn Policy<PlatformDomain>> {
    PolicyBuilder::<PlatformDomain>::new("AdminOnlyPolicy")
        .subjects(|user: &AuthUser| user.is_admin)
        .build()
}

pub fn user_project_creation_policy() -> Box<dyn Policy<PlatformDomain>> {
    PolicyBuilder::<PlatformDomain>::new("UserProjectCreationPolicy")
        .actions(|action: &PlatformAction| matches!(action, PlatformAction::CreateProject))
        .build()
}

pub fn build_platform_checker() -> PermissionChecker<PlatformDomain> {
    let mut checker = PermissionChecker::named("PlatformChecker");
    checker.add_policy(admin_only_policy());
    checker.add_policy(user_project_creation_policy());
    checker
}
```

- [ ] **Step 4: Implement `ProjectDomain` & FactSource in `crates/cms-authz/src/domains/project.rs`**

```rust
use std::fmt;
use async_trait::async_trait;
use sqlx::{PgPool, Row};

use crate::{
    builder::PolicyBuilder,
    checker::PermissionChecker,
    combinators::PolicyExt,
    facts::{FactLoadResult, FactSource},
    policies::rebac::{RebacPolicy, RelationshipQuery},
    policy::{Policy, PolicyDomain},
};

use super::platform::AuthUser;

pub struct ProjectDomain;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProjectAction {
    View,
    Edit,
    Publish,
    Delete,
    ManageMembers,
    ManageSettings,
}

#[derive(Debug, Clone)]
pub struct ProjectTarget {
    pub id: String,
    pub is_public: bool,
    pub owner_id: Option<String>,
}

impl PolicyDomain for ProjectDomain {
    type Subject = AuthUser;
    type Action = ProjectAction;
    type Resource = ProjectTarget;
    type Context = ();
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProjectRelation {
    Owner,
    Editor,
    Viewer,
}

impl fmt::Display for ProjectRelation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Owner => f.write_str("owner"),
            Self::Editor => f.write_str("editor"),
            Self::Viewer => f.write_str("viewer"),
        }
    }
}

pub type ProjectRelationship = RelationshipQuery<String, String, ProjectRelation>;

pub struct DbProjectRelationshipSource {
    pool: PgPool,
}

impl DbProjectRelationshipSource {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl FactSource<ProjectRelationship> for DbProjectRelationshipSource {
    async fn load_many(&self, keys: &[ProjectRelationship]) -> Vec<FactLoadResult<bool>> {
        if keys.is_empty() {
            return Vec::new();
        }

        // Query Project and Member join to check role relationship
        let mut results = Vec::with_capacity(keys.len());
        for key in keys {
            let role_opt: Result<Option<String>, _> = sqlx::query_scalar(
                r#"
                SELECT m.role::text
                FROM "Project" p
                JOIN "Member" m ON p.organization_id = m.organization_id
                WHERE p.id = $1 AND m.user_id = $2
                LIMIT 1
                "#,
            )
            .bind(&key.resource_id)
            .bind(&key.subject_id)
            .fetch_optional(&self.pool)
            .await;

            match role_opt {
                Ok(Some(role)) => {
                    let has_relation = match key.relation {
                        ProjectRelation::Owner => role.eq_ignore_ascii_case("owner"),
                        ProjectRelation::Editor => {
                            role.eq_ignore_ascii_case("owner")
                                || role.eq_ignore_ascii_case("admin")
                                || role.eq_ignore_ascii_case("member")
                        }
                        ProjectRelation::Viewer => true,
                    };
                    results.push(FactLoadResult::Found(has_relation));
                }
                Ok(None) => results.push(FactLoadResult::Found(false)),
                Err(err) => results.push(FactLoadResult::Failed(err.into())),
            }
        }
        results
    }
}

pub fn admin_override_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("AdminOverridePolicy")
        .subjects(|user: &AuthUser| user.is_admin)
        .build()
}

pub fn project_owner_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("ProjectOwnerPolicy")
        .when(|user, _action, target, _ctx| {
            target.owner_id.as_deref() == Some(user.id.as_str())
        })
        .build()
}

pub fn public_project_view_policy() -> Box<dyn Policy<ProjectDomain>> {
    PolicyBuilder::<ProjectDomain>::new("PublicProjectViewPolicy")
        .when(|_user, action, target, _ctx| {
            target.is_public && matches!(action, ProjectAction::View)
        })
        .build()
}

pub fn project_owner_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Owner,
    )
    .boxed()
}

pub fn project_editor_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    let is_editor_action = PolicyBuilder::<ProjectDomain>::new("IsEditorAction")
        .actions(|action: &ProjectAction| {
            matches!(action, ProjectAction::View | ProjectAction::Edit | ProjectAction::Publish)
        })
        .build();

    let editor_relation = RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Editor,
    );

    is_editor_action.and(editor_relation).boxed()
}

pub fn project_viewer_relation_policy() -> Box<dyn Policy<ProjectDomain>> {
    let is_view_action = PolicyBuilder::<ProjectDomain>::new("IsViewAction")
        .actions(|action: &ProjectAction| matches!(action, ProjectAction::View))
        .build();

    let viewer_relation = RebacPolicy::<ProjectDomain, String, String, ProjectRelation>::new(
        |user: &AuthUser| user.id.clone(),
        |target: &ProjectTarget| target.id.clone(),
        ProjectRelation::Viewer,
    );

    is_view_action.and(viewer_relation).boxed()
}

pub fn build_project_checker() -> PermissionChecker<ProjectDomain> {
    let mut checker = PermissionChecker::named("ProjectChecker");
    checker.add_policy(admin_override_policy());
    checker.add_policy(project_owner_policy());
    checker.add_policy(public_project_view_policy());
    checker.add_policy(project_owner_relation_policy());
    checker.add_policy(project_editor_relation_policy());
    checker.add_policy(project_viewer_relation_policy());
    checker
}
```

- [ ] **Step 5: Implement `GatehouseState` in `crates/cms-authz/src/domains/state.rs`**

```rust
use std::sync::Arc;
use sqlx::PgPool;

use crate::{
    checker::PermissionChecker,
    facts::FactRegistry,
    session::EvaluationSession,
};

use super::{
    platform::{build_platform_checker, AuthUser, PlatformDomain},
    project::{build_project_checker, DbProjectRelationshipSource, ProjectDomain, ProjectRelationship},
};

pub struct GatehouseState {
    pub platform_checker: PermissionChecker<PlatformDomain>,
    pub project_checker: PermissionChecker<ProjectDomain>,
    pub fact_registry: FactRegistry,
    pub system_admin_emails: Vec<String>,
}

impl GatehouseState {
    pub fn new(pool: PgPool, system_admin_emails: Vec<String>) -> Self {
        let relationship_source = Arc::new(DbProjectRelationshipSource::new(pool));
        let fact_registry = FactRegistry::builder()
            .with_arc::<ProjectRelationship>(relationship_source)
            .build();

        Self {
            platform_checker: build_platform_checker(),
            project_checker: build_project_checker(),
            fact_registry,
            system_admin_emails,
        }
    }

    pub fn session(&self) -> EvaluationSession {
        self.fact_registry.session()
    }

    pub fn to_auth_user(&self, id: impl Into<String>, email: impl Into<String>) -> AuthUser {
        let id = id.into();
        let email = email.into();
        let is_admin = self
            .system_admin_emails
            .iter()
            .any(|admin_email| admin_email.eq_ignore_ascii_case(&email));

        AuthUser {
            id,
            email,
            is_admin,
        }
    }
}
```

- [ ] **Step 6: Expose domains and re-export in `crates/cms-authz/src/lib.rs`**

Add module exports in `crates/cms-authz/src/lib.rs`:
```rust
pub mod domains;
pub use domains::{platform::*, project::*, state::*};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cargo test -p cms-authz --test domains_test`
Expected: PASS with all tests passing.

- [ ] **Step 8: Commit domains implementation**

```bash
git add crates/cms-authz/
git commit -m "feat(authz): implement platform and project policy domains with fact registry"
```

---

### Task 3: Embed `GatehouseState` in `cms-middleware` and Refactor `BizContext`

**Files:**
- Modify: `crates/cms-biz/src/lib.rs`
- Modify: `crates/cms-middleware/src/app_state.rs`
- Modify: `crates/cms-biz/src/project.rs`
- Modify: `crates/cms-biz/src/usage.rs`
- Modify: `crates/cms-biz/src/platform_event.rs`
- Modify: `crates/cms-biz/src/org.rs`
- Modify: `crates/cms-biz/src/entitlement.rs`
- Modify: `crates/cms-biz/src/analytics.rs`
- Modify: `crates/cms-mcp/src/main.rs`
- Modify: `crates/cms-mcp/tests/handler_test.rs`
- Modify: `crates/cms-mcp/tests/e2e_mcp_test.rs`

**Interfaces:**
- Consumes: `cms_authz::GatehouseState`.
- Produces: `AppState.gatehouse: Arc<GatehouseState>`, `BizContext { pool: PgPool, gatehouse: Arc<GatehouseState> }`.

- [ ] **Step 1: Update `BizContext` in `crates/cms-biz/src/lib.rs`**

```rust
use std::sync::Arc;
use cms_authz::GatehouseState;
use sqlx::PgPool;

#[derive(Clone)]
pub struct BizContext {
    pub pool: PgPool,
    pub gatehouse: Arc<GatehouseState>,
}

impl BizContext {
    pub fn new(pool: PgPool, gatehouse: Arc<GatehouseState>) -> Self {
        Self { pool, gatehouse }
    }
}
```

- [ ] **Step 2: Clean up legacy `ctx.authz.require_org_*` calls in `crates/cms-biz/src/*.rs`**

In `crates/cms-biz/src/project.rs`, `usage.rs`, `platform_event.rs`, `org.rs`, `entitlement.rs`, `analytics.rs`:
Remove calls to `ctx.authz.require_org_admin`, `ctx.authz.require_org_member`, `ctx.authz.require_org_owner`, and `ctx.authz.require_system_admin`. Authorization is performed at the service / Axum handler boundary on snapshots.

- [ ] **Step 3: Update `AppState` in `crates/cms-middleware/src/app_state.rs`**

Replace legacy `authz` in `AppState`:
```rust
pub struct AppState {
    pub config: Arc<Config>,
    pub biz_context: BizContext,
    pub storage: Arc<dyn Storage>,
    pub job_queue: Arc<dyn JobQueue>,
    pub search_engine: Arc<dyn cms_search::SearchEngine>,
    pub mailer: Arc<dyn cms_biz::email::Mailer>,
    pub host_resolution_generation: Arc<AtomicU64>,
    pub gatehouse: Arc<cms_authz::GatehouseState>,
}
```
In `AppState::from_config`:
```rust
let gatehouse = Arc::new(cms_authz::GatehouseState::new(
    pool.clone(),
    config.auth.system_admin_emails.clone(),
));
let biz_context = BizContext::new(pool, gatehouse.clone());
```

- [ ] **Step 4: Update `cms-mcp` initializations**

In `crates/cms-mcp/src/main.rs`, `handler_test.rs`, and `e2e_mcp_test.rs`:
Replace `Arc::new(cms_authz::NoopAuthz)` with `Arc::new(cms_authz::GatehouseState::new(pool.clone(), vec![]))`.

- [ ] **Step 5: Verify build with `cargo check`**

Run: `cargo check -p cms-biz -p cms-middleware -p cms-mcp`
Expected: 0 errors.

- [ ] **Step 6: Commit state and biz context refactor**

```bash
git add crates/cms-biz/ crates/cms-middleware/ crates/cms-mcp/
git commit -m "refactor(authz): embed GatehouseState in AppState and BizContext"
```

---

### Task 4: Remove Legacy Authz Extractors, Roles, and Catalogs from `cms-api`

**Files:**
- Remove / Clean: `crates/cms-api/src/extractors/authz.rs`
- Modify: `crates/cms-api/src/extractors/mod.rs`
- Remove / Clean: `crates/cms-api/src/authz/mod.rs`, `handlers.rs`, `routes.rs`
- Modify: `crates/cms-api/src/lib.rs`

**Interfaces:**
- Produces: Clean `cms-api` routing without legacy permission catalog or speculative extractors.

- [ ] **Step 1: Clean legacy route registrations from `crates/cms-api/src/lib.rs`**

Remove `/permissions` and `/workspaces/{org_id}/roles` route nests from `crates/cms-api/src/lib.rs`.

- [ ] **Step 2: Clean legacy extractors from `crates/cms-api/src/extractors/authz.rs` and `mod.rs`**

Delete `ProjectAuth<R, A>`, `WorkspaceAuth<R, A>`, `ProjectAuthContext`, `WorkspaceAuthContext`, and `TenantContext` implementations.

- [ ] **Step 3: Remove legacy `crates/cms-api/src/authz/` module**

Remove `handlers.rs` and `routes.rs` under `crates/cms-api/src/authz/`.

- [ ] **Step 4: Verify build with `cargo check -p cms-api`**

Run: `cargo check -p cms-api`
Expected: Clean compilation with 0 errors.

- [ ] **Step 5: Commit route and extractor cleanup**

```bash
git add crates/cms-api/
git commit -m "chore(api): remove legacy authz extractors, roles, and catalog routes"
```

---

### Task 5: Implement Gatehouse Snapshot Authorization in Axum Handlers

**Files:**
- Modify: `crates/cms-api/src/auth/middleware.rs`
- Modify: `crates/cms-api/src/project/handlers/core.rs`
- Modify: `crates/cms-api/src/admin/mod.rs` or `handlers.rs`
- Create: `crates/cms-api/tests/gatehouse_snapshot_authz_test.rs`

**Interfaces:**
- Consumes: `AppState.gatehouse`, `AuthExtractor::to_auth_user`, `ProjectTarget`, `ProjectAction`, `PlatformAction`.
- Produces: Snapshot-first authorization checks across project and admin endpoints.

- [ ] **Step 1: Write integration tests in `crates/cms-api/tests/gatehouse_snapshot_authz_test.rs`**

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn test_unauthorized_when_not_logged_in() {
    // Calling protected project endpoint without auth credentials returns 401
    // ...
}

#[tokio::test]
async fn test_forbidden_when_not_member_of_private_project() {
    // Calling private project with non-member auth returns 403 Forbidden
    // ...
}

#[tokio::test]
async fn test_allowed_when_project_is_public() {
    // Calling public project view with any logged-in user returns 200 OK
    // ...
}
```

- [ ] **Step 2: Add `to_auth_user` helper to `AuthExtractor` in `crates/cms-api/src/auth/middleware.rs`**

```rust
impl AuthExtractor {
    pub fn to_auth_user(&self, state: &AppState) -> cms_authz::AuthUser {
        state.gatehouse.to_auth_user(self.user.id.to_string(), &self.user.email)
    }
}
```

- [ ] **Step 3: Wire snapshot authorization into `crates/cms-api/src/project/handlers/core.rs`**

In `get_project_handler`:
```rust
pub async fn get_project_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<ProjectId>,
) -> Result<Json<ApiResponse<ProjectWithOrgResponse>>, AppError> {
    // 1. Fetch resource snapshot (404 if not found)
    let project = ProjectService::get_project_by_id(&state.biz_context, &auth.user.id, &project_id)
        .await?;

    let target = cms_authz::ProjectTarget {
        id: project.id.to_string(),
        is_public: project.is_public,
        owner_id: None,
    };

    // 2. Authorize loaded snapshot via Gatehouse bound evaluator
    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();
    state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::View, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

    Ok(Json(ApiResponse::new(project)))
}
```

In `list_projects_handler`:
```rust
pub async fn list_projects_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<ListProjectsQuery>,
) -> Result<Json<ApiResponse<Vec<ProjectResponse>>>, AppError> {
    let candidates = ProjectService::list_all_projects_for_user(
        &state.biz_context,
        &auth.user.id,
        query.page.unwrap_or(1),
        query.limit.unwrap_or(100),
    )
    .await?;

    let auth_user = auth.to_auth_user(&state);
    let session = state.gatehouse.session();

    let targets: Vec<cms_authz::ProjectTarget> = candidates
        .iter()
        .map(|p| cms_authz::ProjectTarget {
            id: p.id.to_string(),
            is_public: p.is_public,
            owner_id: None,
        })
        .collect();

    let authorized_targets = state
        .gatehouse
        .project_checker
        .bind(&session, &auth_user, &cms_authz::ProjectAction::View, &())
        .try_filter(targets)
        .await
        .map_err(|_| AppError::Forbidden)?;

    let allowed_ids: std::collections::HashSet<String> =
        authorized_targets.into_iter().map(|t| t.id).collect();

    let filtered: Vec<ProjectResponse> = candidates
        .into_iter()
        .filter(|p| allowed_ids.contains(&p.id.to_string()))
        .collect();

    Ok(Json(ApiResponse::new(filtered)))
}
```

- [ ] **Step 4: Wire platform authorization into platform admin routes in `crates/cms-api/src/admin/`**

Authorize platform admin requests using `state.gatehouse.platform_checker.bind(&session, &auth_user, &PlatformAction::AccessAdmin, &()).authorize(&())`.

- [ ] **Step 5: Run integration tests to verify pass**

Run: `cargo test -p cms-api --test gatehouse_snapshot_authz_test`
Expected: PASS.

- [ ] **Step 6: Commit Axum Gatehouse handlers**

```bash
git add crates/cms-api/
git commit -m "feat(api): wire Gatehouse snapshot authorization into project and admin endpoints"
```

---

### Task 6: Full Workspace Verification & Cleanup

**Files:**
- Clean up: `target/temp-gatehouse/`

- [ ] **Step 1: Run full Rust workspace typecheck**

Run: `cargo check --workspace`
Expected: Clean compilation with 0 warnings or errors across all crates.

- [ ] **Step 2: Run full Rust workspace test suite**

Run: `cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 3: Remove temporary cloned Gatehouse repo**

Run powershell command:
```powershell
Remove-Item -Path "target/temp-gatehouse" -Recurse -Force
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(authz): complete gatehouse authorization migration"
```