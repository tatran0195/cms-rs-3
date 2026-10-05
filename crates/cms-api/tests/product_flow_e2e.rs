//! PostgreSQL-backed product flow covering project creation, language-scoped
//! document creation, public resolution, real deployment artifacts, RBAC,
//! API keys, site features, and domain lifecycle.
//!
//! Run against a disposable database with `cargo xtask e2e`.

use std::{path::PathBuf, sync::Arc};

use axum::{
    body::{to_bytes, Body},
    http::{header, Method, Request, StatusCode},
    Extension, Router,
};
use chrono::{Duration, Timelike, Utc};
use cms_config::Config;
use cms_middleware::app_state::AppState;
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

struct Seed {
    user_id: String,
    organization_id: String,
    session_token: String,
    platform_admin_id: String,
    platform_admin_session_token: String,
    storage_root: PathBuf,
}

fn session_cookie(token: &str) -> String {
    format!("better-auth.session_token={token}")
}

async fn request_with_headers(
    app: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
    body: Option<Value>,
) -> anyhow::Result<(StatusCode, Value)> {
    let mut builder = Request::builder().method(method).uri(uri);
    for (name, val) in headers {
        builder = builder.header(*name, *val);
    }
    let request_body = match body {
        Some(value) => {
            builder = builder.header(header::CONTENT_TYPE, "application/json");
            Body::from(serde_json::to_vec(&value)?)
        }
        None => Body::empty(),
    };
    let response = app.clone().oneshot(builder.body(request_body)?).await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    let payload = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok((status, payload))
}

async fn request(
    app: &Router,
    method: Method,
    uri: &str,
    cookie: Option<&str>,
    body: Option<Value>,
) -> anyhow::Result<(StatusCode, Value)> {
    let mut headers = Vec::new();
    if let Some(cookie) = cookie {
        headers.push((header::COOKIE.as_str(), cookie));
    }
    request_with_headers(app, method, uri, &headers, body).await
}

async fn site_request(app: &Router, host: &str, uri: &str) -> anyhow::Result<(StatusCode, String)> {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(uri)
                .header(header::HOST, host)
                .body(Body::empty())?,
        )
        .await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    Ok((status, String::from_utf8(bytes.to_vec())?))
}

async fn site_request_through_tls_proxy(
    app: &Router,
    host: &str,
    uri: &str,
    proxy_secret: Option<&str>,
) -> anyhow::Result<(StatusCode, String)> {
    let mut request = Request::builder()
        .method(Method::GET)
        .uri(uri)
        .header(header::HOST, host)
        .header("x-forwarded-proto", "https");
    if let Some(secret) = proxy_secret {
        request = request.header("x-cms-proxy-token", secret);
    }
    let response = app.clone().oneshot(request.body(Body::empty())?).await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    Ok((status, String::from_utf8(bytes.to_vec())?))
}

async fn wait_for_deployment_ready(
    state: &AppState,
    deployment_id: &str,
) -> anyhow::Result<(i64, i64)> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        let deployment = cms_db::deployment::DeploymentQueries::get_by_id(
            &state.biz_context.pool,
            deployment_id,
        )
        .await?
        .ok_or_else(|| anyhow::anyhow!("deployment {deployment_id} disappeared"))?;
        match &deployment.status {
            cms_entity::deployment::DeploymentStatus::Active => {
                let snapshot = cms_db::deployment::DeploymentQueries::get_snapshot_by_deployment(
                    &state.biz_context.pool,
                    deployment_id,
                )
                .await?
                .ok_or_else(|| anyhow::anyhow!("ready deployment has no immutable snapshot"))?;
                let page_count = cms_db::deployment::DeploymentQueries::get_snapshot_page_count(
                    &state.biz_context.pool,
                    deployment_id,
                )
                .await?;
                return Ok((snapshot.version, page_count));
            }
            cms_entity::deployment::DeploymentStatus::Failed => {
                anyhow::bail!(
                    "deployment {deployment_id} failed: {}",
                    deployment
                        .error_message
                        .as_deref()
                        .unwrap_or("no error detail")
                );
            }
            _ if tokio::time::Instant::now() >= deadline => {
                anyhow::bail!("timed out waiting for deployment {deployment_id}");
            }
            _ => tokio::time::sleep(std::time::Duration::from_millis(25)).await,
        }
    }
}

fn expect_status(
    result: (StatusCode, Value),
    expected: StatusCode,
    operation: &str,
) -> anyhow::Result<Value> {
    let (status, payload) = result;
    anyhow::ensure!(
        status == expected,
        "{operation}: expected HTTP {}, got HTTP {} with body {}",
        expected,
        status,
        payload
    );
    Ok(payload)
}

fn required_string<'a>(value: &'a Value, key: &str, context: &str) -> anyhow::Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("{context}: missing string field {key:?} in {value}"))
}

async fn seed(state: &Arc<AppState>) -> anyhow::Result<Seed> {
    let registration_app = Router::new()
        .nest("/api", cms_api::create_api_router(state.clone()))
        .layer(Extension(state.clone()));
    let organization_id = Uuid::new_v4().to_string();
    let member_id = Uuid::new_v4().to_string();
    let session_id = Uuid::new_v4().to_string();
    let session_token = format!("e2e_{}", Uuid::new_v4().simple());
    let platform_admin_id = Uuid::new_v4().to_string();
    let platform_admin_session_id = Uuid::new_v4().to_string();
    let platform_admin_session_token = format!("e2e_admin_{}", Uuid::new_v4().simple());
    let email = format!("e2e-{}@example.invalid", Uuid::new_v4());
    let platform_admin_email = format!("e2e-admin-{}@example.invalid", Uuid::new_v4());
    let now = Utc::now();

    let registered_user = expect_status(
        request(
            &registration_app,
            Method::POST,
            "/api/auth/register",
            None,
            Some(json!({
                "email": email,
                "password": "E2E-Password-2026",
                "name": "Product E2E",
            })),
        )
        .await?,
        StatusCode::OK,
        "register the E2E user through the product auth route",
    )?;
    let user_id = required_string(&registered_user, "id", "registered E2E user")?.to_string();
    let signup_events: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "PlatformEvent"
           WHERE user_id = $1 AND event_type = 'signup_completed'"#,
    )
    .bind(&user_id)
    .fetch_one(&state.biz_context.pool)
    .await?;
    anyhow::ensure!(
        signup_events == 1,
        "registration should emit one trusted signup event"
    );

    sqlx::query(
        r#"INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
           VALUES ($1, $2, 'Platform Admin E2E', TRUE, 'admin', $3, $3)"#,
    )
    .bind(&platform_admin_id)
    .bind(platform_admin_email)
    .bind(now)
    .execute(&state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Organization" (id, name, slug, created_at, updated_at)
           VALUES ($1, 'Product E2E', $2, $3, $3)"#,
    )
    .bind(&organization_id)
    .bind(format!("e2e-{}", Uuid::new_v4().simple()))
    .bind(now)
    .execute(&state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Member" (id, user_id, organization_id, role, created_at, updated_at)
           VALUES ($1, $2, $3, 'OWNER', $4, $4)"#,
    )
    .bind(member_id)
    .bind(&user_id)
    .bind(&organization_id)
    .bind(now)
    .execute(&state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(session_id)
    .bind(&user_id)
    .bind(&session_token)
    .bind(now + Duration::hours(2))
    .bind(now)
    .execute(&state.biz_context.pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)"#,
    )
    .bind(platform_admin_session_id)
    .bind(&platform_admin_id)
    .bind(&platform_admin_session_token)
    .bind(now + Duration::hours(2))
    .bind(now)
    .execute(&state.biz_context.pool)
    .await?;

    Ok(Seed {
        user_id,
        organization_id,
        session_token,
        platform_admin_id,
        platform_admin_session_token,
        storage_root: state
            .config
            .storage
            .local_root
            .as_deref()
            .map(PathBuf::from)
            .ok_or_else(|| anyhow::anyhow!("E2E storage root was not configured"))?,
    })
}

