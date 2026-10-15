# 03 - Security and Authorization Deep Dive

**Platform Environment:** Internal Company Deployment (Strict Zero Public Billing / Marketing)  
**Security Model:** Role & Relationship-Based Access Control (ReBAC)  

---

## 1. Authentication Flow

The application supports multiple authentication mechanisms for internal employees and automation scripts:

```
                      ┌─────────────────────────────────┐
                      │    Incoming Client Request      │
                      └────────────────┬────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [Authorization Header]                            [Cookie Header]
   Bearer JWT or API Key (`cms_live_...`)              Session Cookie (`cms_session`)
                │                                             │
                ▼                                             ▼
   ┌──────────────────────────┐                  ┌──────────────────────────┐
   │ API Key Validator        │                  │ Session Extractor        │
   │ - Hashes key with SHA-256│                  │ - Decrypts/validates JWT │
   │ - Validates scopes & exp │                  │ - Checks revoked tokens  │
   └────────────┬─────────────┘                  └────────────┬─────────────┘
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │      AuthContext Identity     │
                       │ User ID, Scopes, Platform Role│
                       └───────────────────────────────┘
```

### 1.1 Password Storage & Session Security
- **Hashing:** Argon2id with cryptographically secure salts (`crates/cms-auth/src/lib.rs`).
- **Session Tokens:** HMAC-SHA256 signed JWTs with expiration checking (`exp`), `HttpOnly`, `SameSite=Lax`, and `Secure` cookie flags.
- **API Keys:** Scoped API keys with prefix `cms_live_` hashed using SHA-256 before database comparison; raw secrets are never persisted.
- **MFA:** TOTP (RFC 6238) implemented in `crates/cms-mfa` with backup recovery codes.

---

## 2. Authorization Matrix

The application employs a Zanzibar-style relationship authorization model (`cms-authz`) backed by `cms-authz-gate`. Relations are defined hierarchically: `Owner > Admin > Editor > Viewer`.

| Principal Type | Resource Type | Operation | Endpoint | Required Relation / Permission | Enforcement Status |
|---|---|---|---|---|---|
| Platform Admin | Platform | View system analytics & sites | `/api/admin/*` | `PlatformRole::SuperAdmin` | **Enforced** |
| Project Owner | Project | Delete project, transfer ownership | `DELETE /api/projects/:id` | `Relation::Owner` | **Enforced** |
| Project Admin | Project Members | Add, update, remove members | `/api/projects/:id/members/*` | `Relation::Admin` | **FAILED (Bypass in PATCH/DELETE)** |
| Project Admin | Integrations | Manage webhooks & integrations | `/api/projects/:id/integrations/*`| `Relation::Admin` | **FAILED (No authz check)** |
| Project Editor | Pages (Scoped) | Create, edit, delete pages | `/api/projects/:id/pages/*` | `Relation::Editor` | **Enforced** |
| Authenticated User | Pages (Standalone) | View, edit, delete pages | `/api/pages/:id` | `Relation::Viewer / Editor` | **CRITICAL BOLA (Zero checks)** |
| Project Editor | Branches (Scoped)| Create, edit, merge branches | `/api/projects/:id/branches/*` | `Relation::Editor` | **Enforced** |
| Authenticated User | Branches (Standalone) | View, edit, delete branches | `/api/branches/:id` | `Relation::Viewer / Editor` | **CRITICAL BOLA (Zero checks)** |
| Project Viewer | Comments | View discussions on pages | `/api/comments?page_id={id}` | `Relation::Viewer` | **FAILED (Bypass)** |
| Project Viewer | Analytics | View project telemetry | `/api/projects/:id/analytics` | `Relation::Viewer` | **Enforced** |

---

## 3. Tenant and Project Isolation Analysis

Since this is an internal enterprise platform, each documentation project represents a department, team, or internal software service:

1. **Scoped Project Routes:**
   - Properly invoke `cms_authz_gate::require_project_access(&pool, authz_backend, &authz_ctx, project_id, relation)`.
   - Any access outside the member's relation returns `403 Forbidden`.
2. **Standalone Route Isolation Failure:**
   - Endpoints mounted at `/api/pages/:id` and `/api/branches/:id` do not derive the parent project.
   - `PageService` queries `SELECT * FROM "Page" WHERE id = $1` directly without checking project membership, violating project isolation.
3. **Database Isolation Strategy:**
   - Multi-tenant isolation is logical (row-level via `project_id`).
   - Strong foreign keys ensure cascading deletes, but queries that omit `project_id` must be guarded at the application gate.

---

## 4. Input and Network-Boundary Review

### 4.1 Server-Side Request Forgery (SSRF) Defenses
- **OpenAPI Importer (`crates/cms-biz/src/openapi.rs`):**
  - Robust SSRF mitigation is implemented.
  - Resolves domain to IP addresses and rejects:
    - IPv4: Loopback (`127.0.0.0/8`), Private RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Link-local (`169.254.0.0/16`), CGNAT (`100.64.0.0/10`).
    - IPv6: Loopback (`::1`), Unique Local Address (`fc00::/7`), IPv4-mapped IPv6.
  - Enforces DNS socket pinning: The HTTP client connects directly to the validated IP socket to eliminate DNS rebinding TOCTOU vulnerabilities.
  - Redirects are strictly disabled, and incoming content is stream-bounded to 5MB.
- **Webhook Verifier (`crates/cms-biz/src/integration.rs`):**
  - Webhook delivery uses HMAC-SHA256 signatures (`X-Hub-Signature-256`) with 32-byte cryptographically secure random secrets (`whsec_...`).

### 4.2 DoS and Resource Protection
- **Axum Limits:** `DefaultBodyLimit::max(25 * 1024 * 1024)` (25MB limit prevents oversized JSON/upload attacks).
- **Timeouts:** `TimeoutLayer::new(Duration::from_secs(30))` guards against slowloris attacks.
- **Database Error Redaction:** All internal SQL and foreign key errors are caught by `cms-error` and translated into generic safe messages (`"An internal database error occurred"`) alongside a unique tracing UUID (`X-Error-ID`).

---

## 5. Security Regression Tests Plan

To ensure that authorization defects cannot recur, the following regression tests are specified:

1. **Test `test_sec01_standalone_page_idor_protection`:**
   - Create Project A (User 1) and Page A1.
   - User 2 (member only of Project B) issues `GET /api/pages/{page_a1_id}`.
   - **Assertion:** Expect `403 Forbidden` (previously returned `200 OK`).
2. **Test `test_sec02_unauthorized_member_removal_blocked`:**
   - Project Owner invites User 2 as Editor.
   - User 3 (unrelated user) issues `DELETE /api/projects/{project_a_id}/members/{user_2_id}`.
   - **Assertion:** Expect `403 Forbidden` (previously returned `204 No Content`).
3. **Test `test_sec03_project_integrations_gated`:**
   - User 2 (Viewer) issues `POST /api/projects/{project_a_id}/integrations`.
   - **Assertion:** Expect `403 Forbidden`.
