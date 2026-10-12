# MedBrains Auth & Authz Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely replace CMS-RS auth and authz with the MedBrains modular architecture across 6 decoupled crates (`cms-api-keys`, `cms-mfa`, `cms-oauth`, `cms-authz`, `cms-authz-gate`, `cms-auth`).

**Architecture:** A Zanzibar ReBAC relational engine (`cms-authz`) backed by an indexed PostgreSQL `relation_tuples` table, with dedicated route-level reachability gates (`cms-authz-gate`), pure machine credential hashing (`cms-api-keys`), RFC 6238 TOTP MFA (`cms-mfa`), OAuth PKCE (`cms-oauth`), and JWT Claims with triple cookies and brute-force account lockout (`cms-auth`).

**Tech Stack:** Rust (edition 2021, MSRV 1.82+), Axum 0.8, SQLx 0.8 / PostgreSQL, argon2 0.6, jsonwebtoken 11, totp-rs 5.7, subtle 2.6, sha2 0.10.

## Global Constraints
- Deployment Target: Single AWS Windows machine, Postgres-native (zero Docker/SpiceDB external daemon requirement).
- Internal Company Deployment: System tenant ID is fixed (`Uuid::nil() = 00000000-0000-0000-0000-000000000000`).
- No Plan / Billing / Pricing features (strict AGENTS.md rule).
- Existence Oracle Defense: Unauthorized checks return `AppError::NotFound` (404) on sensitive resource lookups.
- Strict compile-time safety: no unhandled unwrap in library crates, `forbid(unsafe_code)`.

---

### Task 1: Machine API Keys Crate (`crates/cms-api-keys`)

**Files:**
- Create: `crates/cms-api-keys/Cargo.toml`
- Create: `crates/cms-api-keys/src/lib.rs`
- Test: `crates/cms-api-keys/tests/api_keys_test.rs`
- Modify: `Cargo.toml` (add `crates/cms-api-keys` to workspace members and dependencies)

**Interfaces:**
- Produces:
  ```rust
  pub const LIVE_PREFIX: &str = "cms_live_";
  pub const TEST_PREFIX: &str = "cms_test_";
  pub enum Environment { Live, Test }
  pub struct MintedKey { pub secret: String, pub prefix: String, pub hash: String }
  pub fn mint(env: Environment, permissions: &[String]) -> Result<MintedKey, KeyError>;
  pub fn verify(presented: &str, stored_hash: &str) -> bool;
  pub fn fingerprint(secret: &str) -> String;
  pub fn looks_like_key(candidate: &str) -> bool;
  ```

- [ ] **Step 1: Create `crates/cms-api-keys/Cargo.toml` and register in workspace `Cargo.toml`**

Add `crates/cms-api-keys` to `members` and `[workspace.dependencies]` in root `Cargo.toml`.
Create `crates/cms-api-keys/Cargo.toml`:
```toml
[package]
name = "cms-api-keys"
version = "0.1.0"
edition = "2021"

[dependencies]
sha2 = "0.10"
subtle = "2.6"
thiserror = "2.0"
getrandom = { version = "0.2", features = ["std"] }
hex = "0.4"

[dev-dependencies]
tokio = { workspace = true, features = ["macros"] }
```

- [ ] **Step 2: Write failing unit test in `crates/cms-api-keys/tests/api_keys_test.rs`**

```rust
use cms_api_keys::{mint, verify, Environment, KeyError, LIVE_PREFIX};

#[test]
fn test_mint_and_verify_key() {
    let perms = vec!["project.view".to_string()];
    let key = mint(Environment::Live, &perms).expect("mint should succeed");
    assert!(key.secret.starts_with(LIVE_PREFIX));
    assert_eq!(key.prefix.len(), 12);
    assert!(verify(&key.secret, &key.hash));
    assert!(!verify("invalid_secret", &key.hash));
}

#[test]
fn test_rejects_empty_and_bypass_permissions() {
    assert!(matches!(mint(Environment::Live, &[]), Err(KeyError::NoPermissions)));
    assert!(matches!(mint(Environment::Live, &["*".to_string()]), Err(KeyError::BypassPermission(_))));
}
```