async fn cleanup(state: &AppState, seed: &Seed) -> anyhow::Result<()> {
    sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#)
        .bind(&seed.organization_id)
        .execute(&state.biz_context.pool)
        .await?;
    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(&seed.user_id)
        .execute(&state.biz_context.pool)
        .await?;
    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(&seed.platform_admin_id)
        .execute(&state.biz_context.pool)
        .await?;
    if seed.storage_root.exists() {
        tokio::fs::remove_dir_all(&seed.storage_root).await?;
    }
    Ok(())
}

async fn create_project(
    app: &Router,
    cookie: &str,
    name: String,
    organization_id: &str,
    is_public: bool,
) -> anyhow::Result<Value> {
    let value = expect_status(
        request(
            app,
            Method::POST,
            "/api/app/projects",
            Some(cookie),
            Some(json!({
                "name": name,
                "organizationId": organization_id,
                "isPublic": is_public,
            })),
        )
        .await?,
        StatusCode::OK,
        "create project",
    )?;
    Ok(value["data"].clone())
}

async fn create_page(
    app: &Router,
    cookie: &str,
    project_id: &str,
    body: Value,
) -> anyhow::Result<Value> {
    let value = expect_status(
        request(
            app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages"),
            Some(cookie),
            Some(body),
        )
        .await?,
        StatusCode::OK,
        "create page",
    )?;
    Ok(value["data"].clone())
}

/// Test context encapsulating application state, seed data, routes, and worker handles.
struct TestContext {
    state: Arc<AppState>,
    seed: Seed,
    app: Router,
    worker_shutdown_tx: tokio::sync::watch::Sender<bool>,
    worker_handles: Vec<tokio::task::JoinHandle<()>>,
}

impl TestContext {
    async fn setup() -> anyhow::Result<Self> {
        let database_url = std::env::var("CMS_E2E_DATABASE_URL").map_err(|_| {
            anyhow::anyhow!("set CMS_E2E_DATABASE_URL to a disposable PostgreSQL database")
        })?;
        let mut config = Config::default();
        config.database.url = database_url;
        config.site.self_host = Some("cms.app".to_string());
        config.domain_tls.proxy_secret = Some("e2e-trusted-proxy-secret".to_string());
        let storage_root = std::env::temp_dir().join(format!("cms-product-e2e-{}", Uuid::new_v4()));
        config.storage.local_root = Some(storage_root.to_string_lossy().into_owned());

        let state = Arc::new(AppState::from_config(&config).await?);
        let worker_state = Arc::new(cms_worker::app_state::WorkerState::from_app_state(&state).await?);
        let (worker_shutdown_tx, worker_shutdown_rx) = tokio::sync::watch::channel(false);
        let worker_handles = cms_worker::start_consumers_with_shutdown(
            state.job_queue.clone(),
            worker_state,
            worker_shutdown_rx,
        )
        .await?;

        let seed_data = seed(&state).await?;
        let app = Router::new()
            .nest("/api", cms_api::create_api_router(state.clone()))
            .merge(cms_sites::sites_router(state.clone()))
            .layer(Extension(state.clone()));

        Ok(Self {
            state,
            seed: seed_data,
            app,
            worker_shutdown_tx,
            worker_handles,
        })
    }

    fn user_cookie(&self) -> String {
        session_cookie(&self.seed.session_token)
    }

    fn admin_cookie(&self) -> String {
        session_cookie(&self.seed.platform_admin_session_token)
    }

    async fn teardown(self) -> anyhow::Result<()> {
        let _ = self.worker_shutdown_tx.send(true);
        for handle in self.worker_handles {
            let _ = handle.await;
        }
        let cleanup_result = cleanup(&self.state, &self.seed).await;
        self.state.biz_context.pool.close().await;
        cleanup_result
    }
}

