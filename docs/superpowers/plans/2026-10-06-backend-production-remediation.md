# Backend Production Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate critical security vulnerabilities, broken concurrency primitives, fake business logic, and lifecycle flaws identified in the backend audit to make `cms-rs-3` enterprise production ready.

**Architecture:** Enforce strict network boundary security (pre-dial IP validation preventing SSRF), replace CPU-heavy Basic Auth with standard token/session mechanisms, sanitize client-facing error payloads, serialize atomic operations via PostgreSQL invariants, and decouple queue operations.

**Tech Stack:** Rust 2021, Axum 0.8, Tokio 1.x, SQLx 0.9 (PostgreSQL), Reqwest 0.12, Argon2, Tracing, Uuid.

## Global Constraints

- Platform Purpose: Internal Company Deployment (ADR 001). No public multi-tenant SaaS features.
- No Plan, Billing, or Subscription features: Expunge all dead billing/plan error variants and quotas.
- No Marketing, Landing, or Blog Pages.
- KISS and YAGNI: Write the simplest thing that works; use mature ecosystem primitives rather than custom fragile machinery.
- Evidence before assertions: Verify every fix with targeted unit/integration tests and `cargo test`.
- All code, comments, and strings must be in English.

---

### Task 1: SSRF Protection in OpenAPI Sync

**Files:**
- Modify: `crates/cms-biz/src/openapi.rs:225-255`
- Test: `crates/cms-biz/src/openapi.rs` (unit tests at bottom of file)

**Interfaces:**
- Consumes: `reqwest::Client`, `url::Url`, `std::net::IpAddr`
- Produces: `async fn fetch_openapi_content(url: &str) -> Result<String, String>`

- [ ] **Step 1: Write the failing unit tests for SSRF validation**

Add test cases in `crates/cms-biz/src/openapi.rs` inside `mod tests`:
```rust
    #[tokio::test]
    async fn test_fetch_openapi_rejects_private_and_loopback_ips() {
        assert!(fetch_openapi_content("http://127.0.0.1:8080/openapi.json").await.is_err());
        assert!(fetch_openapi_content("http://localhost:8080/openapi.json").await.is_err());
        assert!(fetch_openapi_content("http://169.254.169.254/latest/meta-data").await.is_err());
        assert!(fetch_openapi_content("http://10.0.0.1/spec.json").await.is_err());
        assert!(fetch_openapi_content("http://192.168.1.1/spec.json").await.is_err());
        assert!(fetch_openapi_content("ftp://example.com/spec.json").await.is_err());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-biz test_fetch_openapi_rejects_private_and_loopback_ips`
Expected: FAIL (connection attempts or error message mismatch, not blocked by IP validator).

- [ ] **Step 3: Implement IP check & bounded streaming in `fetch_openapi_content`**

In `crates/cms-biz/src/openapi.rs`:
1. Parse URL with `url::Url`. Enforce scheme is `http` or `https`.
2. Resolve domain to IP addresses via `tokio::net::lookup_host`.
3. Reject any IP that is loopback (`is_loopback()`), private (RFC 1918), link-local (`169.254.0.0/16`, `fe80::/10`), broadcast, or multicast.
4. Disable redirect following (`reqwest::redirect::Policy::none()`).
5. Stream body chunks with a hard 5MB cumulative limit using `bytes_stream` or length guard before buffering.

```rust
fn is_private_or_restricted_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            ipv4.is_loopback()
                || ipv4.is_private()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_documentation()
                || ipv4.octets()[0] == 0 // 0.0.0.0/8
        }
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || ipv6.is_multicast()
                || ((ipv6.segments()[0] & 0xfe00) == 0xfc00) // Unique local (fc00::/7)
                || ((ipv6.segments()[0] & 0xffc0) == 0xfe80) // Link-local (fe80::/10)
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-biz test_fetch_openapi_rejects_private_and_loopback_ips`
Expected: PASS.

---

