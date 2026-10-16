//! Export database queries

use chrono::{DateTime, Utc};
use cms_entity::export::{
    ExportArtifact, ExportFormat, ExportJob, ExportSchedule, ExportSnapshot, ExportStatus,
};
use cms_error::AppError;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

// ============================================
// ExportSnapshot
// ============================================

#[derive(Debug, FromRow)]
struct ExportSnapshotRow {
    id: String,
    project_id: String,
    branch_id: Option<String>,
    language_id: Option<String>,
    deployment_version: Option<i64>,
    pages_count: Option<i32>,
    created_at: DateTime<Utc>,
}

impl From<ExportSnapshotRow> for ExportSnapshot {
    fn from(row: ExportSnapshotRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            branch_id: row.branch_id,
            language_id: row.language_id,
            deployment_version: row.deployment_version,
            pages_count: row.pages_count.unwrap_or(0),
            created_at: row.created_at,
        }
    }
}

/// ExportSnapshot queries
pub struct ExportSnapshotQueries;

impl ExportSnapshotQueries {
    pub async fn get_by_id(
        pool: &PgPool,
        snapshot_id: &str,
    ) -> Result<Option<ExportSnapshot>, AppError> {
        let row = sqlx::query_as::<_, ExportSnapshotRow>(
            "SELECT * FROM \"ExportSnapshot\" WHERE id = $1",
        )
        .bind(snapshot_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn get_by_project(
        pool: &PgPool,
        project_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ExportSnapshot>, AppError> {
        let mut query_builder: QueryBuilder<Postgres> =
            QueryBuilder::new("SELECT * FROM \"ExportSnapshot\" WHERE project_id = ");
        query_builder.push_bind(project_id);

        query_builder.push(" ORDER BY created_at DESC");

        if let Some(limit) = limit {
            query_builder.push(" LIMIT ");
            query_builder.push_bind(limit);
        }

        if let Some(offset) = offset {
            query_builder.push(" OFFSET ");
            query_builder.push_bind(offset);
        }

        let rows = query_builder
            .build_query_as::<ExportSnapshotRow>()
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn count_by_project(pool: &PgPool, project_id: &str) -> Result<i64, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM \"ExportSnapshot\" WHERE project_id = $1")
                .bind(project_id)
                .fetch_one(pool)
                .await
                .map_err(|e| AppError::Database(e.into()))?;

        Ok(count)
    }

    pub async fn create(
        pool: &PgPool,
        project_id: &str,
        branch_id: Option<&str>,
        language_id: Option<&str>,
        deployment_version: Option<i64>,
        pages_count: Option<i32>,
    ) -> Result<ExportSnapshot, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let pages = pages_count.unwrap_or(0);

        let row = sqlx::query_as::<_, ExportSnapshotRow>(
            r#"
            INSERT INTO "ExportSnapshot" (id, project_id, branch_id, language_id, deployment_version, pages_count, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(branch_id)
        .bind(language_id)
        .bind(deployment_version)
        .bind(pages)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn delete(pool: &PgPool, snapshot_id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM \"ExportSnapshot\" WHERE id = $1")
            .bind(snapshot_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(result.rows_affected() > 0)
    }
}

// ============================================
// ExportJob
// ============================================

#[derive(Debug, FromRow)]
struct ExportJobRow {
    id: String,
    snapshot_id: String,
    project_id: Option<String>,
    format: ExportFormat,
    formats: Option<Vec<String>>,
    trigger: Option<String>,
    status: ExportStatus,
    output_path: Option<String>,
    error_message: Option<String>,
    started_at: Option<DateTime<Utc>>,
    completed_at: Option<DateTime<Utc>>,
    metrics: Option<serde_json::Value>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ExportJobRow> for ExportJob {
    fn from(row: ExportJobRow) -> Self {
        let metrics = row
            .metrics
            .and_then(|v| serde_json::from_value::<cms_entity::export::ExportMetrics>(v).ok());
        Self {
            id: row.id,
            snapshot_id: row.snapshot_id,
            project_id: row.project_id,
            format: row.format,
            formats: row.formats.unwrap_or_else(|| vec![format!("{:?}", row.format).to_uppercase()]),
            trigger: row.trigger.unwrap_or_else(|| "MANUAL".to_string()),
            status: row.status,
            output_path: row.output_path,
            error_message: row.error_message,
            started_at: row.started_at,
            completed_at: row.completed_at,
            metrics,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// ExportJob queries
pub struct ExportJobQueries;

impl ExportJobQueries {
    pub async fn get_by_id(pool: &PgPool, job_id: &str) -> Result<Option<ExportJob>, AppError> {
        let row = sqlx::query_as::<_, ExportJobRow>("SELECT * FROM \"ExportJob\" WHERE id = $1")
            .bind(job_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn get_by_snapshot(
        pool: &PgPool,
        snapshot_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ExportJob>, AppError> {
        let mut query_builder: QueryBuilder<Postgres> =
            QueryBuilder::new("SELECT * FROM \"ExportJob\" WHERE snapshot_id = ");
        query_builder.push_bind(snapshot_id);

        query_builder.push(" ORDER BY created_at DESC");

        if let Some(limit) = limit {
            query_builder.push(" LIMIT ");
            query_builder.push_bind(limit);
        }

        if let Some(offset) = offset {
            query_builder.push(" OFFSET ");
            query_builder.push_bind(offset);
        }

        let rows = query_builder
            .build_query_as::<ExportJobRow>()
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn count_by_snapshot(pool: &PgPool, snapshot_id: &str) -> Result<i64, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM \"ExportJob\" WHERE snapshot_id = $1")
                .bind(snapshot_id)
                .fetch_one(pool)
                .await
                .map_err(|e| AppError::Database(e.into()))?;

        Ok(count)
    }

    pub async fn get_by_project(
        pool: &PgPool,
        project_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ExportJob>, AppError> {
        let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "SELECT j.* FROM \"ExportJob\" j LEFT JOIN \"ExportSnapshot\" s ON j.snapshot_id = s.id \
             WHERE j.project_id = ",
        );
        query_builder.push_bind(project_id);
        query_builder.push(" OR s.project_id = ");
        query_builder.push_bind(project_id);
        query_builder.push(" ORDER BY j.created_at DESC");

        if let Some(limit) = limit {
            query_builder.push(" LIMIT ");
            query_builder.push_bind(limit);
        }

        if let Some(offset) = offset {
            query_builder.push(" OFFSET ");
            query_builder.push_bind(offset);
        }

        let rows = query_builder
            .build_query_as::<ExportJobRow>()
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn count_by_project(pool: &PgPool, project_id: &str) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM \"ExportJob\" j LEFT JOIN \"ExportSnapshot\" s ON j.snapshot_id = \
             s.id WHERE j.project_id = $1 OR s.project_id = $1",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(count)
    }

    pub async fn create(
        pool: &PgPool,
        snapshot_id: &str,
        project_id: Option<&str>,
        format: ExportFormat,
        formats: Option<&[String]>,
        trigger: Option<&str>,
        status: ExportStatus,
    ) -> Result<ExportJob, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let trig = trigger.unwrap_or("MANUAL");
        let format_strs: Vec<String> = formats
            .map(|f| f.to_vec())
            .unwrap_or_else(|| vec![format!("{:?}", format).to_uppercase()]);

        let row = sqlx::query_as::<_, ExportJobRow>(
            r#"
            INSERT INTO "ExportJob" (id, snapshot_id, project_id, format, formats, trigger, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#,
        )
        .bind(&id)
        .bind(snapshot_id)
        .bind(project_id)
        .bind(format)
        .bind(&format_strs)
        .bind(trig)
        .bind(status)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn update_status(
        pool: &PgPool,
        job_id: &str,
        status: ExportStatus,
    ) -> Result<ExportJob, AppError> {
        let now = Utc::now();
        let is_processing = status == ExportStatus::Processing;
        let is_terminal = status == ExportStatus::Completed || status == ExportStatus::Failed;
        let row = sqlx::query_as::<_, ExportJobRow>(
            r#"
            UPDATE "ExportJob"
            SET status = $1,
                started_at = CASE WHEN $2 THEN COALESCE(started_at, $3) ELSE started_at END,
                completed_at = CASE WHEN $4 THEN COALESCE(completed_at, $3) ELSE completed_at END,
                updated_at = $3
            WHERE id = $5
            RETURNING *
            "#,
        )
        .bind(status)
        .bind(is_processing)
        .bind(now)
        .bind(is_terminal)
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn update_output_path(
        pool: &PgPool,
        job_id: &str,
        output_path: &str,
    ) -> Result<ExportJob, AppError> {
        let row = sqlx::query_as::<_, ExportJobRow>(
            "UPDATE \"ExportJob\" SET output_path = $1, updated_at = $2 WHERE id = $3 RETURNING *",
        )
        .bind(output_path)
        .bind(Utc::now())
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn update_completed(
        pool: &PgPool,
        job_id: &str,
        output_path: &str,
        metrics: Option<&cms_entity::export::ExportMetrics>,
    ) -> Result<ExportJob, AppError> {
        let metrics_val = metrics.and_then(|m| serde_json::to_value(m).ok());
        let now = Utc::now();
        let row = sqlx::query_as::<_, ExportJobRow>(
            r#"
            UPDATE "ExportJob"
            SET status = $1,
                output_path = $2,
                metrics = $3,
                completed_at = $4,
                updated_at = $4
            WHERE id = $5
            RETURNING *
            "#,
        )
        .bind(ExportStatus::Completed)
        .bind(output_path)
        .bind(metrics_val)
        .bind(now)
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn update_error(
        pool: &PgPool,
        job_id: &str,
        error_message: &str,
    ) -> Result<ExportJob, AppError> {
        let row = sqlx::query_as::<_, ExportJobRow>(
            "UPDATE \"ExportJob\" SET error_message = $1, status = $2, updated_at = $3 WHERE id = \
             $4 RETURNING *",
        )
        .bind(error_message)
        .bind(ExportStatus::Failed)
        .bind(Utc::now())
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn delete(pool: &PgPool, job_id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM \"ExportJob\" WHERE id = $1")
            .bind(job_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(result.rows_affected() > 0)
    }
}

// ============================================
// ExportArtifact
// ============================================

#[derive(Debug, FromRow)]
struct ExportArtifactRow {
    id: String,
    job_id: String,
    format: Option<String>,
    file_name: String,
    file_size: i64,
    size: Option<i64>,
    storage_path: String,
    download_url: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<ExportArtifactRow> for ExportArtifact {
    fn from(row: ExportArtifactRow) -> Self {
        let sz = row.size.unwrap_or(row.file_size);
        Self {
            id: row.id,
            job_id: row.job_id,
            format: row.format,
            file_name: row.file_name,
            file_size: sz,
            storage_path: row.storage_path,
            download_url: row.download_url,
            created_at: row.created_at,
        }
    }
}

/// ExportArtifact queries
pub struct ExportArtifactQueries;

impl ExportArtifactQueries {
    pub async fn get_by_id(
        pool: &PgPool,
        artifact_id: &str,
    ) -> Result<Option<ExportArtifact>, AppError> {
        let row = sqlx::query_as::<_, ExportArtifactRow>(
            "SELECT * FROM \"ExportArtifact\" WHERE id = $1",
        )
        .bind(artifact_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn get_by_job(pool: &PgPool, job_id: &str) -> Result<Vec<ExportArtifact>, AppError> {
        let rows = sqlx::query_as::<_, ExportArtifactRow>(
            "SELECT * FROM \"ExportArtifact\" WHERE job_id = $1",
        )
        .bind(job_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn create(
        pool: &PgPool,
        job_id: &str,
        format: Option<&str>,
        file_name: &str,
        file_size: i64,
        storage_path: &str,
        download_url: Option<&str>,
    ) -> Result<ExportArtifact, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let row = sqlx::query_as::<_, ExportArtifactRow>(
            r#"
            INSERT INTO "ExportArtifact" (id, job_id, format, file_name, file_size, size, storage_path, download_url, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(job_id)
        .bind(format)
        .bind(file_name)
        .bind(file_size)
        .bind(file_size)
        .bind(storage_path)
        .bind(download_url)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn delete(pool: &PgPool, artifact_id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM \"ExportArtifact\" WHERE id = $1")
            .bind(artifact_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(result.rows_affected() > 0)
    }
}

// ============================================
// ExportSchedule
// ============================================

#[derive(Debug, FromRow)]
struct ExportScheduleRow {
    id: String,
    project_id: String,
    format: ExportFormat,
    frequency: String,
    day_of_week: Option<i32>,
    day_of_month: Option<i32>,
    time_of_day: String,
    is_active: bool,
    last_run_at: Option<DateTime<Utc>>,
    next_run_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ExportScheduleRow> for ExportSchedule {
    fn from(row: ExportScheduleRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            format: row.format,
            frequency: row.frequency,
            day_of_week: row.day_of_week,
            day_of_month: row.day_of_month,
            time_of_day: row.time_of_day,
            is_active: row.is_active,
            last_run_at: row.last_run_at,
            next_run_at: row.next_run_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// ExportSchedule queries
pub struct ExportScheduleQueries;

impl ExportScheduleQueries {
    pub async fn get_by_id(
        pool: &PgPool,
        schedule_id: &str,
    ) -> Result<Option<ExportSchedule>, AppError> {
        let row = sqlx::query_as::<_, ExportScheduleRow>(
            "SELECT * FROM \"ExportSchedule\" WHERE id = $1",
        )
        .bind(schedule_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn get_by_project(
        pool: &PgPool,
        project_id: &str,
    ) -> Result<Vec<ExportSchedule>, AppError> {
        let rows = sqlx::query_as::<_, ExportScheduleRow>(
            "SELECT * FROM \"ExportSchedule\" WHERE project_id = $1",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn create(
        pool: &PgPool,
        project_id: &str,
        format: ExportFormat,
        frequency: &str,
        day_of_week: Option<i32>,
        day_of_month: Option<i32>,
        time_of_day: &str,
        is_active: bool,
    ) -> Result<ExportSchedule, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let row = sqlx::query_as::<_, ExportScheduleRow>(
            r#"
            INSERT INTO "ExportSchedule" (id, project_id, format, frequency, day_of_week, day_of_month, time_of_day, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(project_id)
        .bind(format)
        .bind(frequency)
        .bind(day_of_week)
        .bind(day_of_month)
        .bind(time_of_day)
        .bind(is_active)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn update(
        pool: &PgPool,
        schedule_id: &str,
        is_active: Option<bool>,
        time_of_day: Option<&str>,
    ) -> Result<ExportSchedule, AppError> {
        let mut query_builder: QueryBuilder<Postgres> =
            QueryBuilder::new("UPDATE \"ExportSchedule\" SET ");

        let mut has_updates = false;
        if let Some(is_active) = is_active {
            query_builder.push("is_active = ");
            query_builder.push_bind(is_active);
            has_updates = true;
        }
        if let Some(time_of_day) = time_of_day {
            if has_updates {
                query_builder.push(", ");
            }
            query_builder.push("time_of_day = ");
            query_builder.push_bind(time_of_day);
            has_updates = true;
        }

        if has_updates {
            query_builder.push(", updated_at = ");
            query_builder.push_bind(Utc::now());
        }

        query_builder.push(" WHERE id = ");
        query_builder.push_bind(schedule_id);
        query_builder.push(" RETURNING *");

        let row = query_builder
            .build_query_as::<ExportScheduleRow>()
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(row.into())
    }

    pub async fn delete(pool: &PgPool, schedule_id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM \"ExportSchedule\" WHERE id = $1")
            .bind(schedule_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        Ok(result.rows_affected() > 0)
    }
}