// =============================================================================
// Individual Focused E2E Test Cases
// =============================================================================

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_01_platform_admin_overview_and_invitations() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();
    let admin_cookie = ctx.admin_cookie();

    expect_status(
        request(&ctx.app, Method::GET, "/api/admin/sites", Some(&cookie), None).await?,
        StatusCode::FORBIDDEN,
        "organization owners are not platform administrators",
    )?;

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Admin E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "created project")?;

    let signup_at = Utc::now() - Duration::hours(2);
    for (event_type, created_at, metadata) in [
        ("signup_completed", signup_at, json!({})),
        ("page_edited", signup_at + Duration::minutes(20), json!({})),
        ("publish_clicked", signup_at + Duration::minutes(30), json!({ "auto": false })),
        ("publish_ready", signup_at - Duration::minutes(1), json!({ "auto": false })),
    ] {
        sqlx::query(
            r#"INSERT INTO "PlatformEvent" (id, organization_id, user_id, event_type, metadata, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&ctx.seed.organization_id)
        .bind(&ctx.seed.platform_admin_id)
        .bind(event_type)
        .bind(metadata)
        .bind(created_at)
        .execute(&ctx.state.biz_context.pool)
        .await?;
    }

    let overview = expect_status(
        request(&ctx.app, Method::GET, "/api/admin/overview", Some(&admin_cookie), None).await?,
        StatusCode::OK,
        "load platform-admin overview from persisted records",
    )?;
    anyhow::ensure!(overview["data"]["admins"].as_i64().is_some_and(|c| c >= 1));
    anyhow::ensure!(overview["data"]["sites"].as_i64().is_some_and(|c| c >= 1));

    let admin_user = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/admin/users/{}", ctx.seed.user_id), Some(&admin_cookie), None).await?,
        StatusCode::OK,
        "load user detail with actual memberships",
    )?;
    let workspaces = admin_user["data"]["workspaces"].as_array().ok_or_else(|| anyhow::anyhow!("workspaces is not array"))?;
    let ws = workspaces.iter().find(|w| w["organizationId"] == ctx.seed.organization_id).ok_or_else(|| anyhow::anyhow!("org missing"))?;
    anyhow::ensure!(ws["projectCount"].as_i64().is_some_and(|c| c >= 1));

    expect_status(
        request(&ctx.app, Method::POST, &format!("/api/admin/users/{}/suspend", ctx.seed.user_id), Some(&cookie), None).await?,
        StatusCode::FORBIDDEN,
        "organization owner cannot invoke platform user operations",
    )?;

    let invite = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/admin/organizations/invite",
            Some(&admin_cookie),
            Some(json!({
                "organizationName": format!("Invited E2E {}", Uuid::new_v4().simple()),
                "siteName": "Invited docs",
                "siteSlug": format!("invited-{}", Uuid::new_v4().simple()),
                "ownerEmail": format!("owner-{}@example.invalid", Uuid::new_v4().simple()),
                "delivery": "link",
            })),
        )
        .await?,
        StatusCode::OK,
        "platform admin creates owner invitation and starter site",
    )?;
    let invited_org_id = required_string(&invite["data"], "organizationId", "admin invite")?;
    let invited_project_id = required_string(&invite["data"], "projectId", "admin invite")?;
    let invitation_id = required_string(&invite["data"], "invitationId", "admin invite")?;

    let public_invitation = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/invitations/{invitation_id}"), None, None).await?,
        StatusCode::OK,
        "resolve invitation by public ID",
    )?;
    anyhow::ensure!(public_invitation["data"]["id"] == invitation_id);
    anyhow::ensure!(public_invitation["data"]["email"] == invite["data"]["ownerEmail"]);

    let starter_records: (i64, i64, i64) = sqlx::query_as(
        r#"SELECT
             (SELECT COUNT(*) FROM "Project" WHERE id = $1 AND organization_id = $2),
             (SELECT COUNT(*) FROM "Branch" WHERE project_id = $1 AND is_default),
             (SELECT COUNT(*) FROM "Language" WHERE project_id = $1 AND is_default AND code = 'en')"#,
    )
    .bind(invited_project_id)
    .bind(invited_org_id)
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(starter_records == (1, 1, 1));
    sqlx::query(r#"DELETE FROM "Organization" WHERE id = $1"#)
        .bind(invited_org_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    expect_status(
        request(&ctx.app, Method::POST, "/api/platform-events", None, Some(json!({ "event_type": "custom_test" }))).await?,
        StatusCode::UNAUTHORIZED,
        "reject unauthenticated event injection",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/platform-events",
            Some(&cookie),
            Some(json!({
                "event_type": "custom_test",
                "organization_id": ctx.seed.organization_id,
                "user_id": ctx.seed.platform_admin_id,
                "metadata": { "source": "e2e" },
            })),
        )
        .await?,
        StatusCode::OK,
        "record event using authenticated identity",
    )?;
    let recorded_user: String = sqlx::query_scalar(
        r#"SELECT user_id FROM "PlatformEvent" WHERE event_type = 'custom_test' ORDER BY created_at DESC LIMIT 1"#,
    )
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(recorded_user == ctx.seed.user_id);

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/platform-events",
            Some(&cookie),
            Some(json!({
                "event_type": "publish_ready",
                "organization_id": ctx.seed.organization_id,
                "metadata": { "auto": false },
            })),
        )
        .await?,
        StatusCode::FORBIDDEN,
        "prevent clients from spoofing trusted milestones",
    )?;

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_02_project_visibility_and_access_control() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let public_project = create_project(
        &ctx.app,
        &cookie,
        format!("Public E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let public_id = required_string(&public_project, "id", "public project")?;
    let public_slug = required_string(&public_project, "slug", "public project")?;

    let private_project = create_project(
        &ctx.app,
        &cookie,
        format!("Private E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        false,
    )
    .await?;
    let private_id = required_string(&private_project, "id", "private project")?;
    let private_slug = required_string(&private_project, "slug", "private project")?;

    let org_slug: String = sqlx::query_scalar(r#"SELECT slug FROM "Organization" WHERE id = $1"#)
        .bind(&ctx.seed.organization_id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;

    let public_host = format!("{public_slug}.cms.app");
    let (unreleased_status, _) = site_request(&ctx.app, &public_host, "/").await?;
    anyhow::ensure!(unreleased_status == StatusCode::NOT_FOUND, "unreleased public site hidden");

    let private_host = format!("{private_slug}.cms.app");
    let (private_status, _) = site_request(&ctx.app, &private_host, "/").await?;
    anyhow::ensure!(private_status == StatusCode::NOT_FOUND, "private project hidden from SSR");

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{public_id}"), None, None).await?,
        StatusCode::NOT_FOUND,
        "hide unreleased public project",
    )?;

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{private_id}"), None, None).await?,
        StatusCode::NOT_FOUND,
        "hide private project from public sites endpoint",
    )?;

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/projects/{org_slug}/{private_slug}"), None, None).await?,
        StatusCode::NOT_FOUND,
        "hide private project from legacy public route",
    )?;

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{private_id}"), None, None).await?,
        StatusCode::UNAUTHORIZED,
        "unauthenticated caller cannot access private project",
    )?;

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_03_language_scoping_and_bcp47_validation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Language E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let language_list = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "list project languages",
    )?;
    let languages = language_list["data"].as_array().ok_or_else(|| anyhow::anyhow!("not array"))?;
    let english = languages.iter().find(|l| l["isDefault"] == true).ok_or_else(|| anyhow::anyhow!("missing default language"))?;
    let english_id = required_string(english, "id", "english id")?;
    anyhow::ensure!(english["code"] == "en");

    let rtl_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({
                "code": "he-il",
                "name": "Hebrew (Israel)",
                "direction": "RTL",
                "config": { "reader": { "greeting": "שלום" } },
            })),
        )
        .await?,
        StatusCode::OK,
        "create RTL language",
    )?;
    let rtl_lang = rtl_resp["data"].clone();
    let rtl_id = required_string(&rtl_lang, "id", "rtl id")?;
    anyhow::ensure!(rtl_lang["code"] == "he-IL");
    anyhow::ensure!(rtl_lang["direction"] == "RTL");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "bad..tag", "name": "Broken" })),
        )
        .await?,
        StatusCode::BAD_REQUEST,
        "reject malformed language code",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "HE-il", "name": "Duplicate" })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject duplicate language code",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/app/projects/{project_id}/languages/{english_id}"),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::CONFLICT,
        "protect default language from deletion",
    )?;

    let _en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Welcome",
            "slug": "welcome",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "welcome-doc",
            "isPublished": true,
            "content": "# Welcome",
        }),
    )
    .await?;

    let _rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "ברוכים הבאים",
            "slug": "welcome",
            "kind": "PAGE",
            "languageId": rtl_id,
            "translationKey": "welcome-doc",
            "isPublished": true,
            "content": "# ברוכים הבאים",
        }),
    )
    .await?;

    let refreshed_languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read translation coverage",
    )?;
    let rtl_cov = refreshed_languages["data"]
        .as_array()
        .and_then(|langs| langs.iter().find(|l| l["id"] == rtl_id))
        .and_then(|l| l.get("coverage"))
        .ok_or_else(|| anyhow::anyhow!("coverage missing"))?;
    anyhow::ensure!(rtl_cov["sourcePageCount"] == 1);
    anyhow::ensure!(rtl_cov["pageCount"] == 1);
    anyhow::ensure!(rtl_cov["matchedPages"] == 1);

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_04_page_hierarchy_and_tree_reordering() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Hierarchy E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let rtl_lang = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "create rtl",
    )?;
    let rtl_id = rtl_lang["data"]["id"].as_str().unwrap();

    let en_group = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Guide",
            "slug": "guide",
            "kind": "GROUP",
            "languageId": english_id,
            "isPublished": true,
        }),
    )
    .await?;
    let en_group_id = required_string(&en_group, "id", "en group")?;

    let rtl_group = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "מדריך",
            "slug": "guide",
            "kind": "GROUP",
            "languageId": rtl_id,
            "isPublished": true,
        }),
    )
    .await?;
    let rtl_group_id = required_string(&rtl_group, "id", "rtl group")?;

    let rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "התחלה",
            "slug": "start",
            "kind": "PAGE",
            "parentId": rtl_group_id,
            "languageId": rtl_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# התחלה",
        }),
    )
    .await?;
    let rtl_page_id = required_string(&rtl_page, "id", "rtl page")?;
    anyhow::ensure!(rtl_page["path"] == "/guide/start");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages"),
            Some(&cookie),
            Some(json!({
                "title": "Cross scope",
                "slug": "cross-scope",
                "parentId": en_group_id,
                "languageId": rtl_id,
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject parenting under different language",
    )?;

    let draft_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Draft",
            "slug": "draft",
            "parentId": rtl_group_id,
            "languageId": rtl_id,
            "isPublished": false,
            "content": "Draft",
        }),
    )
    .await?;
    let draft_id = required_string(&draft_page, "id", "draft")?;

    let reorder = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 1 },
                    { "id": draft_id, "parentId": rtl_group_id, "position": 2 },
                ]
            })),
        )
        .await?,
        StatusCode::OK,
        "reorder tree",
    )?;
    anyhow::ensure!(reorder["data"]["success"] == true);

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": rtl_page_id, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 1 },
                    { "id": draft_id, "parentId": rtl_group_id, "position": 2 },
                ]
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject cycle",
    )?;

    let unnest = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_page_id, "parentId": rtl_group_id, "position": 0 },
                    { "id": draft_id, "parentId": null, "position": 1 },
                ]
            })),
        )
        .await?,
        StatusCode::OK,
        "unnest page to root",
    )?;
    anyhow::ensure!(unnest["data"]["success"] == true);

    let draft_row: (Option<String>, String) = sqlx::query_as(r#"SELECT parent_id, path FROM "Page" WHERE id = $1"#)
        .bind(draft_id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;
    anyhow::ensure!(draft_row.0.is_none());
    anyhow::ensure!(draft_row.1 == "/draft");

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [
                    { "id": rtl_group_id, "parentId": null, "position": 0 },
                    { "id": rtl_group_id, "parentId": null, "position": 1 },
                ]
            })),
        )
        .await?,
        StatusCode::BAD_REQUEST,
        "reject duplicate id in reorder",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [{ "id": rtl_group_id, "parentId": rtl_group_id, "position": 0 }],
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject self-parenting",
    )?;

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/pages/reorder"),
            Some(&cookie),
            Some(json!({
                "items": [{ "id": rtl_page_id, "parentId": "non-existent-id", "position": 0 }],
            })),
        )
        .await?,
        StatusCode::CONFLICT,
        "reject non-existent parent",
    )?;

    let del_group = expect_status(
        request(&ctx.app, Method::DELETE, &format!("/api/app/projects/{project_id}/pages/{rtl_group_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "delete group",
    )?;
    anyhow::ensure!(del_group["data"]["success"] == true);

    let reparented = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/pages/{rtl_page_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read reparented child",
    )?;
    anyhow::ensure!(reparented["data"]["path"] == "/start");
    anyhow::ensure!(reparented["data"]["parentId"].is_null());

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_05_publishing_immutability_and_ssr() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Publish E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;
    let project_slug = required_string(&project, "slug", "project")?;
    let public_host = format!("{project_slug}.cms.app");

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Getting started",
            "slug": "start",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# Getting started\n\nEnglish release content.",
        }),
    )
    .await?;
    let en_page_id = required_string(&en_page, "id", "en page")?;

    let deployment = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "E2E publish test" })),
        )
        .await?,
        StatusCode::OK,
        "publish project",
    )?;
    anyhow::ensure!(deployment["data"]["status"] == "PENDING");
    let deployment_id = required_string(&deployment["data"], "id", "deployment")?;

    let (version, page_count) = wait_for_deployment_ready(&ctx.state, deployment_id).await?;
    anyhow::ensure!(version == 1);
    anyhow::ensure!(page_count == 1);

    let en_artifact = ctx.state.storage.get(&format!("sites/{project_id}/{deployment_id}/en/start.html")).await?;
    let en_html = String::from_utf8(en_artifact.to_vec())?;
    anyhow::ensure!(en_html.contains("English release content"));

    let (ssr_status, ssr_html) = site_request(&ctx.app, &public_host, "/start").await?;
    anyhow::ensure!(ssr_status == StatusCode::OK);
    anyhow::ensure!(ssr_html.contains("<html lang=\"en\" dir=\"ltr\">"));
    anyhow::ensure!(ssr_html.contains("English release content"));
    anyhow::ensure!(ssr_html.contains(&format!("<link rel=\"canonical\" href=\"https://{public_host}/start\">")));

    let (root_status, root_html) = site_request(&ctx.app, &public_host, "/").await?;
    anyhow::ensure!(root_status == StatusCode::OK);
    anyhow::ensure!(root_html.contains("Getting started"));

    let (sitemap_status, sitemap_body) = site_request(&ctx.app, &public_host, "/sitemap.xml").await?;
    anyhow::ensure!(sitemap_status == StatusCode::OK);
    anyhow::ensure!(sitemap_body.contains("/start"));

    let (robots_status, _) = site_request(&ctx.app, &public_host, "/robots.txt").await?;
    anyhow::ensure!(robots_status == StatusCode::OK);

    let (manifest_status, _) = site_request(&ctx.app, &public_host, "/site.webmanifest").await?;
    anyhow::ensure!(manifest_status == StatusCode::OK);

    // Immutability: edit page after publish
    expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/app/projects/{project_id}/pages/{en_page_id}"),
            Some(&cookie),
            Some(json!({ "content": "# Getting started\n\nEditor change after v1." })),
        )
        .await?,
        StatusCode::OK,
        "edit page",
    )?;

    // SSR still serves v1 content
    let (ssr2_status, ssr2_html) = site_request(&ctx.app, &public_host, "/start").await?;
    anyhow::ensure!(ssr2_status == StatusCode::OK);
    anyhow::ensure!(ssr2_html.contains("English release content"));
    anyhow::ensure!(!ssr2_html.contains("Editor change after v1"));

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_06_public_search_and_grounded_qa() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("SearchQA E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let rtl_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "rtl",
    )?;
    let rtl_id = rtl_resp["data"]["id"].as_str().unwrap();

    let en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Search Guide",
            "slug": "guide",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Search Guide\n\nQuantum algorithms and distributed consensus.",
        }),
    )
    .await?;
    let en_page_id = required_string(&en_page, "id", "en page")?;

    let rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "מדריך חיפוש",
            "slug": "guide",
            "kind": "PAGE",
            "languageId": rtl_id,
            "isPublished": true,
            "content": "# מדריך חיפוש\n\nאלגוריתמי קוונטים וקונצנזוס מבוזר.",
        }),
    )
    .await?;
    let rtl_page_id = required_string(&rtl_page, "id", "rtl page")?;

    let deployment = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "SearchQA publish" })),
        )
        .await?,
        StatusCode::OK,
        "publish",
    )?;
    let deployment_id = required_string(&deployment["data"], "id", "deployment")?;
    wait_for_deployment_ready(&ctx.state, deployment_id).await?;

    let en_search = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/search?q=Quantum&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "en search",
    )?;
    anyhow::ensure!(en_search["data"]["hits"].as_array().is_some_and(|h| h.iter().any(|hit| hit["id"] == en_page_id)));

    let rtl_search = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/search?q=Quantum&lang=he-IL&version=main"), None, None).await?,
        StatusCode::OK,
        "rtl search isolation",
    )?;
    anyhow::ensure!(rtl_search["data"]["hits"].as_array().is_some_and(Vec::is_empty));

    let qa = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/public/sites/{project_id}/answer"),
            None,
            Some(json!({ "question": "אלגוריתמי", "lang": "he-IL", "version": "main" })),
        )
        .await?,
        StatusCode::OK,
        "grounded qa",
    )?;
    anyhow::ensure!(qa["data"]["mode"] == "extractive");
    anyhow::ensure!(qa["data"]["sources"].as_array().is_some_and(|s| s.iter().any(|src| src["id"] == rtl_page_id)));

    expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/public/sites/{project_id}/events"),
            None,
            Some(json!({
                "type": "page_view",
                "userId": &ctx.seed.user_id,
                "ip": "203.0.113.195",
                "metadata": { "path": "guide" },
            })),
        )
        .await?,
        StatusCode::OK,
        "public analytics event",
    )?;

    let stored: (Option<String>, Option<String>) = sqlx::query_as(
        r#"SELECT user_id, ip_address FROM "AnalyticsEvent" WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1"#,
    )
    .bind(project_id)
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(stored.0.is_none(), "user_id stripped for privacy");
    anyhow::ensure!(stored.1.is_none(), "ip stripped for privacy");

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_07_version_progression_and_deployment_rollback() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Rollback E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Version One",
            "slug": "page",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Initial Version 1 Content",
        }),
    )
    .await?;
    let page_id = required_string(&page, "id", "page")?;

    let dep1 = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "v1" }))).await?,
        StatusCode::OK,
        "dep1",
    )?;
    let dep1_id = required_string(&dep1["data"], "id", "dep1 id")?;
    let (v1, _) = wait_for_deployment_ready(&ctx.state, dep1_id).await?;
    anyhow::ensure!(v1 == 1);

    expect_status(
        request(
            &ctx.app,
            Method::PATCH,
            &format!("/api/app/projects/{project_id}/pages/{page_id}"),
            Some(&cookie),
            Some(json!({ "content": "# Updated Version 2 Content" })),
        )
        .await?,
        StatusCode::OK,
        "edit page for v2",
    )?;

    let dep2 = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "v2" }))).await?,
        StatusCode::OK,
        "dep2",
    )?;
    let dep2_id = required_string(&dep2["data"], "id", "dep2 id")?;
    let (v2, _) = wait_for_deployment_ready(&ctx.state, dep2_id).await?;
    anyhow::ensure!(v2 == 2);

    let pub_v2 = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=page&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "public read v2",
    )?;
    anyhow::ensure!(pub_v2["data"]["version"] == 2);
    anyhow::ensure!(pub_v2["data"]["page"]["content"].as_str().unwrap().contains("Updated Version 2 Content"));

    let rollback = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments/{dep1_id}/rollback"), Some(&cookie), Some(json!({}))).await?,
        StatusCode::OK,
        "rollback",
    )?;
    let rollback_id = required_string(&rollback["data"], "id", "rollback id")?;
    let (v3, _) = wait_for_deployment_ready(&ctx.state, rollback_id).await?;
    anyhow::ensure!(v3 == 3);

    let pub_v3 = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=page&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "public read rollback v3",
    )?;
    anyhow::ensure!(pub_v3["data"]["version"] == 3);
    anyhow::ensure!(pub_v3["data"]["page"]["content"].as_str().unwrap().contains("Initial Version 1 Content"));

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_08_custom_domain_lifecycle_and_tls_verification() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Domain E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let _page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Home",
            "slug": "home",
            "kind": "PAGE",
            "languageId": english_id,
            "isPublished": true,
            "content": "# Welcome Custom Domain",
        }),
    )
    .await?;

    let dep = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "initial" }))).await?,
        StatusCode::OK,
        "dep",
    )?;
    let dep_id = required_string(&dep["data"], "id", "dep id")?;
    wait_for_deployment_ready(&ctx.state, dep_id).await?;

    let custom_hostname = format!("docs-{}.example.invalid", Uuid::new_v4().simple());
    let custom_domain = cms_db::domain::DomainQueries::create(
        &ctx.state.biz_context.pool,
        dep_id,
        &custom_hostname,
        true,
    )
    .await?;

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/domains/tls-authorize?domain={custom_hostname}"), None, None).await?,
        StatusCode::NOT_FOUND,
        "unverified domain cannot authorize TLS",
    )?;

    cms_db::domain::DomainQueries::verify(&ctx.state.biz_context.pool, &custom_domain.id, &custom_domain.verification_token).await?;
    ctx.state.invalidate_host_resolution_cache();

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/domains/tls-authorize?domain={custom_hostname}"), None, None).await?,
        StatusCode::NO_CONTENT,
        "verified domain authorizes TLS",
    )?;

    let (custom_status, custom_html) = site_request(&ctx.app, &custom_hostname, "/home").await?;
    anyhow::ensure!(custom_status == StatusCode::OK);
    anyhow::ensure!(custom_html.contains("Welcome Custom Domain"));
    anyhow::ensure!(custom_html.contains(&format!("<link rel=\"canonical\" href=\"https://{custom_hostname}/home\">")));

    let resolved = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/domains/resolve?host={custom_hostname}"), None, None).await?,
        StatusCode::OK,
        "resolve domain",
    )?;
    anyhow::ensure!(resolved["data"]["projectId"] == project_id);
    anyhow::ensure!(resolved["data"]["verified"] == true);

    let (untrusted_tls_status, _) = site_request_through_tls_proxy(&ctx.app, &custom_hostname, "/", None).await?;
    anyhow::ensure!(untrusted_tls_status == StatusCode::OK);
    let pending_tls: String = sqlx::query_scalar(r#"SELECT ssl_status FROM "Domain" WHERE id = $1"#)
        .bind(&custom_domain.id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;
    anyhow::ensure!(pending_tls == "PENDING");

    let (trusted_tls_status, _) = site_request_through_tls_proxy(&ctx.app, &custom_hostname, "/", Some("e2e-trusted-proxy-secret")).await?;
    anyhow::ensure!(trusted_tls_status == StatusCode::OK);
    let active_tls: String = sqlx::query_scalar(r#"SELECT ssl_status FROM "Domain" WHERE id = $1"#)
        .bind(&custom_domain.id)
        .fetch_one(&ctx.state.biz_context.pool)
        .await?;
    anyhow::ensure!(active_tls == "ACTIVE");

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_09_preview_branches_and_isolation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Branch E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;
    let project_slug = required_string(&project, "slug", "project")?;
    let public_host = format!("{project_slug}.cms.app");

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let main_dep = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "main" }))).await?,
        StatusCode::OK,
        "main dep",
    )?;
    let main_dep_id = required_string(&main_dep["data"], "id", "main dep id")?;
    wait_for_deployment_ready(&ctx.state, main_dep_id).await?;

    let preview_branch_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches"),
            Some(&cookie),
            Some(json!({ "project_id": project_id, "name": "Preview", "is_protected": true })),
        )
        .await?,
        StatusCode::OK,
        "create preview branch",
    )?;
    let preview_branch_id = required_string(&preview_branch_resp["data"], "id", "preview branch id")?;

    let _preview_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Preview Only",
            "slug": "preview-only",
            "kind": "PAGE",
            "branchId": preview_branch_id,
            "languageId": english_id,
            "isPublished": true,
            "content": "Secret preview content",
        }),
    )
    .await?;

    let preview_dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches/{preview_branch_id}/merge"),
            Some(&cookie),
            Some(json!({})),
        )
        .await?,
        StatusCode::OK,
        "publish preview branch",
    )?;
    let preview_dep_id = required_string(&preview_dep["data"], "id", "preview dep id")?;
    wait_for_deployment_ready(&ctx.state, preview_dep_id).await?;

    let preview_read = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=preview-only&lang=en&version=preview"), None, None).await?,
        StatusCode::OK,
        "read preview page explicitly",
    )?;
    anyhow::ensure!(preview_read["data"]["page"]["content"].as_str().unwrap().contains("Secret preview content"));

    expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=preview-only&lang=en&version=main"), None, None).await?,
        StatusCode::NOT_FOUND,
        "preview page hidden on main branch",
    )?;

    let (preview_host_status, _) = site_request(&ctx.app, &public_host, "/preview-only").await?;
    anyhow::ensure!(preview_host_status == StatusCode::NOT_FOUND, "preview content not served on default host");

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_10_project_settings_and_site_features() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Settings E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let initial_settings = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/settings"), Some(&cookie), None).await?,
        StatusCode::OK,
        "get settings",
    )?;
    anyhow::ensure!(initial_settings["data"]["id"].is_string());

    let updated_settings = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/app/projects/{project_id}/settings"),
            Some(&cookie),
            Some(json!({
                "theme": "dark",
                "search_enabled": true,
                "comments_enabled": true,
            })),
        )
        .await?,
        StatusCode::OK,
        "update settings",
    )?;
    anyhow::ensure!(updated_settings["data"]["theme"] == "dark");
    anyhow::ensure!(updated_settings["data"]["search_enabled"] == true);
    anyhow::ensure!(updated_settings["data"]["comments_enabled"] == true);

    let fetched = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/settings"), Some(&cookie), None).await?,
        StatusCode::OK,
        "fetch updated settings",
    )?;
    anyhow::ensure!(fetched["data"]["theme"] == "dark");
    anyhow::ensure!(fetched["data"]["search_enabled"] == true);

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_11_organization_membership_and_rbac() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let second_email = format!("collab-{}@example.invalid", Uuid::new_v4());
    let second_user = expect_status(
        request(
            &ctx.app,
            Method::POST,
            "/api/auth/register",
            None,
            Some(json!({
                "email": second_email,
                "password": "Password123!",
                "name": "Collaborator User",
            })),
        )
        .await?,
        StatusCode::OK,
        "register second user",
    )?;
    let second_user_id = required_string(&second_user, "id", "second user")?;

    let initial_members = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list org members",
    )?;
    let members_arr = initial_members.as_array().ok_or_else(|| anyhow::anyhow!("members not array"))?;
    anyhow::ensure!(members_arr.len() == 1, "initial member count is 1 (owner)");

    let add_member = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/orgs/{}/members", ctx.seed.organization_id),
            Some(&cookie),
            Some(json!({ "user_id": second_user_id, "role": "MEMBER" })),
        )
        .await?,
        StatusCode::OK,
        "add member",
    )?;
    let membership_id = required_string(&add_member, "id", "membership id")?;

    let members_after_add = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list members after add",
    )?;
    anyhow::ensure!(members_after_add.as_array().unwrap().len() == 2);

    let updated_role = expect_status(
        request(
            &ctx.app,
            Method::PUT,
            &format!("/api/orgs/{}/members/{membership_id}", ctx.seed.organization_id),
            Some(&cookie),
            Some(json!({ "role": "ADMIN" })),
        )
        .await?,
        StatusCode::OK,
        "update member role",
    )?;
    anyhow::ensure!(updated_role["role"] == "ADMIN");

    let remove_member = expect_status(
        request(
            &ctx.app,
            Method::DELETE,
            &format!("/api/orgs/{}/members/{membership_id}", ctx.seed.organization_id),
            Some(&cookie),
            None,
        )
        .await?,
        StatusCode::OK,
        "remove member",
    )?;
    anyhow::ensure!(remove_member["success"] == true);

    let members_after_remove = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/orgs/{}/members", ctx.seed.organization_id), Some(&cookie), None).await?,
        StatusCode::OK,
        "list members after remove",
    )?;
    anyhow::ensure!(members_after_remove.as_array().unwrap().len() == 1);

    sqlx::query(r#"DELETE FROM "User" WHERE id = $1"#)
        .bind(second_user_id)
        .execute(&ctx.state.biz_context.pool)
        .await?;

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_12_api_tokens_lifecycle_and_authentication() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("ApiToken E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let created_key = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/api-keys"),
            Some(&cookie),
            Some(json!({ "name": "CI Automated Publisher" })),
        )
        .await?,
        StatusCode::OK,
        "create api key",
    )?;
    let key_id = required_string(&created_key["data"], "id", "key id")?;
    let raw_key = required_string(&created_key["data"], "key", "raw key")?;

    let key_headers = [("x-api-key", raw_key)];
    let (auth_status, pages_val) = request_with_headers(
        &ctx.app,
        Method::GET,
        &format!("/api/app/projects/{project_id}/pages"),
        &key_headers,
        None,
    )
    .await?;
    anyhow::ensure!(auth_status == StatusCode::OK, "api token authenticates request");
    anyhow::ensure!(pages_val["data"].is_array());

    let del_key = expect_status(
        request(&ctx.app, Method::DELETE, &format!("/api/app/projects/{project_id}/api-keys/{key_id}"), Some(&cookie), None).await?,
        StatusCode::OK,
        "delete api key",
    )?;
    anyhow::ensure!(del_key["data"]["id"] == key_id);

    let (revoked_status, _) = request_with_headers(
        &ctx.app,
        Method::GET,
        &format!("/api/app/projects/{project_id}/pages"),
        &key_headers,
        None,
    )
    .await?;
    anyhow::ensure!(revoked_status == StatusCode::UNAUTHORIZED, "revoked api token is rejected");

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_13_translation_linking_and_alternate_language_navigation() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("TransLinking E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "project")?;

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap();

    let rtl_lang = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({ "code": "he-il", "name": "Hebrew", "direction": "RTL" })),
        )
        .await?,
        StatusCode::OK,
        "create rtl",
    )?;
    let rtl_id = rtl_lang["data"]["id"].as_str().unwrap();

    let _en_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "Architecture Overview",
            "slug": "architecture",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "arch-overview-doc",
            "isPublished": true,
            "content": "# Architecture Overview",
        }),
    )
    .await?;

    let _rtl_page = create_page(
        &ctx.app,
        &cookie,
        project_id,
        json!({
            "title": "סקירת ארכיטקטורה",
            "slug": "mivne",
            "kind": "PAGE",
            "languageId": rtl_id,
            "translationKey": "arch-overview-doc",
            "isPublished": true,
            "content": "# סקירת ארכיטקטורה",
        }),
    )
    .await?;

    let dep = expect_status(
        request(&ctx.app, Method::POST, &format!("/api/app/projects/{project_id}/deployments"), Some(&cookie), Some(json!({ "message": "publish" }))).await?,
        StatusCode::OK,
        "publish",
    )?;
    let dep_id = required_string(&dep["data"], "id", "dep id")?;
    wait_for_deployment_ready(&ctx.state, dep_id).await?;

    let en_public = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=architecture&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "read en page",
    )?;
    anyhow::ensure!(en_public["data"]["page"]["title"] == "Architecture Overview");
    let en_alt_langs = en_public["data"]["languages"].as_array().ok_or_else(|| anyhow::anyhow!("languages missing"))?;
    anyhow::ensure!(en_alt_langs.iter().any(|item| item["code"] == "he-IL" && item["path"] == "mivne"));

    let rtl_public = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=mivne&lang=he-IL&version=main"), None, None).await?,
        StatusCode::OK,
        "read rtl page",
    )?;
    anyhow::ensure!(rtl_public["data"]["page"]["title"] == "סקירת ארכיטקטורה");
    let rtl_alt_langs = rtl_public["data"]["languages"].as_array().ok_or_else(|| anyhow::anyhow!("languages missing"))?;
    anyhow::ensure!(rtl_alt_langs.iter().any(|item| item["code"] == "en" && item["path"] == "architecture"));

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn test_14_atomic_project_creation_invariants() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Atomic Invariants {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "atomic project")?;

    let (project_count, branch_count, language_count, settings_count): (i64, i64, i64, i64) = sqlx::query_as(
        r#"SELECT
             (SELECT COUNT(*) FROM "Project" WHERE id = $1),
             (SELECT COUNT(*) FROM "Branch" WHERE project_id = $1 AND is_default = TRUE),
             (SELECT COUNT(*) FROM "Language" WHERE project_id = $1 AND is_default = TRUE AND code = 'en'),
             (SELECT COUNT(*) FROM "ProjectSettings" WHERE project_id = $1)"#,
    )
    .bind(project_id)
    .fetch_one(&ctx.state.biz_context.pool)
    .await?;
    anyhow::ensure!(project_count == 1, "project must exist");
    anyhow::ensure!(branch_count == 1, "default branch must exist atomically");
    anyhow::ensure!(language_count == 1, "default english language must exist atomically");
    anyhow::ensure!(settings_count == 1, "project settings must exist atomically");

    let pages_resp = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/pages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "read empty pages",
    )?;
    anyhow::ensure!(pages_resp["data"].as_array().is_some_and(Vec::is_empty));

    ctx.teardown().await
}

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL database; run `cargo xtask e2e`"]
async fn product_flow_creates_and_publishes_language_scoped_docs() -> anyhow::Result<()> {
    let ctx = TestContext::setup().await?;
    let cookie = ctx.user_cookie();
    let admin_cookie = ctx.admin_cookie();

    let project = create_project(
        &ctx.app,
        &cookie,
        format!("Product E2E {}", Uuid::new_v4().simple()),
        &ctx.seed.organization_id,
        true,
    )
    .await?;
    let project_id = required_string(&project, "id", "created project")?.to_string();
    let project_slug = required_string(&project, "slug", "created project")?.to_string();
    let public_host = format!("{project_slug}.cms.app");

    let languages = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/app/projects/{project_id}/languages"), Some(&cookie), None).await?,
        StatusCode::OK,
        "list languages",
    )?;
    let english_id = languages["data"][0]["id"].as_str().unwrap().to_string();

    let rtl_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/languages"),
            Some(&cookie),
            Some(json!({
                "code": "he-il",
                "name": "Hebrew (Israel)",
                "direction": "RTL",
                "config": { "reader": { "greeting": "שלום" } },
            })),
        )
        .await?,
        StatusCode::OK,
        "create RTL",
    )?;
    let rtl_id = rtl_resp["data"]["id"].as_str().unwrap().to_string();

    let en_page = create_page(
        &ctx.app,
        &cookie,
        &project_id,
        json!({
            "title": "Getting started",
            "slug": "start",
            "kind": "PAGE",
            "languageId": english_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# Getting started\n\nEnglish release content.",
        }),
    )
    .await?;
    let en_page_id = required_string(&en_page, "id", "en page")?.to_string();

    let rtl_page = create_page(
        &ctx.app,
        &cookie,
        &project_id,
        json!({
            "title": "התחלה",
            "slug": "start",
            "kind": "PAGE",
            "languageId": rtl_id,
            "translationKey": "getting-started",
            "isPublished": true,
            "content": "# התחלה\n\nתוכן גרסה עברית.",
        }),
    )
    .await?;
    let rtl_page_id = required_string(&rtl_page, "id", "rtl page")?.to_string();

    let dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/deployments"),
            Some(&cookie),
            Some(json!({ "message": "E2E release" })),
        )
        .await?,
        StatusCode::OK,
        "publish",
    )?;
    let deployment_id = required_string(&dep["data"], "id", "deployment")?;
    let (v1, p1) = wait_for_deployment_ready(&ctx.state, deployment_id).await?;
    anyhow::ensure!(v1 == 1 && p1 == 2);

    let (ssr_status, ssr_html) = site_request(&ctx.app, &public_host, "/start").await?;
    anyhow::ensure!(ssr_status == StatusCode::OK);
    anyhow::ensure!(ssr_html.contains("English release content"));

    let en_search = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/search?q=English&lang=en&version=main"), None, None).await?,
        StatusCode::OK,
        "search",
    )?;
    anyhow::ensure!(en_search["data"]["hits"].as_array().is_some_and(|h| h.iter().any(|hit| hit["id"] == en_page_id)));

    let qa = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/public/sites/{project_id}/answer"),
            None,
            Some(json!({ "question": "התחלה", "lang": "he-IL", "version": "main" })),
        )
        .await?,
        StatusCode::OK,
        "qa",
    )?;
    anyhow::ensure!(qa["data"]["sources"].as_array().is_some_and(|s| s.iter().any(|src| src["id"] == rtl_page_id)));

    let custom_hostname = format!("docs-{}.example.invalid", Uuid::new_v4().simple());
    let custom_domain = cms_db::domain::DomainQueries::create(
        &ctx.state.biz_context.pool,
        deployment_id,
        &custom_hostname,
        true,
    )
    .await?;
    cms_db::domain::DomainQueries::verify(&ctx.state.biz_context.pool, &custom_domain.id, &custom_domain.verification_token).await?;
    ctx.state.invalidate_host_resolution_cache();

    let (custom_status, _) = site_request(&ctx.app, &custom_hostname, "/start").await?;
    anyhow::ensure!(custom_status == StatusCode::OK);

    let preview_branch_resp = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches"),
            Some(&cookie),
            Some(json!({ "project_id": project_id, "name": "Preview", "is_protected": true })),
        )
        .await?,
        StatusCode::OK,
        "create preview branch",
    )?;
    let preview_branch_id = required_string(&preview_branch_resp["data"], "id", "preview branch id")?;

    let preview_page = create_page(
        &ctx.app,
        &cookie,
        &project_id,
        json!({
            "title": "Preview Only",
            "slug": "preview-only",
            "kind": "PAGE",
            "branchId": preview_branch_id,
            "languageId": english_id,
            "isPublished": true,
            "content": "Secret preview content",
        }),
    )
    .await?;
    let preview_page_id = required_string(&preview_page, "id", "preview page id")?;

    let preview_dep = expect_status(
        request(
            &ctx.app,
            Method::POST,
            &format!("/api/app/projects/{project_id}/branches/{preview_branch_id}/merge"),
            Some(&cookie),
            Some(json!({})),
        )
        .await?,
        StatusCode::OK,
        "publish preview",
    )?;
    let preview_dep_id = required_string(&preview_dep["data"], "id", "preview dep id")?;
    wait_for_deployment_ready(&ctx.state, preview_dep_id).await?;

    let preview_read = expect_status(
        request(&ctx.app, Method::GET, &format!("/api/public/sites/{project_id}/page?path=preview-only&lang=en&version=preview"), None, None).await?,
        StatusCode::OK,
        "read preview",
    )?;
    anyhow::ensure!(preview_read["data"]["page"]["id"] == preview_page_id);

    ctx.teardown().await
}
