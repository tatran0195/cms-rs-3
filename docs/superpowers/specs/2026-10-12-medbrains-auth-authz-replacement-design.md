# Design Specification: MedBrains Auth & Authz Architecture Integration for CMS-RS

**Date:** 2026-10-12  
**Scope:** `cms-rs-3` backend (`crates/*`)  
**Status:** Approved by User  

---

## 1. Overview & Context

This specification defines the complete replacement of the authentication and authorization subsystems in `cms-rs-3` with the modular security and access architecture from `MedBrains`.

### Objectives
1. **Zanzibar-Style ReBAC (`cms-authz`)**: Replace the in-process Gatehouse policy checker with MedBrains' relation-tuple engine. Evaluate permissions via fast, indexed single-SQL queries (`PgAuthzBackend`) with ACID transactional consistency, preserving the `AuthzBackend` trait for future pluggability.
2. **Dedicated Route-Level Gates (`cms-authz-gate`)**: Decouple route handlers from the core ReBAC engine. Implement `ParentLink` single-hop child-to-parent traversal (e.g. page/branch/deployment -> project) and map authorization denials to `404 Not Found` to eliminate existence-oracle attack vectors.
3. **Modular Crate Separation**: Split the access domain into focused crates matching MedBrains:
   - `crates/cms-api-keys`: Pure machine credential minting and constant-time fingerprint verification.
   - `crates/cms-mfa`: RFC 6238 TOTP multi-factor authentication with recovery codes.
   - `crates/cms-oauth`: OAuth 2.0 / OIDC provider integration with PKCE S256.
   - `crates/cms-authz`: Pure Zanzibar ReBAC engine (zero web framework dependencies).
   - `crates/cms-authz-gate`: Axum route guards and parent reachability resolution.
   - `crates/cms-auth`: Core session management, JWT `Claims`, triple-cookie scheme, and brute-force lockout.
4. **Platform & Workspace Alignment**: Model the single-company deployment cleanly with a singleton Workspace (`00000000-0000-0000-0000-000000000000`), inheriting administrative access across all projects via userset rewrites.

---

## 2. Workspace & Crate Architecture

### 2.1 Workspace Layout
The `cms-rs-3` workspace members in `Cargo.toml` include:
```toml
members = [
  "crates/cms-config",
  "crates/cms-error",
  "crates/cms-entity",
  "crates/cms-db",
  "crates/cms-api-keys",
  "crates/cms-mfa",
  "crates/cms-oauth",
  "crates/cms-authz",
  "crates/cms-authz-gate",
  "crates/cms-auth",
  "crates/cms-storage",
  "crates/cms-search",
  "crates/cms-queue",
  "crates/cms-analytics",
  "crates/cms-mcp",
  "crates/cms-biz",
  "crates/cms-sites",
  "crates/cms-api",
  "crates/cms-worker",
  "crates/cms-middleware",
  "crates/cms-mailer",
  "crates/cms-i18n",
  "apps/api",
  "apps/runner",
]
```

### 2.2 Crate Responsibilities & Boundaries

| Crate | Responsibilities | Dependencies |
|---|---|---|
| **`cms-api-keys`** | Minting and verifying machine credentials (`cms_live_`, `cms_test_`), SHA-256 fingerprinting, constant-time `ct_eq` verification, permission validation. | Pure: `sha2`, `subtle`, `hex`, `getrandom`, `thiserror`. Zero DB, zero web. |
| **`cms-mfa`** | RFC 6238 TOTP enrollment, QR code generation, code verification, 8 one-time recovery codes (SHA-256 hashed). | `cms-config`, `sqlx`, `totp-rs`, `sha2`, `hex`, `base64`, `uuid`. |
| **`cms-oauth`** | OAuth 2.0 / OIDC provider specs, state/nonce tracking, PKCE S256 verifier/challenge generation, callback handling. | `cms-config`, `reqwest`, `serde`, `jsonwebtoken`, `sqlx`, `uuid`. |
| **`cms-authz`** | Zanzibar ReBAC engine: `RelationTuple`, `Relation`, `Subject`, `AuthzBackend`, `PgAuthzBackend`, `TestAuthzBackend`, `registry`. | Pure domain: `sqlx`, `uuid`, `chrono`, `serde`, `async-trait`, `thiserror`. Zero Axum. |
| **`cms-authz-gate`** | Axum route guards (`require_workspace_access`, `require_project_access`), `ParentLink` traversal, 404 security mapping. | `cms-authz`, `cms-db`, `cms-error`, `axum`, `sqlx`, `uuid`. |
| **`cms-auth`** | JWT `Claims`, triple cookies (`access_token`, `refresh_token`, `csrf_token`), login, Argon2id passwords, account lockout, audit logging. | `cms-api-keys`, `cms-mfa`, `cms-oauth`, `cms-db`, `cms-config`, `cms-error`, `argon2`, `jsonwebtoken`, `axum`. |

