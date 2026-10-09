# First-Time Onboarding & Application Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first-time application onboarding route, backend logic, and setup wizard allowing administrators to configure their admin account, workspace profile, authentication policies, and theme on first launch.

**Architecture:** A singleton `"SystemSettings"` table in PostgreSQL tracks initialization state and platform-wide auth policies. A public backend API (`/api/public/setup/status` and `/api/public/setup/complete`) provides atomic validation, superadmin account creation, and immediate authenticated session creation. The frontend (`apps/studio`) enforces route guards on `/`, `/app`, and `/(auth)` redirecting uninitialized instances to a 5-step guided wizard at `/onboarding`.

**Tech Stack:** Rust (Axum, SQLx, Argon2, Utoipa), React 19, TanStack Router, TanStack Query, `@cms/design-system`, TypeScript, Playwright.

## Global Constraints

- Platform is exclusively for internal company use; absolutely no billing, pricing, or subscription plans.
- Root route `/` redirects to `/app` (or `/onboarding` if uninitialized); no marketing or landing pages.
- Setup can only be executed once; subsequent calls to setup endpoints must return `409 Conflict`.
- Completing setup must automatically log in the administrator and set the HTTP-only session cookie.

---

### Task 1: Database Migration for `SystemSettings`

**Files:**
- Create: `migrations/20260117000000_system_settings_and_onboarding.sql`

**Interfaces:**
- Produces: Table `"SystemSettings"` with columns `id`, `is_initialized`, `initialized_at`, `initialized_by`, `allow_public_signup`, `require_email_verification`, `auth_providers`, `default_theme`, `default_locale`, `created_at`, `updated_at`.

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration: 20260117000000_system_settings_and_onboarding.sql
CREATE TABLE IF NOT EXISTS "SystemSettings" (
    id TEXT PRIMARY KEY DEFAULT 'default',
    is_initialized BOOLEAN NOT NULL DEFAULT false,
    initialized_at TIMESTAMPTZ,
    initialized_by TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    allow_public_signup BOOLEAN NOT NULL DEFAULT false,
    require_email_verification BOOLEAN NOT NULL DEFAULT false,
    auth_providers JSONB NOT NULL DEFAULT '{"google": true, "github": true}'::jsonb,
    default_theme TEXT NOT NULL DEFAULT 'system',
    default_locale TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "SystemSettings" (id, is_initialized)
VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_system_settings_initialized ON "SystemSettings"(is_initialized);
```

- [ ] **Step 2: Commit migration file**

```bash
git add migrations/20260117000000_system_settings_and_onboarding.sql
git commit -m "feat(db): add SystemSettings migration for first-time onboarding"
```

---

### Task 2: Setup Entities & DTOs

**Files:**
- Create: `crates/cms-entity/src/setup.rs`
- Modify: `crates/cms-entity/src/lib.rs`

**Interfaces:**
- Produces: `SetupStatusResponse`, `CompleteSetupRequest`, `CompleteSetupResponse` in `cms_entity::setup`.

- [ ] **Step 1: Create `crates/cms-entity/src/setup.rs`**

```rust
//! Setup entity and request/response types

use serde::{Deserialize, Serialize};
use validator::Validate;
use crate::auth::UserResponse;

/// Public setup status response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatusResponse {
    pub is_initialized: bool,
    pub requires_setup: bool,
    pub configured_oauth_providers: Vec<String>,
}

/// Request payload to complete onboarding setup
#[derive(Debug, Clone, Deserialize, Serialize, Validate, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSetupRequest {
    #[validate(length(min = 2, message = "Admin name must be at least 2 characters"))]
    pub admin_name: String,
    #[validate(email(message = "Invalid email format"))]
    pub admin_email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub admin_password: String,

    #[validate(length(min = 2, message = "Workspace name must be at least 2 characters"))]
    pub workspace_name: String,
    #[validate(length(min = 2, message = "Workspace slug must be at least 2 characters"))]
    pub workspace_slug: String,
    pub workspace_logo_url: Option<String>,
    pub workspace_description: Option<String>,

    pub allow_public_signup: bool,
    pub require_email_verification: bool,
    pub enabled_oauth_providers: Vec<String>,

    pub default_theme: String,
    pub default_locale: String,
}

