# 05 - Test Strategy and Verification Framework

**Workspace:** `cms-rs-3` / `tatran0195/cms-rs-5`  
**Purpose:** Establish verification standards, security regression tests, and memory-safe CI execution.

---

## 1. Current Test Baseline & Gaps

### 1.1 Existing Coverage
- **Pure Unit Tests:** High quality in foundational security and utility crates:
  - `cms-error`: 6/6 tests passing (Status mapping, correlation ID injection, error redaction).
  - `cms-auth`: 16/16 tests passing (Argon2id password hashing, JWT generation, validation).
  - `cms-authz`: 2/2 integration tests passing (Zanzibar tuple evaluation).
  - `cms-authz-gate`: 3/3 tests passing (Context extraction and role hierarchy).
  - `cms-api-keys`: 3/3 tests passing (SHA-256 key hashing and prefix validation).
- **Integration & E2E Tests:**
  - Located in `crates/cms-api/tests`.
  - Decorated with `#[ignore = "requires a disposable PostgreSQL database; run cargo xtask e2e"]`.
  - Require a live PostgreSQL instance with applied migrations.

### 1.2 Critical Missing Test Scenarios
1. **Negative Authorization & Cross-Tenant Access:**
   - No negative tests verify that User A cannot read or delete User B's page via `/api/pages/{id}`.
   - No tests verify that a Viewer cannot remove an Admin or Owner via `/api/projects/{id}/members/{id}`.
   - No tests verify that unauthenticated or non-admin users cannot configure webhooks via `/api/projects/{id}/integrations`.
2. **Background Job Dispatch & Claiming:**
   - No automated tests verify that triggering Git sync or document export inserts a job into `cms-queue` and processes it in `cms-worker`.
3. **Database Constraint & Schema Alignment:**
   - No tests assert that updating a member role to `admin` or `editor` succeeds without PostgreSQL check constraint violations.

---

## 2. Proposed Test Fixtures & Utilities

### 2.1 Mock Authorization Contexts (`TestAuthContext`)
To test handlers without spawning full database sessions:
```rust
pub struct TestAuthContext {
    pub user_id: Uuid,
    pub platform_role: PlatformRole,
}

impl TestAuthContext {
    pub fn regular_user() -> Self {
        Self {
            user_id: Uuid::new_v4(),
            platform_role: PlatformRole::User,
        }
    }
    pub fn platform_admin() -> Self {
        Self {
            user_id: Uuid::new_v4(),
            platform_role: PlatformRole::SuperAdmin,
        }
    }
}
```

### 2.2 Disposable Database Strategy
Integration tests require a clean database state:
- Use `cargo xtask e2e` which spawns a PostgreSQL container or local Postgres instance on a distinct port (e.g., `5433`).
- Run migrations before test suites: `cms_db::run_migrations(&pool).await`.
- Wrap tests in transactions or use unique project UUIDs per test run.

---

## 3. Security Regression Test Specifications

### Security Test 1: BOLA / IDOR Standalone Page Guard
```rust
#[tokio::test]
async fn test_standalone_page_idor_protection() {
    let ctx = TestContext::setup().await.unwrap();
    let owner_cookie = ctx.user_cookie();
    let intruder_cookie = ctx.secondary_user_cookie();

    // 1. Owner creates project & page
    let project = create_test_project(&ctx.app, &owner_cookie, "Secret Project").await;
    let page = create_test_page(&ctx.app, &owner_cookie, project.id, "Secret Page").await;

    // 2. Intruder attempts to fetch page by ID via standalone route
    let response = request(&ctx.app, Method::GET, &format!("/api/pages/{}", page.id), Some(&intruder_cookie), None).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Cross-project page access must be forbidden");

    // 3. Intruder attempts to delete page by ID
    let del_resp = request(&ctx.app, Method::DELETE, &format!("/api/pages/{}", page.id), Some(&intruder_cookie), None).await.unwrap();
    assert_eq!(del_resp.status(), StatusCode::FORBIDDEN, "Cross-project page deletion must be forbidden");
}
```

### Security Test 2: Project Member Role Escalation Block
```rust
#[tokio::test]
async fn test_member_role_update_requires_admin() {
    let ctx = TestContext::setup().await.unwrap();
    let viewer_cookie = ctx.viewer_cookie();
    let project_id = ctx.seed.project_id;
    let target_member_id = ctx.seed.target_member_id;

    let payload = json!({ "role": "admin" });
    let response = request(&ctx.app, Method::PATCH, &format!("/api/projects/{}/members/{}", project_id, target_member_id), Some(&viewer_cookie), Some(payload)).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Viewers must not escalate member roles");
}
```

---

## 4. Execution Guidelines (Windows & CI Memory Protection)

Due to OS Error 1455 (paging file memory exhaustion when MSVC links 24 targets in parallel):

1. **Always cap test build concurrency:**
   ```bash
   cargo test --workspace -j 2
   ```
2. **Run targeted tests per crate during rapid iteration:**
   ```bash
   cargo test -p cms-authz-gate -j 2
   cargo test -p cms-api -j 2
   ```
3. **Rust Analyzer / Editor settings:**
   Set `rust-analyzer.cargo.extraArgs = ["-j", "2"]` to avoid background indexing memory spikes.
