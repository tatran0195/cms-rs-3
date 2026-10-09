# Design Specification: Gatehouse Authorization Engine Integration

## Overview

This specification defines the migration of authorization in `cms-rs-3` from legacy custom authz to **Gatehouse**, an open-source in-process authorization engine for Rust (`thepartly/gatehouse`).

Following the company platform guidelines (Internal Company Deployment, non-multi-tenant SaaS) and Gatehouse best practices:
1. **Remove all legacy authz mechanisms**: Delete `TenantContext`, `WorkspaceSecurityContext`, `ProjectSecurityContext`, `WorkspacePermissions`, `WorkspaceResource`, `OrganizationRole`, and all `require_org_*` methods.
2. **Remove Organization / Workspace concepts**: Projects become direct first-class product entities. Access is governed by **Global User Roles** (`admin` vs `user`) and **Project-level Memberships / Permissions**.
3. **Import Gatehouse Crate Source**: Replace the contents of `crates/cms-authz` with the complete Gatehouse crate source (`thepartly/gatehouse`), adapting package and export structures cleanly.
4. **Implement Idiomatic Gatehouse Design**:
   - Distinct, strongly typed `PolicyDomain`s (`PlatformDomain` and `ProjectDomain`).
   - Request-scoped `EvaluationSession` backed by a database `FactSource` (`ProjectMemberFactSource`).
   - Composable policies via `PolicyBuilder` and `RebacPolicy`.
   - Axum route integration where resources are loaded first and authorized as immutable snapshots.

---

## 1. Domain Modeling

### 1.1 Subject
Every authenticated caller is mapped to a uniform subject type:
```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub is_admin: bool,
}
```

### 1.2 Platform Domain (`PlatformDomain`)
Controls platform-level operations (system admin settings, user management, audit logs, creating top-level projects).

```rust
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
```

#### Platform Policies
1. **`AdminOnlyPolicy`**:
   ```rust
   PolicyBuilder::<PlatformDomain>::new("AdminOnlyPolicy")
       .subjects(|user: &AuthUser| user.is_admin)
       .build()
   ```
2. **`UserProjectCreationPolicy`**:
   ```rust
   PolicyBuilder::<PlatformDomain>::new("UserProjectCreationPolicy")
       .actions(|action: &PlatformAction| matches!(action, PlatformAction::CreateProject))
       .build()
   ```

### 1.3 Project Domain (`ProjectDomain`)
Controls access to projects and their sub-resources (pages, branches, deployments, domains, settings, assets, comments).

```rust
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
```

#### Project Relationship & Fact Loading (Gatehouse FactSource)
Project memberships are loaded dynamically and cached request-wide using Gatehouse's `FactSource`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProjectRelation {
    Owner,
    Editor,
    Viewer,
}

pub type ProjectRelationship = RelationshipQuery<String, String, ProjectRelation>;

pub struct DbProjectRelationshipSource {
    pool: PgPool,
}

#[async_trait]
impl FactSource<ProjectRelationship> for DbProjectRelationshipSource {
    async fn load_many(&self, keys: &[ProjectRelationship]) -> Vec<FactLoadResult<bool>> {
        // Batch query ProjectMember table for given user_id and project_id pairs
        // Cache and deduplicate through Gatehouse's EvaluationSession
    }
}
```

#### Project Policies
Following Gatehouse's composition best practice:
1. **`AdminOverridePolicy`**: Global admins have unrestricted access across all projects:
   ```rust
   PolicyBuilder::<ProjectDomain>::new("AdminOverridePolicy")
       .subjects(|user: &AuthUser| user.is_admin)
       .build()
   ```
2. **`ProjectOwnerPolicy`**: If `Some(user.id) == project.owner_id`, grant all actions.
3. **`ProjectMemberRolePolicy`**:
   - `ProjectRelation::Owner`: Grants all actions.
   - `ProjectRelation::Editor`: Grants `View`, `Edit`, `Publish`.
   - `ProjectRelation::Viewer`: Grants `View`.
4. **`PublicProjectViewPolicy`**:
   - If `project.is_public` and `action == ProjectAction::View`, grant access unconditionally.

---

## 2. Server & Axum Integration Pattern

### 2.1 State Management
Long-lived authorization components reside in `AppState`:

```rust
pub struct GatehouseState {
    pub platform_checker: PermissionChecker<PlatformDomain>,
    pub project_checker: PermissionChecker<ProjectDomain>,
    pub fact_registry: FactRegistry,
}

