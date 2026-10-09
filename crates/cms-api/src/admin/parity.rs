//! cms admin-console compatibility surface, backed by cms-rs records.
//! Sensitive content, credentials, raw provider errors, and session tokens are
//! intentionally not returned to operators through these summary endpoints.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, Postgres, QueryBuilder};

use crate::auth::AuthExtractor;

async fn require_admin(state: &AppState, user_id: &str) -> Result<(), AppError> {
    let user = cms_db::auth::UserQueries::get_by_id(&state.biz_context.pool, user_id)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let mut auth_user = state.gatehouse.to_auth_user(&user.id, &user.email);
    if cms_db::auth::UserQueries::is_system_admin(&state.biz_context.pool, user_id)
        .await
        .unwrap_or(false)
    {
        auth_user.is_admin = true;
    }
    let session = state.gatehouse.session();
    state
        .gatehouse
        .platform_checker
        .bind(&session, &auth_user, &cms_authz::PlatformAction::AccessAdmin, &())
        .authorize(&())
        .await
        .map_err(|_| AppError::Forbidden)
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverviewRow {
    users: i64,
    admins: i64,
    sites: i64,
    deployments: i64,
    published_deployments: i64,
    recent_users: i64,
    verified_users: i64,
    suspended_users: i64,
    failed_deployments_24h: i64,
    active_deployments: i64,
    domains: i64,
    healthy_domains: i64,
    domain_issues: i64,
    taken_down_sites: i64,
    expired_owner_invites: i64,
    failed_exports_7d: i64,
    git_issues: i64,
}

pub async fn overview_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let stats = sqlx::query_as::<_, OverviewRow>(
        r#"SELECT
            (SELECT COUNT(*) FROM "User") AS users,
            (SELECT COUNT(*) FROM "User" WHERE role = 'admin') AS admins,
            (SELECT COUNT(*) FROM "Project") AS sites,
            (SELECT COUNT(*) FROM "Deployment") AS deployments,
            (SELECT COUNT(*) FROM "Deployment" WHERE status = 'ACTIVE') AS published_deployments,
            (SELECT COUNT(*) FROM "User" WHERE created_at >= NOW() - INTERVAL '7 days') AS recent_users,
            (SELECT COUNT(*) FROM "User" WHERE email_verified) AS verified_users,
            (SELECT COUNT(*) FROM "User" WHERE suspended_at IS NOT NULL) AS suspended_users,
            (SELECT COUNT(*) FROM "Deployment"
             WHERE status = 'FAILED' AND created_at >= NOW() - INTERVAL '24 hours') AS failed_deployments_24h,
            (SELECT COUNT(*) FROM "Deployment"
             WHERE status IN ('PENDING', 'BUILDING', 'DEPLOYING')) AS active_deployments,
            (SELECT COUNT(*) FROM "Domain") AS domains,
            (SELECT COUNT(*) FROM "Domain"
             WHERE verified_at IS NOT NULL AND ssl_status = 'ACTIVE'
               AND (ssl_certificate_expires_at > NOW()
                    OR (ssl_certificate_expires_at IS NULL
                        AND ssl_checked_at >= NOW() - INTERVAL '7 days'))) AS healthy_domains,
            (SELECT COUNT(*) FROM "Domain"
             WHERE ssl_status IN ('ERROR', 'EXPIRED')) AS domain_issues,
            (SELECT COUNT(*) FROM "Project" WHERE takedown_at IS NOT NULL) AS taken_down_sites,
            0::BIGINT AS expired_owner_invites,
            (SELECT COUNT(*) FROM "ExportJob"
             WHERE status = 'FAILED' AND created_at >= NOW() - INTERVAL '7 days') AS failed_exports_7d,
            (SELECT COUNT(*) FROM "GitSyncOperation"
             WHERE status IN ('FAILED', 'CONFLICT')) AS git_issues"#,
    )
    .fetch_one(&state.biz_context.pool)
    .await?;
    Ok(Json(json!({ "data": stats })))
}

#[derive(Debug, FromRow)]
struct FunnelRow {
    signups: i64,
    edited: i64,
    published: i64,
    ready: i64,
    ready_within_24_hours: i64,
    median_hours_to_ready: Option<f64>,
}