---

## 3. Authorization (ReBAC) Domain Model (`cms-authz`)

### 3.1 Object Registry & Allowed Relations
```rust
pub enum Relation {
    Owner,
    Admin,
    Editor,
    Viewer,
    Member,
}
```

* **Relation Hierarchy (`implied_by`)**:
  - `Relation::Owner` implies `Admin`, `Editor`, `Viewer`, `Member`.
  - `Relation::Admin` implies `Editor`, `Viewer`, `Member`.
  - `Relation::Editor` implies `Viewer`.
  - `Relation::Viewer`.

* **Registered Types**:
  - `"workspace"`: Allowed relations `[Owner, Admin, Member]`. (Singleton: `00000000-0000-0000-0000-000000000000`).
  - `"project"`: Allowed relations `[Owner, Admin, Editor, Viewer]`.

### 3.2 Evaluation Logic (`PgAuthzBackend`)
1. Checks for active tuple for `(object_type, object_id, relation = ANY(candidates))` matching `subject_type = 'user' AND subject_id = user_id`.
2. Cross-Object Inheritance: If checking a `"project"` and no direct tuple exists, evaluates whether the subject holds `Admin` or `Owner` on `"workspace"`. If so, grants access immediately.
3. `bulk_check`: Batches multiple `(object_type, relation, object_id)` checks into a single SQL query.
4. `list_accessible`: Returns all project UUIDs accessible by the user with a given relation for filtered list endpoints.

---

## 4. Route Security Guards (`cms-authz-gate`)

### 4.1 Existence Oracle Defense
Denied access returns `AppError::NotFound` instead of `AppError::Forbidden` so unauthorized callers cannot infer resource existence.

### 4.2 ParentLink Hierarchical Traversal
```rust
pub enum ParentLink {
    Page(Uuid),
    Branch(Uuid),
    Deployment(Uuid),
    ApiKey(Uuid),
}
```
`cms-authz-gate` resolves child resources to their parent project in a single indexed query:
- `ParentLink::Page(id)` -> `SELECT project_id FROM "Page" WHERE id = $1`
- `ParentLink::Branch(id)` -> `SELECT project_id FROM "Branch" WHERE id = $1`
- `ParentLink::Deployment(id)` -> `SELECT project_id FROM "Deployment" WHERE id = $1`
Then enforces `require_project_access` against the resolved project ID.

---

## 5. Core Authentication & Credentials (`cms-auth`, `cms-api-keys`, `cms-mfa`)