impl GatehouseState {
    pub fn session(&self) -> EvaluationSession {
        self.fact_registry.session()
    }
}
```

### 2.2 Request Flow & Route Handlers
Following Gatehouse's golden rule: **Load the resource snapshot first, then authorize that snapshot.**

```rust
pub async fn get_project_handler(
    Path(project_id): Path<String>,
    State(state): State<Arc<AppState>>,
    auth_user: AuthExtractor,
) -> Result<Json<ProjectResponse>, AppError> {
    // 1. Fetch resource snapshot (404 if not found)
    let project = ProjectQueries::get_by_id(&state.pool, &project_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let target = ProjectTarget {
        id: project.id.clone(),
        is_public: project.is_public,
        owner_id: project.owner_id.clone(),
    };

    // 2. Authorize via Gatehouse bound evaluator
    let session = state.gatehouse.session();
    state.gatehouse
        .project_checker
        .bind(&session, &auth_user.into(), &ProjectAction::View, &())
        .authorize(&target)
        .await
        .map_err(|_| AppError::Forbidden)?;

    Ok(Json(project.into()))
}
```

### 2.3 List Filtering Without N+1
When listing projects, use Gatehouse's `try_filter`:

```rust
pub async fn list_projects_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthExtractor,
) -> Result<Json<Vec<ProjectResponse>>, AppError> {
    let candidates = ProjectQueries::list(&state.pool).await?;
    let targets: Vec<ProjectTarget> = candidates.iter().map(Into::into).collect();

    let session = state.gatehouse.session();
    let authorized_ids: HashSet<String> = state.gatehouse
        .project_checker
        .bind(&session, &auth_user.into(), &ProjectAction::View, &())
        .try_filter(targets)
        .await
        .map_err(|_| AppError::Internal("Authz evaluation failed".into()))?
        .into_iter()
        .map(|t| t.id)
        .collect();

    let filtered = candidates.into_iter().filter(|p| authorized_ids.contains(&p.id)).collect();
    Ok(Json(filtered))
}
```

---

## 3. Removal of Legacy Artifacts

1. **Delete / Clean in `crates/cms-api`**:
   - Delete `crates/cms-api/src/workspace/` and `crates/cms-api/src/org/`.
   - Remove workspace and organization route registrations in `crates/cms-api/src/lib.rs`.
   - Delete legacy extractors in `crates/cms-api/src/extractors/authz.rs` (`WorkspaceAuth`, `ProjectAuth<R, A>`).
   - Remove legacy permission catalog / role handlers in `crates/cms-api/src/authz/`.
2. **Clean in `crates/cms-biz`**:
   - Remove `authz.require_org_*` and `org_id` dependencies.
   - Refactor `BizContext` to remove legacy `dyn cms_authz::Authz`.
3. **Clean in `crates/cms-middleware` & `crates/cms-mcp`**:
   - Remove `ProductionAuthz` / `NoopAuthz` instantiations.
   - Plug in `GatehouseState`.

---

## 4. Verification and Testing

1. **Gatehouse Engine Unit Tests**:
   - Verify `PlatformDomain`: Admin allowed for all platform actions; non-admin forbidden.
   - Verify `ProjectDomain`:
     - Global admin can view/edit/delete any project.
     - Project owner can view/edit/delete/manage their project.
     - Project member (editor) can view/edit/publish.
     - Project viewer can view, but fails edit/publish.
     - Public project allows view for anyone.
     - Non-member on private project is forbidden.
2. **Fact Caching & Performance**:
   - Verify `EvaluationSession` queries `FactSource` exactly once per unique (user, project) in batch evaluations.
3. **Axum HTTP Integration Tests**:
   - Unauthorized requests return 401.
   - Forbidden actions return 403.
   - Non-existent projects return 404.
   - Valid actions return 200.
