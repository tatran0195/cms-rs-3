//! Database queries for OrganizationRole, ProjectRole, and ProjectMember

use chrono::{DateTime, Utc};
use cms_entity::authz::{
    OrganizationRole, ProjectMember, ProjectPermissions, ProjectRole, WorkspacePermissions,
};
use cms_error::AppError;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

#[derive(Debug, FromRow)]
struct OrgRoleRow {
    id: String,
    organization_id: String,
    name: String,
    description: Option<String>,
    is_default: bool,
    permissions: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<OrgRoleRow> for OrganizationRole {
    fn from(row: OrgRoleRow) -> Self {
        Self {
            id: row.id,
            organization_id: row.organization_id,
            name: row.name,
            description: row.description,
            is_default: row.is_default,
            permissions: WorkspacePermissions::normalize(row.permissions),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, FromRow)]
struct ProjectRoleRow {
    id: String,
    project_id: String,
    name: String,
    description: Option<String>,
    is_default: bool,
    permissions: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ProjectRoleRow> for ProjectRole {
    fn from(row: ProjectRoleRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            description: row.description,
            is_default: row.is_default,
            permissions: ProjectPermissions::normalize(row.permissions),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, FromRow)]
struct ProjectMemberRow {
    id: String,
    project_id: String,
    user_id: String,
    role: String,
    role_id: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ProjectMemberRow> for ProjectMember {
    fn from(row: ProjectMemberRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            user_id: row.user_id,
            role: row.role,
            role_id: row.role_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub struct OrgRoleQueries;

impl OrgRoleQueries {
    pub async fn create(
        pool: &PgPool,
        org_id: &str,
        name: &str,
        description: Option<&str>,
        is_default: bool,
        permissions: serde_json::Value,
    ) -> Result<OrganizationRole, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let row = sqlx::query_as::<_, OrgRoleRow>(
            r#"
            INSERT INTO "OrganizationRole" (id, organization_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(org_id)
        .bind(name)
        .bind(description)
        .bind(is_default)
        .bind(permissions)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("duplicate key") {
                AppError::Conflict("A role with this name already exists in this organization".to_string())
            } else {
                AppError::Database(e.into())
            }
        })?;

        Ok(row.into())
    }

    pub async fn get_by_id(pool: &PgPool, id: &str) -> Result<Option<OrganizationRole>, AppError> {
        let row = sqlx::query_as::<_, OrgRoleRow>(
            r#"SELECT * FROM "OrganizationRole" WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn get_default(pool: &PgPool, org_id: &str) -> Result<Option<OrganizationRole>, AppError> {
        let row = sqlx::query_as::<_, OrgRoleRow>(
            r#"SELECT * FROM "OrganizationRole" WHERE organization_id = $1 AND is_default = true"#,
        )
        .bind(org_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn list_by_org(pool: &PgPool, org_id: &str) -> Result<Vec<OrganizationRole>, AppError> {
        let rows = sqlx::query_as::<_, OrgRoleRow>(
            r#"SELECT * FROM "OrganizationRole" WHERE organization_id = $1 ORDER BY created_at ASC"#,
        )
        .bind(org_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn update(
        pool: &PgPool,
        org_id: &str,
        role_id: &str,
        name: Option<&str>,
        description: Option<&str>,
        is_default: Option<bool>,
        permissions: Option<serde_json::Value>,
    ) -> Result<OrganizationRole, AppError> {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("UPDATE \"OrganizationRole\" SET ");
        let mut has_updates = false;

        if let Some(name) = name {
            qb.push("name = ");
            qb.push_bind(name);
            has_updates = true;
        }
        if let Some(desc) = description {
            if has_updates { qb.push(", "); }
            qb.push("description = ");
            qb.push_bind(desc);
            has_updates = true;
        }
        if let Some(is_def) = is_default {
            if has_updates { qb.push(", "); }
            qb.push("is_default = ");
            qb.push_bind(is_def);
            has_updates = true;
        }
        if let Some(perms) = permissions {
            if has_updates { qb.push(", "); }
            qb.push("permissions = ");
            qb.push_bind(perms);
            has_updates = true;
        }

        if has_updates {
            qb.push(", updated_at = ");
            qb.push_bind(Utc::now());
        }

        qb.push(" WHERE id = ");
        qb.push_bind(role_id);
        qb.push(" AND organization_id = ");
        qb.push_bind(org_id);
        qb.push(" RETURNING *");

        let row = qb
            .build_query_as::<OrgRoleRow>()
            .fetch_optional(pool)
            .await
            .map_err(|e| {
                if e.to_string().contains("duplicate key") {
                    AppError::Conflict("A role with this name already exists in this organization".to_string())
                } else {
                    AppError::Database(e.into())
                }
            })?
            .ok_or_else(|| AppError::NotFound("Role not found in this workspace".to_string()))?;

        Ok(row.into())
    }

    pub async fn count_usage(pool: &PgPool, role_id: &str) -> Result<i64, AppError> {
        let row: (i64,) = sqlx::query_as(
            r#"SELECT COUNT(*) FROM "Member" WHERE role_id = $1"#,
        )
        .bind(role_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.0)
    }

    pub async fn delete_with_reassign(
        pool: &PgPool,
        org_id: &str,
        role_id: &str,
        target_role_id: Option<&str>,
    ) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;

        if let Some(target_id) = target_role_id {
            sqlx::query(
                r#"UPDATE "Member" SET role_id = $1 WHERE role_id = $2 AND organization_id = $3"#,
            )
            .bind(target_id)
            .bind(role_id)
            .bind(org_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.into()))?;
        }

        let result = sqlx::query(
            r#"DELETE FROM "OrganizationRole" WHERE id = $1 AND organization_id = $2"#,
        )
        .bind(role_id)
        .bind(org_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Role not found in this workspace".to_string()));
        }

        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;
        Ok(())
    }

    pub async fn seed_defaults(pool: &PgPool, org_id: &str) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;
        Self::seed_defaults_conn(&mut tx, org_id).await?;
        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;
        Ok(())
    }

    pub async fn seed_defaults_conn(conn: &mut sqlx::PgConnection, org_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        let member_perms = serde_json::json!({
            "projects": {"create": true, "read": true, "edit": true, "delete": false},
            "members": {"create": false, "read": true, "edit": false, "delete": false},
            "roles": {"create": false, "read": true, "edit": false, "delete": false},
            "api_keys": {"create": false, "read": false, "edit": false, "delete": false},
            "audit_logs": {"read": false},
            "settings": {"read": true, "edit": false},
            "danger_zone": {"read": false, "delete": false}
        });
        sqlx::query(
            r#"
            INSERT INTO "OrganizationRole" (id, organization_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, 'Member', 'Standard workspace member with access to projects and general settings.', true, $3, $4, $4)
            ON CONFLICT (organization_id, name) DO NOTHING
            "#
        )
        .bind(Uuid::new_v4().to_string())
        .bind(org_id)
        .bind(member_perms)
        .bind(now)
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        let viewer_perms = serde_json::json!({
            "projects": {"create": false, "read": true, "edit": false, "delete": false},
            "members": {"create": false, "read": true, "edit": false, "delete": false},
            "roles": {"create": false, "read": true, "edit": false, "delete": false},
            "api_keys": {"create": false, "read": false, "edit": false, "delete": false},
            "audit_logs": {"read": false},
            "settings": {"read": true, "edit": false},
            "danger_zone": {"read": false, "delete": false}
        });
        sqlx::query(
            r#"
            INSERT INTO "OrganizationRole" (id, organization_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, 'Viewer', 'Read-only access to workspace projects and resources.', false, $3, $4, $4)
            ON CONFLICT (organization_id, name) DO NOTHING
            "#
        )
        .bind(Uuid::new_v4().to_string())
        .bind(org_id)
        .bind(viewer_perms)
        .bind(now)
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(())
    }
}

pub struct ProjectRoleQueries;

impl ProjectRoleQueries {
    pub async fn create(
        pool: &PgPool,
        project_id: &str,
        name: &str,
        description: Option<&str>,
        is_default: bool,
        permissions: serde_json::Value,
    ) -> Result<ProjectRole, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let row = sqlx::query_as::<_, ProjectRoleRow>(
            r#"
            INSERT INTO "ProjectRole" (id, project_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(project_id)
        .bind(name)
        .bind(description)
        .bind(is_default)
        .bind(permissions)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("duplicate key") {
                AppError::Conflict("A role with this name already exists in this project".to_string())
            } else {
                AppError::Database(e.into())
            }
        })?;

        Ok(row.into())
    }

    pub async fn get_by_id(pool: &PgPool, id: &str) -> Result<Option<ProjectRole>, AppError> {
        let row = sqlx::query_as::<_, ProjectRoleRow>(
            r#"SELECT * FROM "ProjectRole" WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn get_default(pool: &PgPool, project_id: &str) -> Result<Option<ProjectRole>, AppError> {
        let row = sqlx::query_as::<_, ProjectRoleRow>(
            r#"SELECT * FROM "ProjectRole" WHERE project_id = $1 AND is_default = true"#,
        )
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn list_by_project(pool: &PgPool, project_id: &str) -> Result<Vec<ProjectRole>, AppError> {
        let rows = sqlx::query_as::<_, ProjectRoleRow>(
            r#"SELECT * FROM "ProjectRole" WHERE project_id = $1 ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn update(
        pool: &PgPool,
        project_id: &str,
        role_id: &str,
        name: Option<&str>,
        description: Option<&str>,
        is_default: Option<bool>,
        permissions: Option<serde_json::Value>,
    ) -> Result<ProjectRole, AppError> {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("UPDATE \"ProjectRole\" SET ");
        let mut has_updates = false;

        if let Some(name) = name {
            qb.push("name = ");
            qb.push_bind(name);
            has_updates = true;
        }
        if let Some(desc) = description {
            if has_updates { qb.push(", "); }
            qb.push("description = ");
            qb.push_bind(desc);
            has_updates = true;
        }
        if let Some(is_def) = is_default {
            if has_updates { qb.push(", "); }
            qb.push("is_default = ");
            qb.push_bind(is_def);
            has_updates = true;
        }
        if let Some(perms) = permissions {
            if has_updates { qb.push(", "); }
            qb.push("permissions = ");
            qb.push_bind(perms);
            has_updates = true;
        }

        if has_updates {
            qb.push(", updated_at = ");
            qb.push_bind(Utc::now());
        }

        qb.push(" WHERE id = ");
        qb.push_bind(role_id);
        qb.push(" AND project_id = ");
        qb.push_bind(project_id);
        qb.push(" RETURNING *");

        let row = qb
            .build_query_as::<ProjectRoleRow>()
            .fetch_optional(pool)
            .await
            .map_err(|e| {
                if e.to_string().contains("duplicate key") {
                    AppError::Conflict("A role with this name already exists in this project".to_string())
                } else {
                    AppError::Database(e.into())
                }
            })?
            .ok_or_else(|| AppError::NotFound("Role not found in this project".to_string()))?;

        Ok(row.into())
    }

    pub async fn count_usage(pool: &PgPool, role_id: &str) -> Result<i64, AppError> {
        let row: (i64,) = sqlx::query_as(
            r#"SELECT COUNT(*) FROM "ProjectMember" WHERE role_id = $1"#,
        )
        .bind(role_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.0)
    }

    pub async fn delete_with_reassign(
        pool: &PgPool,
        project_id: &str,
        role_id: &str,
        target_role_id: Option<&str>,
    ) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;

        if let Some(target_id) = target_role_id {
            sqlx::query(
                r#"UPDATE "ProjectMember" SET role_id = $1 WHERE role_id = $2 AND project_id = $3"#,
            )
            .bind(target_id)
            .bind(role_id)
            .bind(project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.into()))?;
        }

        let result = sqlx::query(
            r#"DELETE FROM "ProjectRole" WHERE id = $1 AND project_id = $2"#,
        )
        .bind(role_id)
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Role not found in this project".to_string()));
        }

        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;
        Ok(())
    }

    pub async fn seed_defaults(pool: &PgPool, project_id: &str) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;
        Self::seed_defaults_conn(&mut tx, project_id).await?;
        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;
        Ok(())
    }

    pub async fn seed_defaults_conn(conn: &mut sqlx::PgConnection, project_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        let member_perms = serde_json::json!({
            "pages": {"create": true, "read": true, "edit": true, "delete": true, "publish": true},
            "branches": {"create": true, "read": true, "edit": true, "delete": false},
            "deployments": {"create": true, "read": true, "delete": false, "publish": true},
            "domains": {"create": false, "read": true, "edit": false, "delete": false},
            "openapi": {"create": false, "read": true, "edit": true, "delete": false},
            "assets": {"create": true, "read": true, "edit": true, "delete": true},
            "addons": {"create": false, "read": true, "edit": false, "delete": false},
            "members": {"create": false, "read": true, "edit": false, "delete": false},
            "roles": {"create": false, "read": true, "edit": false, "delete": false},
            "analytics": {"read": true},
            "comments": {"create": true, "read": true, "edit": true, "delete": true},
            "danger_zone": {"read": false, "delete": false}
        });
        sqlx::query(
            r#"
            INSERT INTO "ProjectRole" (id, project_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, 'Member', 'Standard project contributor who can create, edit, and publish documentation pages.', true, $3, $4, $4)
            ON CONFLICT (project_id, name) DO NOTHING
            "#
        )
        .bind(Uuid::new_v4().to_string())
        .bind(project_id)
        .bind(member_perms)
        .bind(now)
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        let viewer_perms = serde_json::json!({
            "pages": {"create": false, "read": true, "edit": false, "delete": false, "publish": false},
            "branches": {"create": false, "read": true, "edit": false, "delete": false},
            "deployments": {"create": false, "read": true, "delete": false, "publish": false},
            "domains": {"create": false, "read": true, "edit": false, "delete": false},
            "openapi": {"create": false, "read": true, "edit": false, "delete": false},
            "assets": {"create": false, "read": true, "edit": false, "delete": false},
            "addons": {"create": false, "read": true, "edit": false, "delete": false},
            "members": {"create": false, "read": true, "edit": false, "delete": false},
            "roles": {"create": false, "read": true, "edit": false, "delete": false},
            "analytics": {"read": true},
            "comments": {"create": false, "read": true, "edit": false, "delete": false},
            "danger_zone": {"read": false, "delete": false}
        });
        sqlx::query(
            r#"
            INSERT INTO "ProjectRole" (id, project_id, name, description, is_default, permissions, created_at, updated_at)
            VALUES ($1, $2, 'Viewer', 'Read-only viewer of project documentation and previews.', false, $3, $4, $4)
            ON CONFLICT (project_id, name) DO NOTHING
            "#
        )
        .bind(Uuid::new_v4().to_string())
        .bind(project_id)
        .bind(viewer_perms)
        .bind(now)
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(())
    }
}

pub struct ProjectMemberQueries;

impl ProjectMemberQueries {
    pub async fn create(
        pool: &PgPool,
        project_id: &str,
        user_id: &str,
        role: &str,
        role_id: Option<&str>,
    ) -> Result<ProjectMember, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let row = sqlx::query_as::<_, ProjectMemberRow>(
            r#"
            INSERT INTO "ProjectMember" (id, project_id, user_id, role, role_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(project_id)
        .bind(user_id)
        .bind(role)
        .bind(role_id)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("duplicate key") {
                AppError::Conflict("User is already a member of this project".to_string())
            } else {
                AppError::Database(e.into())
            }
        })?;

        Ok(row.into())
    }

    pub async fn get_by_user_and_project(
        pool: &PgPool,
        user_id: &str,
        project_id: &str,
    ) -> Result<Option<ProjectMember>, AppError> {
        let row = sqlx::query_as::<_, ProjectMemberRow>(
            r#"SELECT * FROM "ProjectMember" WHERE user_id = $1 AND project_id = $2"#,
        )
        .bind(user_id)
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(Into::into))
    }

    pub async fn list_by_project(pool: &PgPool, project_id: &str) -> Result<Vec<ProjectMember>, AppError> {
        let rows = sqlx::query_as::<_, ProjectMemberRow>(
            r#"SELECT * FROM "ProjectMember" WHERE project_id = $1 ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn update_role(
        pool: &PgPool,
        project_id: &str,
        user_id: &str,
        role: Option<&str>,
        role_id: Option<&str>,
    ) -> Result<ProjectMember, AppError> {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("UPDATE \"ProjectMember\" SET ");
        let mut has_updates = false;

        if let Some(role) = role {
            qb.push("role = ");
            qb.push_bind(role);
            has_updates = true;
        }
        if let Some(role_id) = role_id {
            if has_updates { qb.push(", "); }
            qb.push("role_id = ");
            qb.push_bind(role_id);
            has_updates = true;
        }

        if has_updates {
            qb.push(", updated_at = ");
            qb.push_bind(Utc::now());
        }

        qb.push(" WHERE project_id = ");
        qb.push_bind(project_id);
        qb.push(" AND user_id = ");
        qb.push_bind(user_id);
        qb.push(" RETURNING *");

        let row = qb
            .build_query_as::<ProjectMemberRow>()
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn remove(pool: &PgPool, project_id: &str, user_id: &str) -> Result<bool, AppError> {
        let res = sqlx::query(
            r#"DELETE FROM "ProjectMember" WHERE project_id = $1 AND user_id = $2"#,
        )
        .bind(project_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(res.rows_affected() > 0)
    }
}
