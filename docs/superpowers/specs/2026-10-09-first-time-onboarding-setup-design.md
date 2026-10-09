# First-Time Onboarding & Application Setup Design

## 1. Overview & Context

This document specifies the architecture, routing logic, backend API contracts, and user interface for the **First-Time Application Setup & Onboarding** flow for the CMS platform.

As an internal company platform, the system requires a clean, guided bootstrapping experience on initial deployment or when running against a fresh database. When the instance is uninitialized, administrators are guided through a multi-step setup wizard to configure the primary administrator account, workspace branding, authentication & access policies, and default appearance, culminating in immediate automatic login and handover to the application dashboard (`/app`).

---

## 2. Platform Constraints & Non-Goals

1. **Internal Deployment Scope**:
   * The platform is deployed strictly for internal company use, **not** multi-tenant SaaS.
   * **No Plan / Billing Features**: No pricing tiers, Stripe/payment integrations, or subscription logic may be introduced.
   * **No Marketing / Public Pages**: The root path `/` remains strictly an application gateway and must never route to marketing or landing pages.
2. **Access Control**:
   * Setup can only be completed **once**. Once initialized, all setup endpoints are permanently locked, and the `/onboarding` route becomes inaccessible.

---

## 3. Data Model & Storage

### 3.1 Database Migration (`migrations/20260117000000_system_settings_and_onboarding.sql`)

A new platform-level singleton table `"SystemSettings"` records global instance flags and policies:

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

-- Seed singleton record
INSERT INTO "SystemSettings" (id, is_initialized)
VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_system_settings_initialized ON "SystemSettings"(is_initialized);
```

### 3.2 Rust Entities & DTOs (`crates/cms-entity/src/setup.rs`)

```rust
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
    // Admin credentials
    #[validate(length(min = 2, message = "Admin name must be at least 2 characters"))]
    pub admin_name: String,
    #[validate(email(message = "Invalid email format"))]
    pub admin_email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub admin_password: String,

    // Workspace identity
    #[validate(length(min = 2, message = "Workspace name must be at least 2 characters"))]
    pub workspace_name: String,
    #[validate(length(min = 2, message = "Workspace slug must be at least 2 characters"))]
    pub workspace_slug: String,
    pub workspace_logo_url: Option<String>,
    pub workspace_description: Option<String>,

    // Auth policies
    pub allow_public_signup: bool,
    pub require_email_verification: bool,
    pub enabled_oauth_providers: Vec<String>,

    // Appearance
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

---

## 4. Backend API Contracts & Handlers

### 4.1 Endpoints

1. **`GET /api/public/setup/status`**
   * **Access**: Public, unauthenticated.
   * **Logic**:
     * Fetch `is_initialized` from `"SystemSettings"`.
     * Check if `"User"` table is empty (`COUNT(*) == 0`).
     * `requires_setup` is `true` if `is_initialized == false` OR `user_count == 0`.
     * Read enabled OAuth provider configs (e.g. Google, GitHub) from `state.config.auth.oauth`.
     * Return `200 OK` with `SetupStatusResponse`.

2. **`POST /api/public/setup/complete`**
   * **Access**: Public, unauthenticated.
   * **Validation & Concurrency Safeguard**:
     * Acquire a transactional row lock: `SELECT is_initialized FROM "SystemSettings" WHERE id = 'default' FOR UPDATE`.
     * If `is_initialized == true` or user count > 0: abort immediately with `409 Conflict` / `AppError::Conflict("System setup has already been completed")`.
   * **Atomic Transaction Execution**:
     1. Insert Administrator user in `"User"` (`role = 'admin'`, `email_verified = true`).
     2. Hash `admin_password` with Argon2 and insert into `"Account"` (`provider = 'credentials'`).
     3. Update `"WorkspaceSettings"` with `workspace_name`, `workspace_slug`, `workspace_logo_url`, `workspace_description`.
     4. Update `"SystemSettings"` (`is_initialized = true`, `initialized_at = NOW()`, `initialized_by = user.id`, `allow_public_signup`, `require_email_verification`, `auth_providers`, `default_theme`, `default_locale`).
     5. Generate session token and insert into `"Session"`.
   * **Response**:
     * Set `Set-Cookie` header with session cookie using configured domain and security flags.
     * Return `200 OK` with `CompleteSetupResponse`.

3. **Public Metadata Integration (`GET /api/public/meta`)**:
   * Enriched to expose `signupDisabled: !allow_public_signup` dynamically sourced from `"SystemSettings"`, ensuring the frontend sign-up form respects instance policy.

---

## 5. Frontend Architecture (`apps/studio`)

### 5.1 Route Definition & Guards

* **Path**: `/onboarding` (`apps/studio/src/routes/onboarding.tsx`).
* **Route Guards (`beforeLoad`)**:
  * **On `/onboarding`**:
    * Fetches setup status via `getSetupStatus()`.
    * If `requires_setup === false`: redirects to `/app` (or `/sign-in` if no session).
  * **On `/` (Root Route)**:
    * If `requires_setup === true`: redirects to `/onboarding`.
    * If `requires_setup === false`: redirects to `/app`.
  * **On `/(auth)/*` (Sign In / Sign Up)**:
    * If `requires_setup === true`: redirects to `/onboarding`.
  * **On `/app/*` (App Shell)**:
    * If unauthenticated, checks setup status: if `requires_setup === true`, redirects to `/onboarding`.

### 5.2 Wizard Component Structure (`apps/studio/src/features/onboarding/`)

* **`OnboardingWizard`**: Root orchestrator component managing stepper state and form inputs.
* **Steps**:
  1. **Step 1: Admin Account (`AdminAccountStep`)**:
     * Full Name, Work Email, Password, Password Confirmation.
     * Password validation (length >= 8, matching passwords).
  2. **Step 2: Workspace Profile (`WorkspaceProfileStep`)**:
     * Workspace Name, Workspace Slug (slugified with live editing), Logo URL (with image preview), Description.
  3. **Step 3: Authentication & Access (`AuthPoliciesStep`)**:
     * Registration Mode: Radio cards for **Invite-Only (Recommended)** vs. **Open Self-Registration**.
     * Email verification switch toggle.
     * Social OAuth toggles for configured providers (Google, GitHub).
  4. **Step 4: Appearance & Theme (`AppearanceStep`)**:
     * Interactive Theme Cards: **System Default**, **Dark**, **Light**.
     * Immediately applies theme change in DOM for live preview.
     * Interface language dropdown (`INTERFACE_LOCALES`).
  5. **Step 5: Review & Launch (`ReviewLaunchStep`)**:
     * Summary cards reviewing configured settings.
     * "Initialize & Launch Platform" action button with loading spinner.
     * On completion: updates session cache, triggers welcome toast, and navigates to `/app`.

---

## 6. Testing & Quality Assurance

1. **Backend Integration Tests (`tests/setup_flow.rs`)**:
   * Uninitialized system returns `requires_setup: true`.
   * Successful atomic setup creates user as `admin`, sets session cookie, and updates settings.
   * Repeat calls to `POST /api/public/setup/complete` return `409 Conflict`.
   * Uninvited sign-up rejected when `allow_public_signup: false`.
2. **Frontend End-to-End Tests (`apps/studio/e2e/onboarding.spec.ts`)**:
   * Verifies automatic redirection from `/` and `/sign-in` to `/onboarding` on fresh instances.
   * Tests step transitions, back navigation state persistence, and form validation.
   * Verifies submission, auto-login, landing on `/app`, and subsequent guard blocking of `/onboarding`.
