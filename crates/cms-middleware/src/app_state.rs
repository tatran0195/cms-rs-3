//! Application state
//!
//! This module contains the shared application state that is passed to all handlers.

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use cms_biz::BizContext;
use cms_config::Config;
use cms_error::AppError;
use cms_queue::JobQueue;
use cms_storage::Storage;

/// Application state shared across all handlers
#[derive(Clone)]
pub struct AppState {
    /// Application configuration
    pub config: Arc<Config>,
    /// Business context with database pool and access control
    pub biz_context: BizContext,
    /// Storage backend
    pub storage: Arc<dyn Storage>,
    /// Job queue
    pub job_queue: Arc<dyn JobQueue>,
    /// Search engine
    pub search_engine: Arc<dyn cms_search::SearchEngine>,
    /// Outbound email delivery used by auth and workflow handlers
    pub mailer: Arc<dyn cms_biz::email::Mailer>,
    /// Generation counter used to invalidate cached host-to-project resolutions.
    pub host_resolution_generation: Arc<AtomicU64>,
}

impl AppState {
    /// Returns a reference to the authorization engine state.
    #[inline]
    pub fn authz(&self) -> &Arc<cms_authz::AuthzState> {
        &self.biz_context.authz
    }

    /// Create AppState from full configuration
    pub async fn from_config(config: &Config) -> Result<Self, AppError> {
        Self::validate_config(config)?;
        let pool = cms_db::create_pool(&config.database.url).await?;
        cms_db::run_migrations(&pool).await?;
        let storage_box = cms_storage::create_storage(&config.storage).await?;
        let storage: Arc<dyn Storage> = Arc::from(storage_box);
        let job_queue = cms_queue::create_job_queue_with_pool(&config.queue, pool.clone()).await?;
        let search_engine = cms_search::create_search_engine(&config.search)?;
        let authz = Arc::new(cms_authz::AuthzState::new(
            pool.clone(),
            config.auth.system_admin_emails.clone(),
        ));
        let biz_context = BizContext::new(pool, authz);
        let mailer = cms_biz::email::create_mailer(config.mailer.as_ref())?;

        Ok(Self::new_with_mailer(
            config.clone(),
            biz_context,
            storage,
            job_queue,
            search_engine,
            mailer,
        ))
    }

    /// Create a new AppState with provided dependencies
    pub fn new(
        config: Config,
        biz_context: BizContext,
        storage: Arc<dyn Storage>,
        job_queue: Arc<dyn JobQueue>,
        search_engine: Arc<dyn cms_search::SearchEngine>,
    ) -> Self {
        Self::new_with_mailer(
            config,
            biz_context,
            storage,
            job_queue,
            search_engine,
            Arc::new(cms_biz::email::UnconfiguredMailer),
        )
    }