#[derive(Deserialize)]
pub struct FunnelQuery {
    days: Option<i64>,
}

pub async fn funnel_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Query(query): Query<FunnelQuery>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let days = query.days.unwrap_or(30).clamp(1, 365);
    let row = sqlx::query_as::<_, FunnelRow>(
        r#"WITH events AS (
               SELECT event_type, user_id, created_at, metadata
               FROM "PlatformEvent"
               WHERE created_at >= NOW() - ($1::INTEGER * INTERVAL '1 day')
           ), signups AS (
               SELECT user_id, MIN(created_at) AS signup_at
               FROM events WHERE event_type = 'signup_completed' AND user_id IS NOT NULL
               GROUP BY user_id
           ), ready AS (
               SELECT user_id, MIN(created_at) AS ready_at
               FROM events
               WHERE event_type = 'publish_ready' AND user_id IS NOT NULL
                 AND COALESCE(metadata->>'auto', 'false') = 'false'
               GROUP BY user_id
           )
           SELECT
             COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'signup_completed') AS signups,
             COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'page_edited') AS edited,
             COUNT(DISTINCT user_id) FILTER (
                 WHERE event_type = 'publish_clicked'
                   AND COALESCE(metadata->>'auto', 'false') = 'false'
             ) AS published,
             COUNT(DISTINCT user_id) FILTER (
                 WHERE event_type = 'publish_ready'
                   AND COALESCE(metadata->>'auto', 'false') = 'false'
             ) AS ready,
             (SELECT COUNT(*) FROM signups s JOIN ready r USING (user_id)
              WHERE r.ready_at >= s.signup_at
                AND r.ready_at <= s.signup_at + INTERVAL '24 hours') AS ready_within_24_hours,
             (SELECT percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM (r.ready_at - s.signup_at)) / 3600.0
              ) FROM signups s JOIN ready r USING (user_id)
              WHERE r.ready_at >= s.signup_at) AS median_hours_to_ready
           FROM events"#,
    )
    .bind(days as i32)
    .fetch_one(&state.biz_context.pool)
    .await?;
    Ok(Json(json!({
        "data": {
            "days": days,
            "signups": row.signups,
            "edited": row.edited,
            "published": row.published,
            "ready": row.ready,
            "readyWithin24Hours": row.ready_within_24_hours,
            "medianHoursToReady": row.median_hours_to_ready,
        }
    })))
}

#[derive(Debug, FromRow)]
struct AdminUserRow {
    id: String,
    name: Option<String>,
    email: String,
    role: String,
    email_verified: bool,
    suspended_at: Option<DateTime<Utc>>,
    workspaces: i64,
    providers: Vec<String>,
    active_sessions: i64,
    last_session_created_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

async fn load_admin_users(
    state: &AppState,
    user_id: Option<&str>,
    limit: i64,
) -> Result<Vec<AdminUserRow>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT u.id, u.name, u.email, u.role, u.email_verified, u.suspended_at,
                  u.created_at, u.updated_at,
                  (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm.user_id = u.id) AS workspaces,
                  COALESCE((SELECT ARRAY_AGG(DISTINCT a.provider ORDER BY a.provider)
                            FROM "Account" a WHERE a.user_id = u.id), ARRAY[]::TEXT[]) AS providers,
                  (SELECT COUNT(*) FROM "Session" s
                   WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions,
                  (SELECT MAX(s.created_at) FROM "Session" s WHERE s.user_id = u.id) AS last_session_created_at
           FROM "User" u"#,
    );
    if let Some(user_id) = user_id {
        query.push(" WHERE u.id = ").push_bind(user_id);
    }
    query
        .push(" ORDER BY u.created_at DESC LIMIT ")
        .push_bind(limit.clamp(1, 500));
    Ok(query
        .build_query_as::<AdminUserRow>()
        .fetch_all(&state.biz_context.pool)
        .await?)
}