### 5.1 Claims Structure
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub tenant_id: Uuid,          // Uuid::nil()
    pub role: String,             // "admin" | "user"
    pub permissions: Vec<String>,
    pub exp: usize,
}
```

### 5.2 Cookie & Token Lifecycle
- `access_token`: Short-lived (30 minutes) HttpOnly, SameSite=Lax JWT.
- `refresh_token`: Long-lived (30 days) HttpOnly, SameSite=Lax rotating token.
- `csrf_token`: 32-byte cryptographically secure random token in header and cookie; validated on mutating requests (`POST`, `PATCH`, `DELETE`).
- Mobile/CLI/MCP clients presenting `Authorization: Bearer <jwt>` or `X-API-Key: <key>` bypass cookie and CSRF requirements.

### 5.3 Account Protection & Lockout
- `failed_login_attempts` counter incremented on wrong password.
- Threshold of 5 consecutive failures locks account for 15 minutes (`locked_until = now() + interval '15 minutes'`).
- Successful authentication resets `failed_login_attempts` to 0.

### 5.4 Machine API Keys (`cms-api-keys`)
- Format: `cms_live_<64 hex chars>` / `cms_test_<64 hex chars>`.
- Storage: SHA-256 fingerprint hash.
- Verification: Constant-time comparison (`subtle::ConstantTimeEq`).
- Bypasses: Wildcard (`*`) and administrative bypass codes are denied at mint time.

### 5.5 MFA (`cms-mfa`)
- TOTP (SHA-1, 6 digits, 30s step).
- 8 one-time backup recovery codes stored as SHA-256 hashes.
- Verified on login when user has `mfa_enabled = true`.

---

## 6. Database Schema & Migration

### 6.1 PostgreSQL Migration Script
```sql
-- 1. Zanzibar Relation Tuples
CREATE TABLE IF NOT EXISTS relation_tuples (
    tuple_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    object_type VARCHAR(64) NOT NULL,
    object_id UUID NOT NULL,
    relation VARCHAR(64) NOT NULL,
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    granted_by UUID,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relation_tuples_active_uniq 
    ON relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id) 
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_relation_tuples_lookup 
    ON relation_tuples (tenant_id, object_type, object_id, status);

CREATE INDEX IF NOT EXISTS idx_relation_tuples_reverse 
    ON relation_tuples (tenant_id, subject_id, status);

-- 2. User Security Enhancements
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
    ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[],
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Machine API Keys
ALTER TABLE "ApiKey"
    ADD COLUMN IF NOT EXISTS prefix VARCHAR(16),
    ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

-- 4. Audit Log Table (MedBrains Chained Audit)
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    user_id UUID,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID,
    ip_address VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Backfill Existing Data
-- Seed initial Workspace Owner
INSERT INTO relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id)
SELECT 
    '00000000-0000-0000-0000-000000000000',
    'workspace',
    '00000000-0000-0000-0000-000000000000',
    'owner',
    'user',
    id::text
FROM "User"
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- Seed Project Members into Relation Tuples
INSERT INTO relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id)
SELECT 
    '00000000-0000-0000-0000-000000000000',
    'project',
    project_id::uuid,
    LOWER(role),
    'user',
    user_id
FROM "ProjectMember"
ON CONFLICT DO NOTHING;
```

---

## 7. Downstream Consumer Migration

1. **`cms-middleware`**:
   - `AuthExtractor` extracts and validates `Claims` from access cookie or Bearer/API-key header.
   - Attaches `Claims` into request extensions.
2. **`cms-api`**:
   - Project route handlers replace `super::common::authorize_project` with calls to `cms_authz_gate::require_project_access(&state, &claims, project_id, Relation::Viewer)`.
   - Page/branch/deployment handlers use `cms_authz_gate::require_parent_access(&state, &claims, ParentLink::Page(id), Relation::Editor)`.
   - Workspace handlers replace `ensure_admin_or_owner` with `cms_authz_gate::require_workspace_access(&state, &claims, Relation::Admin)`.
3. **`cms-mcp`**:
   - Uses `cms-authz` directly with `PgAuthzBackend` to evaluate tool permissions.

---

## 8. Verification & Testing Strategy

1. **Unit Tests**:
   - `cms-api-keys`: Minting, hashing, constant-time validation, bypass rejection.
   - `cms-mfa`: Secret creation, QR URI formatting, code verification, recovery code consumption.
   - `cms-authz`: `TestAuthzBackend` verifying relation implications (`Owner -> Admin -> Editor -> Viewer`) and workspace inheritance.
2. **Integration Tests**:
   - `PgAuthzBackend` with test PostgreSQL database: single check, bulk check, list accessible, and relation write/revoke.
   - Route tests: verifying 404 response on unauthorized project/page access.
   - Account lockout: verifying 5 failed logins triggers account lockout.
3. **Full Build Check**:
   - `cargo check --workspace` and `cargo test -p cms-auth -p cms-authz -p cms-authz-gate -p cms-api-keys -p cms-mfa -p cms-oauth`.