    /// Create state with an explicitly configured mail provider.
    pub fn new_with_mailer(
        config: Config,
        biz_context: BizContext,
        storage: Arc<dyn Storage>,
        job_queue: Arc<dyn JobQueue>,
        search_engine: Arc<dyn cms_search::SearchEngine>,
        mailer: Arc<dyn cms_biz::email::Mailer>,
    ) -> Self {
        Self {
            config: Arc::new(config),
            biz_context,
            storage,
            job_queue,
            search_engine,
            mailer,
            host_resolution_generation: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Invalidate cached host-to-project resolutions after a domain change.
    pub fn invalidate_host_resolution_cache(&self) {
        self.host_resolution_generation
            .fetch_add(1, Ordering::AcqRel);
    }

    /// Validate configuration invariants.
    ///
    /// In production mode, rejects startup if:
    /// - JWT or session secret equals a known default or is shorter than 32 chars
    /// - Database password is `postgres` or empty
    /// - Queue backend is in-memory
    pub fn validate_config(config: &Config) -> Result<(), AppError> {
        // Validate basic middleware configurations
        if config.security_headers.enable_hsts && config.security_headers.hsts_max_age == 0 {
            return Err(AppError::Validation(
                "HSTS max age cannot be 0 when HSTS is enabled".into(),
            ));
        }

        let admin_origin: crate::admin_origin::AdminOriginConfig = (&config.admin_origin).into();
        if let Err(err) = admin_origin.validate() {
            return Err(AppError::Validation(format!(
                "Invalid admin origin configuration: {err}"
            )));
        }

        if config.is_production() {
            const KNOWN_DEFAULT_SECRETS: &[&str] = &[
                "dev_session_secret_change_in_production",
                "dev_jwt_secret_change_in_production",
                "secret",
                "changeme",
                "password",
                "admin",
                "default",
            ];

            // 1. JWT and session secrets
            for (name, secret) in [
                ("Session", &config.auth.session_secret),
                ("JWT", &config.auth.jwt_secret),
            ] {
                let trimmed = secret.trim();
                if KNOWN_DEFAULT_SECRETS.contains(&trimmed) {
                    return Err(AppError::Validation(format!(
                        "Production configuration error: {name} secret cannot use a known default \
                         development value"
                    )));
                }
                if trimmed.len() < 32 {
                    return Err(AppError::Validation(format!(
                        "Production configuration error: {name} secret must be at least 32 \
                         characters long"
                    )));
                }
            }

            // 2. Database password cannot be empty or 'postgres'
            match extract_db_password(&config.database.url) {
                None => {
                    return Err(AppError::Validation(
                        "Production configuration error: Database password cannot be empty in \
                         production mode"
                            .into(),
                    ));
                }
                Some(ref pw) if pw.is_empty() => {
                    return Err(AppError::Validation(
                        "Production configuration error: Database password cannot be empty in \
                         production mode"
                            .into(),
                    ));
                }
                Some(ref pw) if pw.to_lowercase() == "postgres" => {
                    return Err(AppError::Validation(
                        "Production configuration error: Database password cannot be default \
                         'postgres' in production mode"
                            .into(),
                    ));
                }
                _ => {}
            }

            // 3. Queue backend cannot be in-memory in production mode
            if config.queue.backend.trim().eq_ignore_ascii_case("memory") {
                return Err(AppError::Validation(
                    "Production configuration error: Queue backend cannot be in-memory in \
                     production mode; configure PostgreSQL or durable queue"
                        .into(),
                ));
            }
        }

        Ok(())
    }
}

fn extract_db_password(url_str: &str) -> Option<String> {
    let after_scheme = url_str
        .strip_prefix("postgres://")
        .or_else(|| url_str.strip_prefix("postgresql://"))?;
    if !after_scheme.contains('@') {
        return None;
    }
    let user_info = after_scheme.split('@').next()?;
    let (_, password) = user_info.split_once(':')?;
    Some(password.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_production_config() -> Config {
        Config {
            environment: "deploy".to_string(),
            auth: cms_config::AuthConfig {
                session_secret: "a_very_secure_and_long_session_secret_for_production_32chars"
                    .to_string(),
                jwt_secret: "a_very_secure_and_long_jwt_secret_for_production_32chars".to_string(),
                ..Default::default()
            },
            database: cms_config::DatabaseConfig {
                url: "postgres://cms_user:strong_prod_password@localhost:5432/cms".to_string(),
                ..Default::default()
            },
            queue: cms_config::QueueConfig {
                backend: "postgres".to_string(),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    #[test]
    fn test_validate_config_dev_mode_passes_defaults() {
        let config = Config::default();
        assert!(!config.is_production());
        assert!(AppState::validate_config(&config).is_ok());
    }

    #[test]
    fn test_validate_config_production_valid() {
        let config = valid_production_config();
        assert!(config.is_production());
        assert!(AppState::validate_config(&config).is_ok());
    }

    #[test]
    fn test_validate_config_production_rejects_default_session_secret() {
        let mut config = valid_production_config();
        config.auth.session_secret = "dev_session_secret_change_in_production".to_string();
        let result = AppState::validate_config(&config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Session secret"));
    }

    #[test]
    fn test_validate_config_production_rejects_short_jwt_secret() {
        let mut config = valid_production_config();
        config.auth.jwt_secret = "short_secret".to_string();
        let result = AppState::validate_config(&config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("32 characters"));
    }

    #[test]
    fn test_validate_config_production_rejects_postgres_db_password() {
        let mut config = valid_production_config();
        config.database.url = "postgres://postgres:postgres@localhost:5432/cms".to_string();
        let result = AppState::validate_config(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("default 'postgres'"));
    }

    #[test]
    fn test_validate_config_production_rejects_empty_db_password() {
        let mut config = valid_production_config();
        config.database.url = "postgres://cms_user@localhost:5432/cms".to_string();
        let result = AppState::validate_config(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("password cannot be empty"));
    }

    #[test]
    fn test_validate_config_production_rejects_in_memory_queue() {
        let mut config = valid_production_config();
        config.queue.backend = "memory".to_string();
        let result = AppState::validate_config(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Queue backend cannot be in-memory"));
    }
}