fn admin_user_json(user: AdminUserRow) -> Value {
    json!({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "emailVerified": user.email_verified,
        "suspendedAt": user.suspended_at,
        "workspaces": user.workspaces,
        "providers": user.providers,
        "activeSessions": user.active_sessions,
        "lastSessionCreatedAt": user.last_session_created_at,
        "createdAt": user.created_at,
        "updatedAt": user.updated_at,
    })
}

pub async fn users_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let users = load_admin_users(&state, None, 500).await?;
    Ok(Json(
        json!({ "data": users.into_iter().map(admin_user_json).collect::<Vec<_>>() }),
    ))
}

pub async fn user_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let user = load_admin_users(&state, Some(&user_id), 1)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;
    let memberships = sqlx::query(
        r#"SELECT pm.id AS membership_id, pm.role::TEXT AS role, pm.created_at,
                  p.id AS project_id, p.name AS project_name, p.slug AS project_slug
           FROM "ProjectMember" pm
           JOIN "Project" p ON p.id = pm.project_id
           WHERE pm.user_id = $1
           ORDER BY pm.created_at DESC LIMIT 500"#,
    )
    .bind(&user_id)
    .fetch_all(&state.biz_context.pool)
    .await?
    .into_iter()
    .map(|row| {
        let pid = row.get::<String, _>("project_id");
        let pname = row.get::<String, _>("project_name");
        let pslug = row.get::<String, _>("project_slug");
        json!({
            "membershipId": row.get::<String, _>("membership_id"),
            "projectId": pid,
            "projectName": pname,
            "projectSlug": pslug,
            "role": row.get::<String, _>("role"),
            "joinedAt": row.get::<DateTime<Utc>, _>("created_at"),
            "projectCount": 1,
            "projects": json!([{
                "id": pid,
                "name": pname,
                "slug": pslug,
            }]),
        })
    })
    .collect::<Vec<_>>();
    let activity = sqlx::query(
        r#"SELECT id, event_type, created_at
           FROM "PlatformEvent" WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 30"#,
    )
    .bind(&user_id)
    .fetch_all(&state.biz_context.pool)
    .await?
    .into_iter()
    .map(|row| {
        json!({
            "id": row.get::<String, _>("id"),
            "type": row.get::<String, _>("event_type"),
            "createdAt": row.get::<DateTime<Utc>, _>("created_at"),
        })
    })
    .collect::<Vec<_>>();

    let mut data = admin_user_json(user);
    data["workspaces"] = json!(memberships);
    data["activity"] = json!(activity);
    Ok(Json(json!({ "data": data })))
}

#[derive(Deserialize)]
pub struct SetRoleBody {
    role: String,
}

