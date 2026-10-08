#![allow(dead_code)]

use std::{path::PathBuf, sync::Arc};

use axum::{
    body::{to_bytes, Body},
    http::{header, Method, Request, StatusCode},
    Extension, Router,
};
use chrono::{Duration, Utc};
use cms_config::Config;
use cms_middleware::app_state::AppState;
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

pub struct Seed {
    pub user_id: String,
    pub organization_id: String,
    pub session_token: String,
    pub platform_admin_id: String,
    pub platform_admin_session_token: String,
    pub storage_root: PathBuf,
}

pub fn session_cookie(token: &str) -> String {
    format!("better-auth.session_token={token}")
}

pub async fn request_with_headers(
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

pub async fn request(
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

pub async fn site_request(
    app: &Router,
    host: &str,
    uri: &str,
) -> anyhow::Result<(StatusCode, String)> {
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

pub async fn site_request_through_tls_proxy(
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

pub async fn wait_for_deployment_ready(
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

pub fn expect_status(
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

pub fn required_string<'a>(value: &'a Value, key: &str, context: &str) -> anyhow::Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("{context}: missing string field {key:?} in {value}"))
}

pub async fn seed(state: &Arc<AppState>) -> anyhow::Result<Seed> {
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

pub async fn cleanup(state: &AppState, seed: &Seed) -> anyhow::Result<()> {
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

pub async fn create_project(
    app: &Router,
    cookie: &str,
    name: String,
    organization_id: &str,
    is_public: bool,
) -> anyhow::Result<Value> {
    let (status, payload) = request(
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
    .await?;
    anyhow::ensure!(
        status == StatusCode::OK || status == StatusCode::CREATED,
        "create project: expected HTTP 200/201, got HTTP {} with body {}",
        status,
        payload
    );
    Ok(payload["data"].clone())
}

pub async fn create_page(
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
pub struct TestContext {
    pub state: Arc<AppState>,
    pub seed: Seed,
    pub app: Router,
    pub worker_shutdown_tx: tokio::sync::watch::Sender<bool>,
    pub worker_handles: Vec<tokio::task::JoinHandle<()>>,
}

impl TestContext {
    pub async fn setup() -> anyhow::Result<Self> {
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
        let worker_state =
            Arc::new(cms_worker::app_state::WorkerState::from_app_state(&state).await?);
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

    pub fn user_cookie(&self) -> String {
        session_cookie(&self.seed.session_token)
    }

    pub fn admin_cookie(&self) -> String {
        session_cookie(&self.seed.platform_admin_session_token)
    }

    pub async fn teardown(self) -> anyhow::Result<()> {
        let _ = self.worker_shutdown_tx.send(true);
        for handle in self.worker_handles {
            let _ = handle.await;
        }
        let cleanup_result = cleanup(&self.state, &self.seed).await;
        self.state.biz_context.pool.close().await;
        cleanup_result
    }
}