- [ ] **Step 3: Implement `crates/cms-api-keys/src/lib.rs`**

Port MedBrains' `medbrains-api-keys` logic with `LIVE_PREFIX = "cms_live_"` and `TEST_PREFIX = "cms_test_"`, constant-time `ct_eq` verification, and bypass rejection.

- [ ] **Step 4: Run tests to verify**

Run: `cargo test -p cms-api-keys`
Expected: 2 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml crates/cms-api-keys/
git commit -m "feat(api-keys): add cms-api-keys crate ported from medbrains"
```

---

### Task 2: Multi-Factor Authentication Crate (`crates/cms-mfa`)

**Files:**
- Create: `crates/cms-mfa/Cargo.toml`
- Create: `crates/cms-mfa/src/lib.rs`
- Test: `crates/cms-mfa/tests/mfa_test.rs`
- Modify: `Cargo.toml` (add `crates/cms-mfa` to workspace members and dependencies)

**Interfaces:**
- Produces:
  ```rust
  pub struct MfaEnrollment { pub secret: String, pub otpauth_uri: String, pub qr_png_base64: String }
  pub fn generate_enrollment(account: &str, issuer: &str) -> Result<MfaEnrollment, MfaError>;
  pub fn verify_totp(secret_b32: &str, code: &str) -> bool;
  pub fn generate_recovery_codes(count: usize) -> (Vec<String>, Vec<String>); // (plain, hashes)
  pub fn verify_recovery_code(code: &str, stored_hashes: &[String]) -> Option<usize>;
  ```

- [ ] **Step 1: Create `crates/cms-mfa/Cargo.toml` and register in workspace `Cargo.toml`**

Add `crates/cms-mfa` to `members` and `[workspace.dependencies]` in root `Cargo.toml`.
Create `crates/cms-mfa/Cargo.toml`:
```toml
[package]
name = "cms-mfa"
version = "0.1.0"
edition = "2021"

[dependencies]
totp-rs = { version = "5.6", features = ["otpauth", "qr"] }
sha2 = "0.10"
hex = "0.4"
base64 = "0.22"
thiserror = "2.0"
getrandom = { version = "0.2", features = ["std"] }
serde = { workspace = true }
serde_json = { workspace = true }
```

- [ ] **Step 2: Write failing unit test in `crates/cms-mfa/tests/mfa_test.rs`**

```rust
use cms_mfa::{generate_enrollment, generate_recovery_codes, verify_recovery_code};

#[test]
fn test_mfa_enrollment_and_recovery_codes() {
    let enrollment = generate_enrollment("admin@company.internal", "CMS").expect("enrollment");
    assert!(enrollment.otpauth_uri.contains("secret="));
    
    let (plain, hashes) = generate_recovery_codes(8);
    assert_eq!(plain.len(), 8);
    assert_eq!(hashes.len(), 8);
    
    let consumed_idx = verify_recovery_code(&plain[2], &hashes);
    assert_eq!(consumed_idx, Some(2));
    assert_eq!(verify_recovery_code("fake_code", &hashes), None);
}
```

- [ ] **Step 3: Implement `crates/cms-mfa/src/lib.rs`**

Implement RFC 6238 TOTP with QR PNG base64 generation and SHA-256 recovery code hashing.

- [ ] **Step 4: Run tests to verify**

Run: `cargo test -p cms-mfa`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml crates/cms-mfa/
git commit -m "feat(mfa): add cms-mfa crate ported from medbrains"
```

---

### Task 3: OAuth & OIDC Provider Crate (`crates/cms-oauth`)

**Files:**
- Create: `crates/cms-oauth/Cargo.toml`
- Create: `crates/cms-oauth/src/lib.rs`
- Test: `crates/cms-oauth/tests/oauth_test.rs`
- Modify: `Cargo.toml` (add `crates/cms-oauth` to workspace members and dependencies)