pub async fn set_user_role_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(user_id): Path<String>,
    Json(body): Json<SetRoleBody>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let requested = body.role.trim().to_ascii_lowercase();
    if !matches!(requested.as_str(), "user" | "admin") {
        return Err(AppError::InvalidInput(
            "role must be 'user' or 'admin'".to_string(),
        ));
    }
    let mut tx = state.biz_context.pool.begin().await?;
    // Serialize administrator-roster updates so concurrent demotions cannot
    // both observe themselves as non-final administrators.
    sqlx::query("SELECT pg_advisory_xact_lock(78098457211712)")
        .execute(&mut *tx)
        .await?;
    let target = sqlx::query_as::<_, (String, String)>(
        r#"SELECT email, role FROM "User" WHERE id = $1 FOR UPDATE"#,
    )
    .bind(&user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;
    if requested == "user"
        && state
            .config
            .auth
            .system_admin_emails
            .iter()
            .any(|email| email.trim().eq_ignore_ascii_case(&target.0))
    {
        return Err(AppError::Conflict(
            "Configured system administrators cannot be demoted".to_string(),
        ));
    }
    if requested == "user" && target.1 == "admin" {
        let admins: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "User" WHERE role = 'admin'"#)
            .fetch_one(&mut *tx)
            .await?;
        if admins <= 1 {
            return Err(AppError::Conflict(
                "Cannot remove the last system administrator".to_string(),
            ));
        }
    }
    sqlx::query(r#"UPDATE "User" SET role = $2, updated_at = NOW() WHERE id = $1"#)
        .bind(&user_id)
        .bind(&requested)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn suspend_user_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let mut tx = state.biz_context.pool.begin().await?;
    let target_role: Option<String> =
        sqlx::query_scalar(r#"SELECT role FROM "User" WHERE id = $1 FOR UPDATE"#)
            .bind(&user_id)
            .fetch_optional(&mut *tx)
            .await?;
    let target_role =
        target_role.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;
    if target_role == "admin" {
        return Err(AppError::Conflict(
            "System administrators cannot be suspended".to_string(),
        ));
    }
    sqlx::query(r#"UPDATE "User" SET suspended_at = COALESCE(suspended_at, NOW()), updated_at = NOW() WHERE id = $1"#)
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"DELETE FROM "Session" WHERE user_id = $1"#)
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn unsuspend_user_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let result =
        sqlx::query(r#"UPDATE "User" SET suspended_at = NULL, updated_at = NOW() WHERE id = $1"#)
            .bind(&user_id)
            .execute(&state.biz_context.pool)
            .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User not found".to_string()));
    }
    Ok(Json(json!({ "data": { "ok": true } })))
}

#[derive(Debug, FromRow)]
struct AdminSiteRow {
    id: String,
    name: String,
    slug: String,
    description: Option<String>,
    owner_email: Option<String>,
    owner_suspended_at: Option<DateTime<Utc>>,
    pages: i64,
    deployments: i64,
    languages: i64,
    members: i64,
    domains: i64,
    domain_issues: i64,
    is_public: bool,
    takedown_at: Option<DateTime<Utc>>,
    takedown_reason: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    latest_deployment: Option<Value>,
}

async fn load_admin_sites(
    state: &AppState,
    project_id: Option<&str>,
) -> Result<Vec<AdminSiteRow>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT p.id, p.name, p.slug, p.description, p.is_public, p.takedown_at,
                  p.takedown_reason, p.created_at, p.updated_at,
                  owner_member.email AS owner_email,
                  owner_member.suspended_at AS owner_suspended_at,
                  (SELECT COUNT(*) FROM "Page" pg
                   WHERE pg.project_id = p.id AND UPPER(pg.kind) = 'PAGE') AS pages,
                  (SELECT COUNT(*) FROM "Deployment" d WHERE d.project_id = p.id) AS deployments,
                  (SELECT COUNT(*) FROM "Language" l WHERE l.project_id = p.id) AS languages,
                  (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm.project_id = p.id) AS members,
                  (SELECT COUNT(*) FROM "Domain" dm JOIN "Deployment" d ON d.id = dm.deployment_id
                   WHERE d.project_id = p.id) AS domains,
                  (SELECT COUNT(*) FROM "Domain" dm JOIN "Deployment" d ON d.id = dm.deployment_id
                   WHERE d.project_id = p.id AND dm.ssl_status IN ('ERROR', 'EXPIRED')) AS domain_issues,
                  (SELECT jsonb_build_object(
                       'id', d.id,
                       'version', snap.version,
                       'status', d.status::TEXT,
                       'at', COALESCE(d.deployed_at, d.created_at)
                   )
                   FROM "Deployment" d
                   LEFT JOIN "DeploymentSnapshot" snap ON snap.deployment_id = d.id
                   WHERE d.project_id = p.id
                   ORDER BY d.created_at DESC LIMIT 1) AS latest_deployment
           FROM "Project" p
           LEFT JOIN LATERAL (
               SELECT u.email, u.suspended_at
               FROM "ProjectMember" pm JOIN "User" u ON u.id = pm.user_id
               WHERE pm.project_id = p.id AND pm.role = 'owner'
               ORDER BY (u.suspended_at IS NOT NULL), pm.created_at LIMIT 1
           ) owner_member ON TRUE"#,
    );
    if let Some(project_id) = project_id {
        query.push(" WHERE p.id = ").push_bind(project_id);
    }
    query.push(" ORDER BY p.created_at DESC LIMIT 500");
    Ok(query
        .build_query_as::<AdminSiteRow>()
        .fetch_all(&state.biz_context.pool)
        .await?)
}

fn admin_site_summary(site: &AdminSiteRow) -> Value {
    let owner_status = if site.owner_email.is_some() && site.owner_suspended_at.is_some() {
        "suspended"
    } else if site.owner_email.is_some() {
        "active"
    } else {
        "missing"
    };
    let latest = site.latest_deployment.clone().map(|mut latest| {
        if let Some(status) = latest.get("status").and_then(Value::as_str) {
            latest["status"] = json!(match status {
                "ACTIVE" => "READY",
                "PENDING" => "PENDING",
                "BUILDING" | "DEPLOYING" => "BUILDING",
                "FAILED" | "DELETED" => "FAILED",
                _ => status,
            });
        }
        latest
    });
    json!({
        "id": site.id,
        "name": site.name,
        "slug": site.slug,
        "owner": site.owner_email.as_deref(),
        "ownerStatus": owner_status,
        "pages": site.pages,
        "deployments": site.deployments,
        "languages": site.languages,
        "members": site.members,
        "domains": site.domains,
        "domainIssues": site.domain_issues,
        "publicVisibility": site.is_public,
        "takedownAt": site.takedown_at,
        "takedownReason": site.takedown_reason,
        "createdAt": site.created_at,
        "updatedAt": site.updated_at,
        "latestDeployment": latest,
    })
}

pub async fn sites_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let sites = load_admin_sites(&state, None).await?;
    Ok(Json(
        json!({ "data": sites.iter().map(admin_site_summary).collect::<Vec<_>>() }),
    ))
}

