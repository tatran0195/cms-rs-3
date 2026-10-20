use std::time::Instant;
use axum::http::StatusCode;
use tower::ServiceExt;
use cms_runner::{AppState, SiteInstance, create_runner_router, SitePageResponse};

async fn create_9k_docs_test_db() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory db");

    sqlx::raw_sql(
        r#"
        PRAGMA synchronous = OFF;
        PRAGMA journal_mode = OFF;

        CREATE TABLE export_meta (
            schema_version INTEGER NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            project_slug TEXT NOT NULL,
            exported_at TEXT NOT NULL
        );
        INSERT INTO export_meta VALUES (1, 'p-9k', 'Enterprise Benchmark Workspace', 'benchmark', '2026-10-21T00:00:00Z');

        CREATE TABLE project_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO project_config VALUES ('description', '"Enterprise Scale Benchmark"');

        CREATE TABLE languages (code TEXT PRIMARY KEY, label TEXT NOT NULL, is_default INTEGER NOT NULL, is_rtl INTEGER NOT NULL);
        INSERT INTO languages VALUES ('en', 'English', 1, 0);
        INSERT INTO languages VALUES ('ja', 'Japanese', 0, 0);
        INSERT INTO languages VALUES ('zh', 'Chinese', 0, 0);

        CREATE TABLE versions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL, is_default INTEGER NOT NULL);
        INSERT INTO versions VALUES ('v1', 'v1.0', 'v1.0', 1, 0);
        INSERT INTO versions VALUES ('v2', 'v2.0', 'v2.0', 2, 1);
        INSERT INTO versions VALUES ('v3', 'v3.0', 'v3.0', 3, 0);

        CREATE TABLE pages (
            id TEXT PRIMARY KEY,
            custom_id TEXT,
            version_id TEXT NOT NULL,
            parent_id TEXT,
            kind TEXT NOT NULL,
            slug TEXT NOT NULL,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            icon TEXT,
            sort_order INTEGER NOT NULL
        );

        CREATE TABLE page_content (
            page_id TEXT NOT NULL,
            language TEXT NOT NULL,
            markdown TEXT NOT NULL,
            description TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (page_id, language)
        );

        CREATE VIRTUAL TABLE page_fts USING fts5(page_id UNINDEXED, version_id UNINDEXED, language UNINDEXED, title, content);
        "#
    )
    .execute(&pool)
    .await
    .unwrap();

    let versions = ["v1", "v2", "v3"];
    let languages = [
        ("en", "Overview of Enterprise System", "Complete guide for enterprise documentation architecture with distributed clustering and raft consensus."),
        ("ja", "エンタープライズシステムの概要", "分散クラスタリングとRaft合意形成を備えたエンタープライズドキュメントアーキテクチャの完全ガイド。"),
        ("zh", "企业级系统概述", "包含分布式集群和Raft共识算法的企业级文档架构完整指南。"),
    ];

    sqlx::raw_sql("BEGIN TRANSACTION;").execute(&pool).await.unwrap();

    for ver in versions {
        let mut sort = 0;
        for g in 1..=100 {
            sort += 1;
            let group_id = format!("{}_g{}", ver, g);
            let group_path = format!("/g{}", g);
            let group_title = format!("Module Group #{}", g);

            sqlx::query("INSERT INTO pages VALUES (?1, NULL, ?2, NULL, 'GROUP', ?3, ?4, ?5, NULL, ?6)")
                .bind(&group_id)
                .bind(ver)
                .bind(format!("g{}", g))
                .bind(&group_title)
                .bind(&group_path)
                .bind(sort)
                .execute(&pool)
                .await
                .unwrap();

            for p in 1..=30 {
                sort += 1;
                let page_id = format!("{}_g{}_p{}", ver, g, p);
                let page_slug = format!("p{}", p);
                let page_path = format!("/g{}/p{}", g, p);
                let page_title = format!("Component Standard #{}-{}", g, p);
                let custom_id = if p == 1 { Some(format!("{}-g{}-intro", ver, g)) } else { None };

                sqlx::query("INSERT INTO pages VALUES (?1, ?2, ?3, ?4, 'PAGE', ?5, ?6, ?7, NULL, ?8)")
                    .bind(&page_id)
                    .bind(&custom_id)
                    .bind(ver)
                    .bind(&group_id)
                    .bind(&page_slug)
                    .bind(&page_title)
                    .bind(&page_path)
                    .bind(sort)
                    .execute(&pool)
                    .await
                    .unwrap();

                for (lang, title_prefix, desc) in languages {
                    let md = format!("# {} - {}\n\n{}\n\n## Section Alpha\n\nDeep specifications.\n\n### Sub-bullet\n\nDetailed breakdown.", title_prefix, page_title, desc);
                    sqlx::query("INSERT INTO page_content VALUES (?1, ?2, ?3, ?4, '2026-10-21T00:00:00Z')")
                        .bind(&page_id)
                        .bind(lang)
                        .bind(&md)
                        .bind(desc)
                        .execute(&pool)
                        .await
                        .unwrap();

                    sqlx::query("INSERT INTO page_fts VALUES (?1, ?2, ?3, ?4, ?5)")
                        .bind(&page_id)
                        .bind(ver)
                        .bind(lang)
                        .bind(&page_title)
                        .bind(&md)
                        .execute(&pool)
                        .await
                        .unwrap();
                }
            }
        }
    }

    sqlx::raw_sql("COMMIT;").execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn test_9000_docs_benchmark_performance_and_isolation() {
    let pool = create_9k_docs_test_db().await;

    // 1. Measure Instance Load & Pre-warm Time
    let t_start = Instant::now();
    let instance = std::sync::Arc::new(SiteInstance::load(&pool).await.expect("load 9000 docs instance"));
    let load_duration = t_start.elapsed();
    println!(">>> SiteInstance::load for 9,000 docs took: {:?}", load_duration);
    assert!(load_duration.as_millis() < 400, "Instance load must be under 400ms, took {:?}", load_duration);
    assert_eq!(instance.pages_by_id.len(), 3100 * 3); // 100 groups + 3000 pages per version = 3,100 * 3 = 9,300

    let state = AppState::new(pool.clone(), instance, None);
    let app = create_runner_router(state, None);

    // 2. Measure Root Page Query
    let t0 = Instant::now();
    let req = axum::http::Request::builder()
        .uri("/api/v1/page?path=/")
        .body(axum::body::Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let d0 = t0.elapsed();
    assert_eq!(res.status(), StatusCode::OK);
    println!(">>> Root page query took: {:?}", d0);
    assert!(d0.as_millis() <= 5, "Root page query must be <= 5ms, took {:?}", d0);

    // 3. Measure Deep Nested Leaf Query across 100 iterations (p99 latency)
    let mut latencies = Vec::with_capacity(100);
    for i in 1..=100 {
        let g = (i % 100) + 1;
        let p = (i % 30) + 1;
        let path = format!("/g{}/p{}", g, p);
        let uri = format!("/api/v1/page?path={}&version=v2.0&lang=ja", path);

        let t = Instant::now();
        let req = axum::http::Request::builder()
            .uri(&uri)
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let elapsed = t.elapsed();
        assert_eq!(res.status(), StatusCode::OK);
        latencies.push(elapsed);
    }

    latencies.sort();
    let median = latencies[50];
    let p95 = latencies[95];
    let p99 = latencies[99];
    println!(">>> 100 random page queries — Median: {:?}, P95: {:?}, P99: {:?}", median, p95, p99);
    assert!(median.as_micros() < 2500, "Median page query must be under 2.5ms, got {:?}", median);

    // 4. Group unwrapping to first child
    let req_group = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g10&version=v1.0&lang=en")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_group = app.clone().oneshot(req_group).await.unwrap();
    assert_eq!(res_group.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(res_group.into_body(), usize::MAX).await.unwrap();
    let page: SitePageResponse = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(page.page.path, "/g10/p1");
    assert!(page.next.is_some());

    // 5. Bootstrap latency
    let tb = Instant::now();
    let req_b = axum::http::Request::builder()
        .uri("/api/v1/bootstrap?version=v3.0&lang=zh")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_b = app.clone().oneshot(req_b).await.unwrap();
    let db = tb.elapsed();
    assert_eq!(res_b.status(), StatusCode::OK);
    println!(">>> Bootstrap query took: {:?}", db);
    assert!(db.as_millis() <= 15, "Bootstrap must be <= 15ms, took {:?}", db);

    // 6. Strict Language Isolation: non-existent language returns 404
    let req_lang404 = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g1/p1&lang=fr")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_lang404 = app.clone().oneshot(req_lang404).await.unwrap();
    assert_eq!(res_lang404.status(), StatusCode::NOT_FOUND);

    // 7. Strict Version Isolation: non-existent version returns 404
    let req_ver404 = axum::http::Request::builder()
        .uri("/api/v1/page?path=/g1/p1&version=v99.0")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_ver404 = app.clone().oneshot(req_ver404).await.unwrap();
    assert_eq!(res_ver404.status(), StatusCode::NOT_FOUND);

    // 8. FTS5 Search on 27,000 localized records
    let ts = Instant::now();
    let req_s = axum::http::Request::builder()
        .uri("/api/v1/search?q=consensus&version=v2.0&lang=en")
        .body(axum::body::Body::empty())
        .unwrap();
    let res_s = app.oneshot(req_s).await.unwrap();
    let ds = ts.elapsed();
    assert_eq!(res_s.status(), StatusCode::OK);
    println!(">>> Search query over 27,000 localized records took: {:?}", ds);
    assert!(ds.as_millis() < 100, "Search must be under 100ms in debug mode, took {:?}", ds);
}