**Interfaces:**
- Produces:
  ```rust
  pub struct PkceChallenge { pub verifier: String, pub challenge: String }
  pub fn generate_pkce() -> PkceChallenge;
  pub fn generate_state_nonce() -> (String, String);
  pub struct OAuthProviderSpec { pub code: &'static str, pub label: &'static str, ... }
  pub const KNOWN_PROVIDERS: &[OAuthProviderSpec];
  ```

- [ ] **Step 1: Create `crates/cms-oauth/Cargo.toml` and register in workspace `Cargo.toml`**

```toml
[package]
name = "cms-oauth"
version = "0.1.0"
edition = "2021"

[dependencies]
sha2 = "0.10"
base64 = "0.22"
getrandom = { version = "0.2", features = ["std"] }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = "2.0"
reqwest = { workspace = true }
```

- [ ] **Step 2: Write failing unit test in `crates/cms-oauth/tests/oauth_test.rs`**

```rust
use cms_oauth::{generate_pkce, generate_state_nonce, KNOWN_PROVIDERS};

#[test]
fn test_pkce_generation() {
    let pkce = generate_pkce();
    assert_eq!(pkce.verifier.len(), 43); // 32 bytes base64url no-pad
    assert!(!pkce.challenge.is_empty());
}

#[test]
fn test_state_nonce_entropy() {
    let (s1, n1) = generate_state_nonce();
    let (s2, n2) = generate_state_nonce();
    assert_ne!(s1, s2);
    assert_ne!(n1, n2);
    assert!(KNOWN_PROVIDERS.iter().any(|p| p.code == "github"));
}
```

- [ ] **Step 3: Implement `crates/cms-oauth/src/lib.rs`**

Port PKCE S256 generation, random URL-safe state/nonce, and standard provider catalog (`github`, `google`, `azure_ad`, `gitlab`).

- [ ] **Step 4: Run tests to verify**

Run: `cargo test -p cms-oauth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml crates/cms-oauth/
git commit -m "feat(oauth): add cms-oauth crate ported from medbrains"
```

---

### Task 4: Database Migrations for ReBAC & Account Security

**Files:**
- Create: `crates/cms-db/migrations/20261012000001_medbrains_authz_tuples.sql`
- Modify: `crates/cms-db/src/authz.rs`
- Modify: `crates/cms-db/src/audit.rs`

- [ ] **Step 1: Create PostgreSQL migration script**

Create migration file with `relation_tuples` table, indexes, User security columns (`failed_login_attempts`, `locked_until`, `mfa_enabled`, `mfa_secret`, `mfa_recovery_codes`), `security_audit_logs`, and backfills for Workspace Owner and Project Members.

- [ ] **Step 2: Add `RelationTupleQueries` and `AuditLogger` in `crates/cms-db`**

Implement SQLx query helpers in `crates/cms-db/src/authz.rs`:
```rust
pub struct RelationTupleRow {
    pub tuple_id: Uuid,
    pub tenant_id: Uuid,
    pub object_type: String,
    pub object_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_id: String,
    pub status: String,
}
```
Implement `AuditLogger::log` in `crates/cms-db/src/audit.rs` writing to `security_audit_logs`.

- [ ] **Step 3: Verify build of `cms-db`**