pub async fn site_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let site = load_admin_sites(&state, Some(&project_id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("Site not found".to_string()))?;
    let languages: Value = sqlx::query_scalar(
        r#"SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'code', code, 'label', name, 'direction', CASE WHEN is_rtl THEN 'RTL' ELSE 'LTR' END,
               'enabled', enabled, 'isDefault', is_default
           ) ORDER BY position), '[]'::JSONB)
           FROM "Language" WHERE project_id = $1"#,
    )
    .bind(&project_id)
    .fetch_one(&state.biz_context.pool)
    .await?;
    let members: Value = sqlx::query_scalar(
        r#"SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', pm.id, 'role', pm.role::TEXT, 'joinedAt', pm.created_at,
               'user', jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email,
                   'role', u.role, 'emailVerified', u.email_verified, 'suspendedAt', u.suspended_at)
           ) ORDER BY pm.created_at), '[]'::JSONB)
           FROM "ProjectMember" pm JOIN "User" u ON u.id = pm.user_id
           WHERE pm.project_id = $1"#,
    )
    .bind(&site.id)
    .fetch_one(&state.biz_context.pool)
    .await?;
    let invitations: Value = json!([]);
    let deployments = deployment_rows(&state, Some(&project_id), 30).await?;
    let domains = domain_rows(&state, Some(&project_id), 100).await?;
    let exports = export_rows(&state, Some(&project_id), 50).await?;
    let git = git_rows(&state, Some(&project_id), 10).await?;
    let (readers, audiences, jwt_provider) = tokio::try_join!(
        cms_db::reader_access::ReaderQueries::get_by_project(&state.biz_context.pool, &project_id),
        cms_db::reader_access::AudienceQueries::get_by_project(
            &state.biz_context.pool,
            &project_id
        ),
        cms_db::reader_access::JwtAccessProviderQueries::get_by_issuer_and_audience(
            &state.biz_context.pool,
            &project_id,
            &project_id,
        ),
    )?;
    let access_mode = if jwt_provider.is_some() || !readers.is_empty() || !audiences.is_empty() {
        "READERS"
    } else if site.is_public {
        "PUBLIC"
    } else {
        "PRIVATE"
    };
    let activity: Value = sqlx::query_scalar(
        r#"SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', e.id, 'type', e.event_type, 'actorUserId', e.user_id,
               'actorName', u.name, 'createdAt', e.created_at
           ) ORDER BY e.created_at DESC), '[]'::JSONB)
           FROM (
               SELECT * FROM "PlatformEvent"
               ORDER BY created_at DESC LIMIT 30
           ) e LEFT JOIN "User" u ON u.id = e.user_id"#,
    )
    .fetch_one(&state.biz_context.pool)
    .await?;
    let mut summary = admin_site_summary(&site);
    summary["description"] = json!(site.description);
    summary["workspace"] = json!({
        "name": "Workspace",
    });
    summary["usage"] = json!({
        "pages": site.pages,
        "deployments": site.deployments,
        "languages": site.languages,
        "members": site.members,
        "domains": site.domains,
    });
    summary["access"] = json!({
        "mode": access_mode,
        "readers": readers.len(),
        "audiences": audiences.len(),
        "jwtEnabled": jwt_provider.is_some(),
    });
    summary["languages"] = languages;
    summary["members"] = members;
    summary["invitations"] = invitations;
    summary["deployments"] = json!(deployments);
    summary["domains"] = json!(domains);
    summary["exports"] = json!({ "items": exports });
    summary["git"] = json!(git.first());
    summary["activity"] = activity;
    Ok(Json(json!({ "data": summary })))
}