/// Setup completion response
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSetupResponse {
    pub success: bool,
    pub user: UserResponse,
    pub redirect_url: String,
}
```

- [ ] **Step 2: Export `setup` module in `crates/cms-entity/src/lib.rs`**

```rust
pub mod setup;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p cms-entity`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/cms-entity/src/setup.rs crates/cms-entity/src/lib.rs
git commit -m "feat(entity): add setup request and response types"
```

---

### Task 3: Database & Business Service Layer for Setup

**Files:**
- Create: `crates/cms-db/src/setup.rs`
- Modify: `crates/cms-db/src/lib.rs`
- Create: `crates/cms-biz/src/setup.rs`
- Modify: `crates/cms-biz/src/lib.rs`

**Interfaces:**
- Consumes: `SetupStatusResponse`, `CompleteSetupRequest`, `CompleteSetupResponse` from `cms_entity::setup`.
- Produces: `SetupQueries::get_status`, `SetupQueries::complete_setup`, `SetupService::get_status`, `SetupService::complete_setup`.

- [ ] **Step 1: Write DB queries in `crates/cms-db/src/setup.rs`**

```rust
//! Database queries for platform setup and system settings

use chrono::Utc;
use cms_entity::setup::CompleteSetupRequest;
use cms_error::AppError;
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct SetupQueries;

impl SetupQueries {
    /// Check whether the platform requires initial setup
    pub async fn get_setup_status(pool: &PgPool) -> Result<(bool, bool), AppError> {
        let is_initialized = sqlx::query_scalar::<_, bool>(
            r#"SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' LIMIT 1"#
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(e.into()))?
        .unwrap_or(false);

        let user_count = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM "User""#)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        let requires_setup = !is_initialized || user_count == 0;
        Ok((is_initialized, requires_setup))
    }

    /// Execute atomic setup completion
    pub async fn complete_setup(
        pool: &PgPool,
        req: &CompleteSetupRequest,
        session_token: &str,
    ) -> Result<cms_entity::auth::User, AppError> {
        let mut tx = pool.begin().await.map_err(|e| AppError::Database(e.into()))?;

        // 1. Transactional lock check
        let initialized: bool = sqlx::query_scalar(
            r#"SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' FOR UPDATE"#
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        if initialized {
            return Err(AppError::Conflict("System setup has already been completed".to_string()));
        }

        let user_count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "User""#)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.into()))?;

        if user_count > 0 {
            return Err(AppError::Conflict("System already contains registered users".to_string()));
        }

        // 2. Create primary superadmin user
        let user_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let user_row = sqlx::query_as::<_, cms_db::auth::UserRow>(
            r#"
            INSERT INTO "User" (id, email, name, email_verified, role, created_at, updated_at)
            VALUES ($1, $2, $3, true, 'admin', $4, $5)
            RETURNING id, email, name, image, email_verified, created_at, updated_at
            "#
        )
        .bind(&user_id)
        .bind(&req.admin_email)
        .bind(&req.admin_name)
        .bind(now)
        .bind(now)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 3. Create credentials account
        let hashed_password = cms_auth::password::hash_password(&req.admin_password)?;
        let account_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO "Account" (id, user_id, provider, provider_account_id, password, created_at, updated_at)
            VALUES ($1, $2, 'credentials', $3, $4, $5, $6)
            "#
        )
        .bind(&account_id)
        .bind(&user_id)
        .bind(&req.admin_email)
        .bind(&hashed_password)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 4. Update WorkspaceSettings
        sqlx::query(
            r#"
            INSERT INTO "WorkspaceSettings" (id, name, slug, logo_url, description, updated_at)
            VALUES ('default', $1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                logo_url = EXCLUDED.logo_url,
                description = EXCLUDED.description,
                updated_at = EXCLUDED.updated_at
            "#
        )
        .bind(&req.workspace_name)
        .bind(&req.workspace_slug)
        .bind(&req.workspace_logo_url)
        .bind(&req.workspace_description)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 5. Update SystemSettings
        let auth_providers = serde_json::to_value(&req.enabled_oauth_providers).unwrap_or_default();
        sqlx::query(
            r#"
            UPDATE "SystemSettings"
            SET is_initialized = true,
                initialized_at = $1,
                initialized_by = $2,
                allow_public_signup = $3,
                require_email_verification = $4,
                auth_providers = $5,
                default_theme = $6,
                default_locale = $7,
                updated_at = $8
            WHERE id = 'default'
            "#
        )
        .bind(now)
        .bind(&user_id)
        .bind(req.allow_public_signup)
        .bind(req.require_email_verification)
        .bind(auth_providers)
        .bind(&req.default_theme)
        .bind(&req.default_locale)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        // 6. Create initial admin session
        let expires_at = now + chrono::Duration::days(30);
        sqlx::query(
            r#"
            INSERT INTO "Session" (id, user_id, session_token, expires_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&user_id)
        .bind(session_token)
        .bind(expires_at)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.into()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.into()))?;

        Ok(user_row.into())
    }
}
```