Run: `cargo check -p cms-db`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add crates/cms-db/
git commit -m "feat(db): add relation_tuples migration and audit logging"
```

---

### Task 5: Pure Zanzibar ReBAC Engine (`crates/cms-authz`)

**Files:**
- Replace: `crates/cms-authz/Cargo.toml`
- Replace: `crates/cms-authz/src/*`
- Create: `crates/cms-authz/src/lib.rs`
- Create: `crates/cms-authz/src/relations.rs`
- Create: `crates/cms-authz/src/registry.rs`
- Create: `crates/cms-authz/src/backend_pg.rs`
- Create: `crates/cms-authz/src/backend_test.rs`
- Create: `crates/cms-authz/src/error.rs`
- Test: `crates/cms-authz/tests/rebac_test.rs`

**Interfaces:**
- Produces:
  ```rust
  pub struct RelationTuple { ... }
  pub enum Subject { User(Uuid), Role(String) }
  pub enum Relation { Owner, Admin, Editor, Viewer, Member }
  pub struct AuthzContext { pub tenant_id: Uuid, pub user_id: Uuid, pub role: String, pub is_bypass: bool }
  pub trait AuthzBackend: Send + Sync {
      async fn check(&self, ctx: &AuthzContext, relation: Relation, object_type: &str, object_id: Uuid) -> Result<bool, AuthzError>;
      async fn bulk_check(&self, ctx: &AuthzContext, items: &[(String, Relation, Uuid)]) -> Result<HashMap<(String, Relation, Uuid), bool>, AuthzError>;
      async fn list_accessible(&self, ctx: &AuthzContext, object_type: &str, relation: Relation) -> Result<Vec<Uuid>, AuthzError>;
      async fn write_tuple(&self, ctx: &AuthzContext, object_type: &str, object_id: Uuid, relation: Relation, subject: Subject) -> Result<Uuid, AuthzError>;
      async fn revoke_tuple(&self, ctx: &AuthzContext, tuple_id: Uuid) -> Result<(), AuthzError>;
  }
  pub struct PgAuthzBackend;
  pub struct TestAuthzBackend;
  ```

- [ ] **Step 1: Replace `crates/cms-authz/Cargo.toml`**

Remove Gatehouse dependencies and set clean dependencies:
```toml
[package]
name = "cms-authz"
version = "0.1.0"
edition = "2021"

[dependencies]
async-trait = "0.1"
chrono = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
sqlx = { workspace = true }
thiserror = { workspace = true }
tokio = { workspace = true }
tracing = { workspace = true }
uuid = { workspace = true }
cms-db = { path = "../cms-db" }

[dev-dependencies]
tokio = { workspace = true, features = ["macros"] }
```

- [ ] **Step 2: Write failing ReBAC test in `crates/cms-authz/tests/rebac_test.rs`**

```rust
use cms_authz::{AuthzBackend, AuthzContext, Relation, Subject, TestAuthzBackend};
use uuid::Uuid;

#[tokio::test]
async fn test_rebac_implications_and_cross_inheritance() {
    let backend = TestAuthzBackend::new();
    let user_id = Uuid::new_v4();
    let project_id = Uuid::new_v4();
    let ctx = AuthzContext {
        tenant_id: Uuid::nil(),
        user_id,
        role: "user".to_string(),
        is_bypass: false,
    };

    // No grant -> Denied
    assert!(!backend.check(&ctx, Relation::Viewer, "project", project_id).await.unwrap());

    // Write Editor grant -> Implies Viewer
    backend.write_tuple(&ctx, "project", project_id, Relation::Editor, Subject::User(user_id)).await.unwrap();
    assert!(backend.check(&ctx, Relation::Viewer, "project", project_id).await.unwrap());
    assert!(backend.check(&ctx, Relation::Editor, "project", project_id).await.unwrap());
    assert!(!backend.check(&ctx, Relation::Admin, "project", project_id).await.unwrap());
}
```

- [ ] **Step 3: Implement ReBAC engine (`relations.rs`, `registry.rs`, `backend_pg.rs`, `backend_test.rs`, `lib.rs`)**

Port MedBrains' `RelationTuple`, `Relation` hierarchy (`Owner -> Admin -> Editor -> Viewer`), `PgAuthzBackend` with single-SQL `EXISTS` check, cross-object workspace-admin check, and in-memory `TestAuthzBackend`.

- [ ] **Step 4: Run tests to verify**

Run: `cargo test -p cms-authz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/cms-authz/
git commit -m "feat(authz): replace gatehouse with medbrains zanzibar rebac engine"
```

---

### Task 6: Route Security Guards (`crates/cms-authz-gate`)

**Files:**
- Create: `crates/cms-authz-gate/Cargo.toml`
- Create: `crates/cms-authz-gate/src/lib.rs`
- Test: `crates/cms-authz-gate/tests/gate_test.rs`
- Modify: `Cargo.toml` (add `crates/cms-authz-gate` to members and dependencies)

**Interfaces:**
- Produces:
  ```rust
  pub enum ParentLink { Page(Uuid), Branch(Uuid), Deployment(Uuid), ApiKey(Uuid) }
  pub async fn require_workspace_access(state: &AppState, claims: &Claims, relation: Relation) -> Result<(), AppError>;
  pub async fn require_project_access(state: &AppState, claims: &Claims, project_id: Uuid, relation: Relation) -> Result<(), AppError>;
  pub async fn require_parent_access(state: &AppState, claims: &Claims, parent_link: ParentLink, relation: Relation) -> Result<(), AppError>;
  ```

- [ ] **Step 1: Create `crates/cms-authz-gate/Cargo.toml` and register in workspace `Cargo.toml`**

```toml
[package]
name = "cms-authz-gate"
version = "0.1.0"
edition = "2021"

[dependencies]
cms-authz = { path = "../cms-authz" }
cms-db = { path = "../cms-db" }
cms-error = { path = "../cms-error" }
sqlx = { workspace = true }
uuid = { workspace = true }
tracing = { workspace = true }
async-trait = "0.1"
```

- [ ] **Step 2: Implement `crates/cms-authz-gate/src/lib.rs`**

Implement `require_workspace_access`, `require_project_access`, and `require_parent_access` resolving parent project ID in 1 SQL hop and mapping ReBAC denials to `AppError::NotFound`.

- [ ] **Step 3: Run check on `cms-authz-gate`**

Run: `cargo check -p cms-authz-gate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml crates/cms-authz-gate/
git commit -m "feat(authz-gate): add cms-authz-gate crate for route guards and parent traversal"
```

---

### Task 7: Modernize Core Authentication (`crates/cms-auth`)

**Files:**
- Modify: `crates/cms-auth/Cargo.toml`
- Modify: `crates/cms-auth/src/lib.rs`
- Create: `crates/cms-auth/src/claims.rs`
- Create: `crates/cms-auth/src/cookies.rs`
- Create: `crates/cms-auth/src/lockout.rs`
- Modify: `crates/cms-auth/src/password.rs`

**Interfaces:**
- Produces:
  ```rust
  pub struct Claims { pub sub: Uuid, pub tenant_id: Uuid, pub role: String, pub permissions: Vec<String>, pub exp: usize }
  pub fn encode_jwt(claims: &Claims, secret: &[u8]) -> Result<String, AppError>;
  pub fn decode_jwt(token: &str, secret: &[u8]) -> Result<Claims, AppError>;
  pub fn build_access_cookie(token: &str, secure: bool) -> String;
  pub fn build_refresh_cookie(token: &str, secure: bool) -> String;
  pub fn build_csrf_cookie(token: &str, secure: bool) -> String;
  pub async fn record_failed_login(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError>;
  pub async fn reset_failed_logins(pool: &PgPool, user_id: Uuid) -> Result<(), AppError>;
  ```

- [ ] **Step 1: Update `crates/cms-auth/Cargo.toml`**

Add dependencies on `cms-api-keys`, `cms-mfa`, `cms-oauth`, `argon2`, `jsonwebtoken`.

- [ ] **Step 2: Implement Claims, cookies, lockout, and password verification in `cms-auth`**

Port MedBrains' triple cookie scheme, Argon2id verification, failed login counter, and account lockout threshold (5 attempts -> 15 min lock).

- [ ] **Step 3: Run test suite on `cms-auth`**

Run: `cargo test -p cms-auth`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/cms-auth/
git commit -m "feat(auth): modernize cms-auth with claims, triple cookies, and lockout"
```

---

### Task 8: AppState & Middleware Integration (`cms-middleware`)

**Files:**
- Modify: `crates/cms-middleware/Cargo.toml`
- Modify: `crates/cms-middleware/src/app_state.rs`
- Modify: `crates/cms-middleware/src/auth.rs`

- [ ] **Step 1: Embed `PgAuthzBackend` into `AppState`**

Replace `GatehouseState` in `AppState` with `Arc<dyn cms_authz::AuthzBackend>`.
Initialize `PgAuthzBackend::new(pool.clone())` at app startup.

- [ ] **Step 2: Update `AuthExtractor` to extract `Claims`**

Validate `access_token` cookie or `Authorization: Bearer <jwt>` or `X-API-Key: cms_live_*`. Inject validated `Claims` into request extensions.

- [ ] **Step 3: Run build on `cms-middleware`**

Run: `cargo check -p cms-middleware`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/cms-middleware/
git commit -m "feat(middleware): wire Claims and PgAuthzBackend into AppState"
```

---

### Task 9: Rewire Route Handlers (`cms-api`, `cms-biz`, `cms-mcp`)

**Files:**
- Modify: `crates/cms-api/Cargo.toml` (add `cms-authz-gate`, `cms-api-keys`, `cms-mfa`, `cms-oauth`)
- Modify: `crates/cms-api/src/project/handlers/common.rs`
- Modify: `crates/cms-api/src/project/handlers/pages.rs`
- Modify: `crates/cms-api/src/workspace/handlers.rs`
- Modify: `crates/cms-biz/src/auth.rs`
- Modify: `crates/cms-mcp/src/main.rs`

- [ ] **Step 1: Replace legacy `authorize_project` with `cms_authz_gate`**

In `crates/cms-api/src/project/handlers/common.rs`:
```rust
pub async fn authorize_project(
    state: &AppState,
    claims: &Claims,
    project_id: Uuid,
    relation: cms_authz::Relation,
) -> Result<(), AppError> {
    cms_authz_gate::require_project_access(state, claims, project_id, relation).await
}
```

- [ ] **Step 2: Update `pages.rs`, `branches.rs`, `deployments.rs`**

Use `cms_authz_gate::require_parent_access` with `ParentLink` to automatically authorize child resources.

- [ ] **Step 3: Update `workspace/handlers.rs`**

Replace ad-hoc `ensure_admin_or_owner` with `cms_authz_gate::require_workspace_access(state, claims, Relation::Admin)`.

- [ ] **Step 4: Update `cms-mcp`**

Replace Gatehouse bindings with direct calls to `state.authz.check(&ctx, Relation::Viewer, "project", project_id)`.

- [ ] **Step 5: Run workspace build check**

Run: `cargo check --workspace`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add crates/cms-api/ crates/cms-biz/ crates/cms-mcp/
git commit -m "refactor(api,biz): rewire all route handlers to cms-authz-gate and rebac"
```

---

### Task 10: End-to-End Verification & Test Suite

**Files:**
- Create: `crates/cms-api/tests/medbrains_auth_rebac_e2e_test.rs`

- [ ] **Step 1: Write comprehensive end-to-end integration test**

Verify the complete flow:
1. Register user & verify initial admin gets `workspace:owner` tuple.
2. Login with credentials -> verify `access_token`, `refresh_token`, and `csrf_token` cookies.
3. Verify brute-force lockout: 5 bad password attempts locks account.
4. Mint `cms_live_*` API key -> authenticate request via `X-API-Key`.
5. Create project -> verify creator gets `project:owner` tuple.
6. Verify non-member receives `404 Not Found` (existence oracle defense).
7. Add editor member -> verify editor can view and edit pages.
8. Workspace admin automatically inherits admin access to the project via cross-object implication.

- [ ] **Step 2: Run full workspace test suite**

Run: `cargo test --workspace`
Expected: ALL TESTS PASS.

- [ ] **Step 3: Commit**

```bash
git add crates/cms-api/tests/
git commit -m "test: add comprehensive end-to-end test suite for medbrains auth & authz"
```