#[derive(Debug, FromRow)]
struct DeploymentOpRow {
    id: String,
    project_id: String,
    project_name: String,
    version: Option<i64>,
    status: String,
    pages: i64,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

async fn deployment_rows(
    state: &AppState,
    project_id: Option<&str>,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT d.id, d.project_id, p.name AS project_name, snap.version,
                  d.status::TEXT AS status,
                  (SELECT COUNT(*) FROM "DeploymentSnapshotPageIndex" idx
                   WHERE idx.deployment_id = d.id AND UPPER(idx.kind) = 'PAGE') AS pages,
                  d.error_message, d.created_at, d.deployed_at AS completed_at
           FROM "Deployment" d JOIN "Project" p ON p.id = d.project_id
           LEFT JOIN "DeploymentSnapshot" snap ON snap.deployment_id = d.id"#,
    );
    if let Some(project_id) = project_id {
        query.push(" WHERE d.project_id = ").push_bind(project_id);
    }
    query
        .push(" ORDER BY d.created_at DESC LIMIT ")
        .push_bind(limit.clamp(1, 100));
    Ok(query
        .build_query_as::<DeploymentOpRow>()
        .fetch_all(&state.biz_context.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.id,
                "projectId": row.project_id,
                "projectName": row.project_name,
                "version": row.version,
                "status": match row.status.as_str() {
                    "ACTIVE" => "READY",
                    "PENDING" => "PENDING",
                    "BUILDING" | "DEPLOYING" => "BUILDING",
                    "FAILED" | "DELETED" => "FAILED",
                    other => other,
                },
                "pages": row.pages,
                "hasError": row.error_message.is_some(),
                "createdAt": row.created_at,
                "completedAt": row.completed_at,
            })
        })
        .collect())
}

#[derive(Debug, FromRow)]
struct DomainOpRow {
    id: String,
    project_id: String,
    project_name: String,
    hostname: String,
    verified_at: Option<DateTime<Utc>>,
    ssl_status: String,
    ssl_last_error: Option<String>,
    is_primary: bool,
    ssl_checked_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

async fn domain_rows(
    state: &AppState,
    project_id: Option<&str>,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT dm.id, p.id AS project_id, p.name AS project_name, dm.hostname,
                  dm.verified_at, dm.ssl_status, dm.ssl_last_error, dm.is_primary,
                  dm.ssl_checked_at, dm.created_at
           FROM "Domain" dm
           JOIN "Deployment" d ON d.id = dm.deployment_id
           JOIN "Project" p ON p.id = d.project_id"#,
    );
    if let Some(project_id) = project_id {
        query.push(" WHERE p.id = ").push_bind(project_id);
    }
    query
        .push(" ORDER BY dm.created_at DESC LIMIT ")
        .push_bind(limit.clamp(1, 100));
    Ok(query
        .build_query_as::<DomainOpRow>()
        .fetch_all(&state.biz_context.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.id,
                "projectId": row.project_id,
                "projectName": row.project_name,
                "domain": row.hostname,
                "verified": row.verified_at.is_some(),
                "dnsStatus": if row.verified_at.is_some() { "VERIFIED" } else { "PENDING" },
                "sslStatus": row.ssl_status,
                "isPrimary": row.is_primary,
                "hasError": row.ssl_last_error.is_some(),
                "lastCheckedAt": row.ssl_checked_at,
                "createdAt": row.created_at,
            })
        })
        .collect())
}