- [ ] **Step 2: Export `setup` in `crates/cms-db/src/lib.rs`**

```rust
pub mod setup;
pub use setup::SetupQueries;
```

- [ ] **Step 3: Implement `SetupService` in `crates/cms-biz/src/setup.rs`**

```rust
//! Setup business service

use cms_db::SetupQueries;
use cms_entity::setup::{CompleteSetupRequest, CompleteSetupResponse, SetupStatusResponse};
use cms_error::AppError;
use cms_middleware::BizContext;

pub struct SetupService;

impl SetupService {
    pub async fn get_status(ctx: &BizContext, configured_oauth: Vec<String>) -> Result<SetupStatusResponse, AppError> {
        let (is_initialized, requires_setup) = SetupQueries::get_setup_status(&ctx.pool).await?;
        Ok(SetupStatusResponse {
            is_initialized,
            requires_setup,
            configured_oauth_providers: configured_oauth,
        })
    }

    pub async fn complete_setup(
        ctx: &BizContext,
        req: CompleteSetupRequest,
        session_token: &str,
    ) -> Result<CompleteSetupResponse, AppError> {
        let user = SetupQueries::complete_setup(&ctx.pool, &req, session_token).await?;
        Ok(CompleteSetupResponse {
            success: true,
            user: user.into(),
            redirect_url: "/app".to_string(),
        })
    }
}
```

- [ ] **Step 4: Export `setup` in `crates/cms-biz/src/lib.rs`**

```rust
pub mod setup;
pub use setup::SetupService;
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p cms-biz`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/cms-db/src/setup.rs crates/cms-db/src/lib.rs crates/cms-biz/src/setup.rs crates/cms-biz/src/lib.rs
git commit -m "feat(biz): add SetupQueries and SetupService"
```

---

### Task 4: API Handlers & Routing for Setup

**Files:**
- Create: `crates/cms-api/src/setup/mod.rs`
- Create: `crates/cms-api/src/setup/handlers.rs`
- Modify: `crates/cms-api/src/lib.rs`
- Modify: `crates/cms-api/src/public/handlers.rs`

**Interfaces:**
- Produces: `GET /api/public/setup/status`, `POST /api/public/setup/complete`.
- Modifies: `GET /api/public/meta` to include dynamic `setupRequired` and `signupDisabled` values from `SystemSettings`.

- [ ] **Step 1: Create `crates/cms-api/src/setup/handlers.rs`**

```rust
//! Handlers for public setup and onboarding

use std::sync::Arc;
use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use cms_biz::SetupService;
use cms_entity::setup::{CompleteSetupRequest, CompleteSetupResponse, SetupStatusResponse};
use cms_error::AppError;
use cms_middleware::app_state::AppState;
use uuid::Uuid;

use crate::validation::ValidatedJson;

/// Get setup status
pub async fn get_setup_status_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SetupStatusResponse>, AppError> {
    let mut configured_oauth = Vec::new();
    if let Some(oauth) = state.config.auth.oauth.as_ref() {
        if oauth.google.is_some() {
            configured_oauth.push("google".to_string());
        }
        if oauth.github.is_some() {
            configured_oauth.push("github".to_string());
        }
    }

    let status = SetupService::get_status(&state.biz_context, configured_oauth).await?;
    Ok(Json(status))
}