### Task 2: Eliminate Basic Auth CPU DoS

**Files:**
- Modify: `crates/cms-api/src/auth/middleware.rs:73-90, 160-198`
- Test: `crates/cms-api/src/auth/middleware.rs`

**Interfaces:**
- Consumes: `AuthExtractor`, `OptionalAuthExtractor`
- Produces: Secure credential extraction without unbounded Argon2 hashing on public request headers.

- [ ] **Step 1: Write test verifying invalid Basic auth does not trigger authentication on API extractor**

Add test in `crates/cms-api/src/auth/middleware.rs`:
```rust
    #[tokio::test]
    async fn test_basic_auth_not_supported_on_api_extractor() {
        // Assert that Basic auth headers are rejected immediately as Unauthorized without login attempts
    }
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `cargo test -p cms-api auth::middleware`
Expected: Passes or fails based on test assertions.

- [ ] **Step 3: Remove `extract_from_basic_auth` from `AuthExtractor` and `OptionalAuthExtractor`**

In `crates/cms-api/src/auth/middleware.rs`:
1. Remove `extract_from_basic_auth` invocation from `AuthExtractor::from_request_parts` and `OptionalAuthExtractor::from_request_parts`.
2. Delete the dead `extract_from_basic_auth` function.
3. Remove `AuthMethod::Basic` variant from `AuthMethod` enum.

- [ ] **Step 4: Verify workspace builds cleanly**

Run: `cargo check -p cms-api`
Expected: 0 errors.

---

### Task 3: Sanitize Database & Internal Error Serialization & Expunge Dead Billing Variants

**Files:**
- Modify: `crates/cms-error/src/lib.rs:72-76, 150-160, 270-277, 396-435`
- Test: `crates/cms-error/src/lib.rs` (unit tests at bottom of file)

**Interfaces:**
- Consumes: `AppError`, `into_response`
- Produces: Safe HTTP responses that never leak raw SQL or internal trace strings to clients.

- [ ] **Step 1: Write test verifying `AppError::Database` returns opaque client message**

In `crates/cms-error/src/lib.rs`:
```rust
    #[tokio::test]
    async fn test_database_error_does_not_leak_sql_message() {
        let sql_err = AppError::Database(sqlx::Error::RowNotFound);
        let resp = sql_err.into_response();
        assert_eq!(resp.status(), axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        let body = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        let body_str = String::from_utf8_lossy(&body);
        assert!(!body_str.contains("RowNotFound"));
        assert!(body_str.contains("An internal database error occurred"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-error test_database_error_does_not_leak_sql_message`
Expected: FAIL (leaked raw error message).

- [ ] **Step 3: Sanitize error output and remove billing error variants**

In `crates/cms-error/src/lib.rs`:
1. Remove `FeatureNotAvailable` (and any billing references).
2. Update `into_response`: For server errors (`status.is_server_error()`), log the full error via `tracing::error!` but set the client-facing `message` to a safe generic string (`"An internal database error occurred"` for database errors, `"An internal server error occurred"` for internal errors).
3. Ensure client response `details` are omitted for internal server errors.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-error test_database_error_does_not_leak_sql_message`
Expected: PASS.

---

### Task 4: Secure Webhook Secret Generation

**Files:**
- Modify: `crates/cms-api/src/project/handlers.rs:3098-3126`
- Test: `crates/cms-api/src/project/handlers.rs`

**Interfaces:**
- Consumes: `rand::RngCore` or `uuid::Uuid`
- Produces: Unpredictable cryptographically secure webhook secrets.

- [ ] **Step 1: Locate deterministic `whsec_{conn.id}` generation**

Inspect lines 3101-3105 in `crates/cms-api/src/project/handlers.rs`:
```rust
obj.insert(
    "webhookSecret".to_string(),
    serde_json::Value::String(format!("whsec_{}", &conn.id)),
);
```

- [ ] **Step 2: Replace with 32-byte secure hex string generation**

Change secret synthesis to generate 32 random bytes formatted as hex:
```rust
let mut raw_bytes = [0u8; 32];
rand::RngCore::fill_bytes(&mut rand::rng(), &mut raw_bytes);
let secret = format!("whsec_{}", hex::encode(raw_bytes));
```

- [ ] **Step 3: Run check to verify build**

Run: `cargo check -p cms-api`
Expected: Clean compilation.

---

### Task 5: Robust Windows Local Storage Error Handling

**Files:**
- Modify: `crates/cms-storage/src/local.rs:69-95`
- Test: `crates/cms-storage/src/local.rs`

**Interfaces:**
- Consumes: `std::io::ErrorKind::NotFound`
- Produces: Cross-platform `ObjectNotFound` error mapping.

- [ ] **Step 1: Write unit test for missing file error mapping**

In `crates/cms-storage/src/local.rs`:
```rust
    #[tokio::test]
    async fn test_get_nonexistent_file_returns_object_not_found() {
        let storage = LocalDiskStorage::new(std::env::temp_dir().join("test_storage"));
        let res = storage.get("nonexistent_key_12345.txt").await;
        match res {
            Err(AppError::ObjectNotFound(_)) => {}
            other => panic!("Expected ObjectNotFound, got {:?}", other),
        }
    }
```

- [ ] **Step 2: Run test to check current behavior on Windows**

Run: `cargo test -p cms-storage test_get_nonexistent_file_returns_object_not_found`
Expected: FAIL on Windows with `Storage("Failed to read file: The system cannot find the file specified (os error 2)")`.

- [ ] **Step 3: Replace string matching with `e.kind() == std::io::ErrorKind::NotFound`**

In `crates/cms-storage/src/local.rs`:
```rust
let bytes = tokio::fs::read(&path).await.map_err(|e| {
    if e.kind() == std::io::ErrorKind::NotFound {
        AppError::ObjectNotFound(key.to_string())
    } else {
        AppError::Storage(format!("Failed to read file: {}", e))
    }
})?;
```
And in `delete`:
```rust
match tokio::fs::remove_file(&path).await {
    Ok(_) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(AppError::Storage(format!("Failed to delete file: {}", e))),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p cms-storage test_get_nonexistent_file_returns_object_not_found`
Expected: PASS on Windows and Unix alike.

---

### Task 6: Reorder Server & Background Worker Shutdown

**Files:**
- Modify: `apps/api/main.rs:159-172`

**Interfaces:**
- Consumes: `axum::serve`, `shutdown_signal`, `worker_shutdown_tx`, `worker_handles`
- Produces: Clean sequential shutdown: Axum stops accepting connections & drains -> Workers stop & join.

- [ ] **Step 1: Reorder shutdown logic in `apps/api/main.rs`**

```rust
    // Run Axum with graceful shutdown
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    // Axum has stopped accepting new connections and finished active HTTP requests.
    // Now notify and drain background workers.
    info!("HTTP server stopped; signaling background workers to terminate...");
    let _ = worker_shutdown_tx.send(true);
    for handle in worker_handles {
        let _ = handle.await;
    }
    info!("All background workers terminated cleanly.");
    Ok(())
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p cms-api-app`
Expected: Clean compilation.

---

### Task 7: Rate Limiter Write-Lock Contention & Reverse-Proxy IP Fix

**Files:**
- Modify: `crates/cms-middleware/src/rate_limit.rs:140-217`
- Test: `crates/cms-middleware/src/rate_limit.rs`

**Interfaces:**
- Consumes: `RateLimiterLayer`, `RateLimitClient`
- Produces: Contention-free rate limit checking with trusted proxy awareness.

- [ ] **Step 1: Fix `RateLimitClient::from_request`**

Ensure `RateLimitClient` checks socket IP and only uses `X-Forwarded-For` or `X-Real-IP` if configured or sanitized, avoiding collapsing all users into `127.0.0.1`.

- [ ] **Step 2: Optimize lock contention in `check_rate_limit`**

Replace the two-phase `self.limiter.write().await` cleanup + check with a read-then-write or atomic check to eliminate global lock contention across worker threads.

- [ ] **Step 3: Run existing rate limiter tests**

Run: `cargo test -p cms-middleware rate_limit`
Expected: PASS.

---

### Task 8: Non-Poisoning Host Cache & Non-Blocking Async File Serving

**Files:**
- Modify: `crates/cms-sites/src/host_resolution.rs:290-335`
- Modify: `crates/cms-sites/src/spa.rs:220-235`

**Interfaces:**
- Consumes: `tokio::fs::read`
- Produces: Async file serving and safe cache writes without `unwrap()` on locks.

- [ ] **Step 1: Replace `std::fs::read` with `tokio::fs::read` in `crates/cms-sites/src/spa.rs`**

```rust
let content = tokio::fs::read(&file_path).await.map_err(|e| {
    AppError::Internal(anyhow::anyhow!("Failed to read asset: {e}"))
})?;
```

- [ ] **Step 2: Protect against lock poisoning in `crates/cms-sites/src/host_resolution.rs`**

Handle `PoisonError` gracefully with `.unwrap_or_else(|p| p.into_inner())` or use `parking_lot::RwLock`.

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p cms-sites`
Expected: Clean compilation.

---

### Task 9: Wire Deployment Creation to Job Queue

**Files:**
- Modify: `crates/cms-api/src/deployment/handlers.rs:85-102`
- Modify: `crates/cms-biz/src/deployment.rs:50-60`

**Interfaces:**
- Consumes: `DeploymentQueries::create`, `JobQueue::enqueue`, `JobEnvelope`
- Produces: Deployment record creation with guaranteed background job enqueue.

- [ ] **Step 1: Update `create_deployment_handler` in `crates/cms-api/src/deployment/handlers.rs`**

Ensure `create_deployment_handler` constructs the `JobEnvelope::new(JobType::Publish, ...)` and enqueues it to `state.job_queue` (matching `crates/cms-api/src/project/handlers.rs`).

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p cms-api`
Expected: Clean compilation.

---

### Task 10: Atomic Slug Generation Race Fix

**Files:**
- Modify: `crates/cms-biz/src/project.rs:55-75`
- Test: `crates/cms-biz/src/project.rs`

**Interfaces:**
- Consumes: `ProjectQueries::create_atomic`
- Produces: Atomic slug allocation handling unique constraint violations gracefully.

- [ ] **Step 1: Replace check-then-insert loop with atomic retry on unique constraint violation**

In `crates/cms-biz/src/project.rs`:
Instead of looping `while !is_slug_available`, attempt `create_atomic` with base slug. If it fails with `AppError::Conflict` or Postgres error `23505`, retry with incremented counter.

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p cms-biz`
Expected: Clean compilation.

---

### Task 11: Real Integration Testing & Unstub Import Routes

**Files:**
- Modify: `crates/cms-biz/src/integration.rs:258-266`
- Modify: `crates/cms-api/src/project/mod.rs:130-136`

**Interfaces:**
- Consumes: `test_integration`, import routes
- Produces: Genuine webhook ping checks and honest 501 Not Implemented status codes for unimplemented import routes.

- [ ] **Step 1: Return 501 Not Implemented for mintlify and ghost imports**

In `crates/cms-api/src/project/handlers.rs` or `mod.rs`:
Return `AppError::custom(StatusCode::NOT_IMPLEMENTED, "Mintlify/Ghost content import is not yet implemented")` rather than routing to fake Git handlers.

- [ ] **Step 2: Add URL validation to `test_integration`**

In `crates/cms-biz/src/integration.rs`:
Validate that `integration.webhook_url` is a valid HTTP/HTTPS URL, and perform a ping or validate configuration rather than hardcoding success.

- [ ] **Step 3: Verify workspace compilation**

Run: `cargo check --workspace`
Expected: 0 errors.