#[derive(Debug, FromRow)]
struct ExportOpRow {
    id: String,
    project_id: String,
    project_name: String,
    status: String,
    format: String,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

async fn export_rows(
    state: &AppState,
    project_id: Option<&str>,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT job.id, project.id AS project_id, project.name AS project_name,
                  job.status::TEXT AS status, job.format::TEXT AS format,
                  job.error_message, job.created_at, job.completed_at
           FROM "ExportJob" job
           JOIN "ExportSnapshot" snapshot ON snapshot.id = job.snapshot_id
           JOIN "Project" project ON project.id = snapshot.project_id"#,
    );
    if let Some(project_id) = project_id {
        query.push(" WHERE project.id = ").push_bind(project_id);
    }
    query
        .push(" ORDER BY job.created_at DESC LIMIT ")
        .push_bind(limit.clamp(1, 100));
    Ok(query
        .build_query_as::<ExportOpRow>()
        .fetch_all(&state.biz_context.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.id,
                "projectId": row.project_id,
                "projectName": row.project_name,
                "status": row.status,
                "format": row.format,
                "hasError": row.error_message.is_some(),
                "createdAt": row.created_at,
                "completedAt": row.completed_at,
            })
        })
        .collect())
}

#[derive(Debug, FromRow)]
struct GitOpRow {
    id: String,
    project_id: String,
    project_name: String,
    kind: String,
    status: String,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

async fn git_rows(
    state: &AppState,
    project_id: Option<&str>,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    let mut query: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"SELECT operation.id, project.id AS project_id, project.name AS project_name,
                  operation.operation_type::TEXT AS kind, operation.status::TEXT AS status,
                  operation.error_message, operation.created_at, operation.completed_at
           FROM "GitSyncOperation" operation
           JOIN "GitConnection" connection ON connection.id = operation.connection_id
           JOIN "Project" project ON project.id = connection.project_id"#,
    );
    if let Some(project_id) = project_id {
        query.push(" WHERE project.id = ").push_bind(project_id);
    }
    query
        .push(" ORDER BY operation.created_at DESC LIMIT ")
        .push_bind(limit.clamp(1, 100));
    Ok(query
        .build_query_as::<GitOpRow>()
        .fetch_all(&state.biz_context.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.id,
                "projectId": row.project_id,
                "projectName": row.project_name,
                "kind": row.kind,
                "status": row.status,
                "hasError": row.error_message.is_some(),
                "createdAt": row.created_at,
                "completedAt": row.completed_at,
            })
        })
        .collect())
}

pub async fn operations_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let (deployments, domains, exports, git) = tokio::try_join!(
        deployment_rows(&state, None, 100),
        domain_rows(&state, None, 100),
        export_rows(&state, None, 50),
        git_rows(&state, None, 50),
    )?;
    Ok(Json(json!({ "data": {
        "deployments": deployments,
        "domains": domains,
        "exports": exports,
        "git": git,
    } })))
}



#[derive(Deserialize)]
pub struct TakedownBody {
    reason: String,
}

pub async fn takedown_site_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
    Json(body): Json<TakedownBody>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    let reason = body.reason.trim();
    if reason.is_empty() || reason.len() > 500 {
        return Err(AppError::InvalidInput(
            "reason must be between 1 and 500 characters".to_string(),
        ));
    }
    cms_db::project::ProjectQueries::set_takedown(&state.biz_context.pool, &project_id, reason)
        .await?;
    Ok(Json(json!({ "data": { "ok": true } })))
}

pub async fn restore_site_handler(
    State(state): State<Arc<AppState>>,
    auth: AuthExtractor,
    Path(project_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &auth.user.id).await?;
    cms_db::project::ProjectQueries::restore_takedown(&state.biz_context.pool, &project_id).await?;
    Ok(Json(json!({ "data": { "ok": true } })))
}

use sqlx::Row;