/// Complete setup and initialize platform
pub async fn complete_setup_handler(
    State(state): State<Arc<AppState>>,
    ValidatedJson(payload): ValidatedJson<CompleteSetupRequest>,
) -> Result<(HeaderMap, Json<CompleteSetupResponse>), AppError> {
    let session_token = Uuid::new_v4().to_string();
    let res = SetupService::complete_setup(&state.biz_context, payload, &session_token).await?;

    let mut res_headers = HeaderMap::new();
    let cookie_val = state.config.auth.session_cookie_value(
        &session_token,
        30 * 24 * 3600,
        state.config.is_production(),
        state.config.server.https,
    );
    if let Ok(val) = axum::http::HeaderValue::from_str(&cookie_val) {
        res_headers.insert(axum::http::header::SET_COOKIE, val);
    }

    Ok((res_headers, Json(res)))
}
```

- [ ] **Step 2: Create `crates/cms-api/src/setup/mod.rs`**

```rust
use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use cms_middleware::app_state::AppState;

pub mod handlers;
use handlers::*;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/status", get(get_setup_status_handler))
        .route("/complete", post(complete_setup_handler))
        .with_state(state)
}
```

- [ ] **Step 3: Mount setup routes in `crates/cms-api/src/lib.rs`**

Add `pub mod setup;` and mount `router.nest("/public/setup", setup::router(state.clone()))`.

- [ ] **Step 4: Update `get_public_meta_handler` in `crates/cms-api/src/public/handlers.rs`**

Query `SystemSettings` to expose dynamic `signupDisabled` (`!allow_public_signup`) and `setupRequired`.

- [ ] **Step 5: Verify backend builds**

Run: `cargo check -p cms-api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/cms-api/src/setup/ crates/cms-api/src/lib.rs crates/cms-api/src/public/handlers.rs
git commit -m "feat(api): add setup status and complete endpoints"
```

---

### Task 5: TypeScript SDK & Client Integration

**Files:**
- Create: `packages/sdk/src/resources/setup.ts`
- Modify: `packages/sdk/src/resources/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Create: `apps/studio/src/shared/hooks/api/setup.ts`

**Interfaces:**
- Produces: `cmsClient.setup.getStatus()`, `cmsClient.setup.complete()`, `useSetupStatus()` React Query hook.

- [ ] **Step 1: Create `packages/sdk/src/resources/setup.ts`**

```typescript
import type { HttpClient } from '../http';

export interface SetupStatus {
  isInitialized: boolean;
  requiresSetup: boolean;
  configuredOauthProviders: string[];
}

export interface CompleteSetupPayload {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl?: string;
  workspaceDescription?: string;
  allowPublicSignup: boolean;
  requireEmailVerification: boolean;
  enabledOauthProviders: string[];
  defaultTheme: string;
  defaultLocale: string;
}

export interface CompleteSetupResult {
  success: boolean;
  user: Record<string, unknown>;
  redirectUrl: string;
}

export class SetupResource {
  constructor(private readonly http: HttpClient) {}

  async getStatus(): Promise<SetupStatus> {
    return this.http.get<SetupStatus>('/api/public/setup/status');
  }

  async complete(payload: CompleteSetupPayload): Promise<CompleteSetupResult> {
    return this.http.post<CompleteSetupResult>('/api/public/setup/complete', payload);
  }
}
```

- [ ] **Step 2: Export in `packages/sdk/src/index.ts`**

Instantiate `this.setup = new SetupResource(this.http)` in `CmsClient`.

- [ ] **Step 3: Create `apps/studio/src/shared/hooks/api/setup.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '@/shared/services/cms-client';
import type { CompleteSetupPayload } from '@cms/sdk';

export const useSetupStatus = () =>
  useQuery({
    queryKey: ['setup', 'status'],
    queryFn: () => cmsClient.setup.getStatus(),
    staleTime: 30 * 1000,
  });

export const useCompleteSetup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CompleteSetupPayload) => cmsClient.setup.complete(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
  });
};
```

- [ ] **Step 4: Verify build of packages/sdk**

Run: `bun run build --filter @cms/sdk` (or `pnpm --filter @cms/sdk build`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/ apps/studio/src/shared/hooks/api/setup.ts
git commit -m "feat(sdk): add setup resource and React Query hooks"
```

---

### Task 6: Frontend Route Guards for Uninitialized Instances

**Files:**
- Modify: `apps/studio/src/routes/index.tsx`
- Modify: `apps/studio/src/routes/app/route.tsx`
- Modify: `apps/studio/src/routes/(auth)/route.tsx`

**Interfaces:**
- Consumes: `cmsClient.setup.getStatus()`.
- Logic: If `requiresSetup === true`, route redirect target is unconditionally `/onboarding`.

- [ ] **Step 1: Update `apps/studio/src/routes/index.tsx`**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    try {
      const status = await cmsClient.setup.getStatus();
      if (status.requiresSetup) {
        throw redirect({ to: '/onboarding' });
      }
    } catch (e) {
      if ((e as { isRedirect?: boolean }).isRedirect) throw e;
    }
    throw redirect({ to: '/app' });
  },
  component: () => null,
});
```

- [ ] **Step 2: Update `apps/studio/src/routes/app/route.tsx`**

In `beforeLoad`, if `routeSession` is missing, verify if `status.requiresSetup`: redirect to `/onboarding` if true, otherwise to `/sign-in`.

- [ ] **Step 3: Update `apps/studio/src/routes/(auth)/route.tsx`**

In `beforeLoad`, check `status.requiresSetup`: if true, redirect to `/onboarding`.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/routes/index.tsx apps/studio/src/routes/app/route.tsx apps/studio/src/routes/\(auth\)/route.tsx
git commit -m "feat(studio): add onboarding redirect guards"
```

---

### Task 7: Onboarding Wizard UI Components

**Files:**
- Create: `apps/studio/src/features/onboarding/components/StepIndicator.tsx`
- Create: `apps/studio/src/features/onboarding/components/AdminAccountStep.tsx`
- Create: `apps/studio/src/features/onboarding/components/WorkspaceProfileStep.tsx`
- Create: `apps/studio/src/features/onboarding/components/AuthPoliciesStep.tsx`
- Create: `apps/studio/src/features/onboarding/components/AppearanceStep.tsx`
- Create: `apps/studio/src/features/onboarding/components/ReviewLaunchStep.tsx`
- Create: `apps/studio/src/features/onboarding/OnboardingWizard.tsx`
- Create: `apps/studio/src/features/onboarding/index.ts`
- Create: `apps/studio/src/routes/onboarding.tsx`

**Interfaces:**
- Produces: Visual wizard page at `/onboarding` managing state across 5 steps and executing setup submission.

- [ ] **Step 1: Build `StepIndicator.tsx` with icons and step status**
- [ ] **Step 2: Build `AdminAccountStep.tsx` with email, name, password strength & validation**
- [ ] **Step 3: Build `WorkspaceProfileStep.tsx` with name, slug auto-derivation, logo preview**
- [ ] **Step 4: Build `AuthPoliciesStep.tsx` with invite-only vs public signup cards, email verification toggle, OAuth provider checkboxes**
- [ ] **Step 5: Build `AppearanceStep.tsx` with live theme switching (System/Dark/Light) and language dropdown**
- [ ] **Step 6: Build `ReviewLaunchStep.tsx` with summary review card and launch trigger**
- [ ] **Step 7: Assemble `OnboardingWizard.tsx` with TanStack Form / local state, toast feedback, and transition handling**
- [ ] **Step 8: Create `apps/studio/src/routes/onboarding.tsx` with guard to redirect to `/app` if `requiresSetup === false`**
- [ ] **Step 9: Run typecheck and linting**

Run: `bun run check` in `apps/studio`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/studio/src/features/onboarding/ apps/studio/src/routes/onboarding.tsx
git commit -m "feat(studio): add OnboardingWizard and /onboarding route"
```

---

### Task 8: Integration & End-to-End Tests

**Files:**
- Create: `tests/setup_flow.rs`
- Create: `apps/studio/e2e/onboarding.spec.ts`

- [ ] **Step 1: Write backend integration tests in `tests/setup_flow.rs`**
  - Verify initial `GET /api/public/setup/status` yields `requires_setup: true`.
  - Verify `POST /api/public/setup/complete` creates admin user with `role: admin`, sets session cookie.
  - Verify second call to complete setup returns `409 Conflict`.
- [ ] **Step 2: Run backend tests**

Run: `cargo test --test setup_flow`
Expected: PASS

- [ ] **Step 3: Write Playwright E2E tests in `apps/studio/e2e/onboarding.spec.ts`**
  - Test redirection from `/` to `/onboarding`.
  - Test stepper forward and back state retention.
  - Test submission and arrival at `/app`.
  - Test `/onboarding` guard lockdown after setup.
- [ ] **Step 4: Run E2E tests**

Run: `bun run test:e2e e2e/onboarding.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/setup_flow.rs apps/studio/e2e/onboarding.spec.ts
git commit -m "test: add integration and e2e test coverage for onboarding setup"
```
