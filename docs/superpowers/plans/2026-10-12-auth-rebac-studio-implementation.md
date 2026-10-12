# Production-Ready Auth & ReBAC Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully align CMS Studio, `@cms/sdk`, `@cms/auth`, and `cms-api` with the new Zanzibar ReBAC model and enterprise account security (TOTP MFA with emergency recovery codes, OAuth PKCE providers, and Machine API key scopes), while purging all legacy custom roles and 2D permission matrix dead code.

**Architecture:** Layered architecture where `cms-api` exposes typed MFA and ReBAC routes, `@cms/sdk` and `@cms/auth` manage typed HTTP contracts and reactive mutation hooks, and Studio delivers a polished, accessible UX for 2FA setup, login challenges, and canonical ReBAC project/workspace membership.

**Tech Stack:** Rust (Axum, SQLx, `cms_mfa`, `cms_auth`), TypeScript, React 19, TanStack Query, TanStack Form, Vitest, Lucide React, Biome.

## Global Constraints

- Multi-tenant / enterprise internal platform scope (`AGENTS.md`): No plan/billing tiers, no marketing pages.
- Pure Zanzibar ReBAC: Only canonical relations (`owner`, `admin`, `member`, `viewer`).
- Zero unverified code: Every task must have concrete unit or integration tests that pass.
- Strict TypeScript & Rust safety: No `as any`, no `unwrap()` in production paths.

---

### Task 1: Backend MFA HTTP Handlers & Routes (`crates/cms-api`)

**Files:**
- Modify: `crates/cms-api/src/auth/handlers.rs`
- Modify: `crates/cms-api/src/auth/mod.rs`
- Create: `crates/cms-api/tests/mfa_http_handlers_test.rs`

**Interfaces:**
- Produces:
  - `POST /auth/mfa/setup` -> `{ secret, otpauth_uri, qr_png_base64, recovery_codes }`
  - `POST /auth/mfa/verify` -> `{ success: bool }`
  - `POST /auth/mfa/disable` -> `{ success: bool }`
  - `POST /auth/mfa/challenge` -> authenticated `UserResponse` + session cookie
  - `POST /auth/login` updated: returns `{ mfa_required: true, email: String }` when `user.mfa_enabled == true`.

- [ ] **Step 1: Write integration tests for MFA HTTP endpoints**
  Create `crates/cms-api/tests/mfa_http_handlers_test.rs` testing `setup`, `verify`, `challenge` with valid TOTP, `challenge` with recovery code, and `disable`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cargo test -p cms-api --test mfa_http_handlers_test`
  Expected: FAIL with missing handler functions or routes.

- [ ] **Step 3: Implement MFA handlers in `crates/cms-api/src/auth/handlers.rs`**
  Add `setup_mfa_handler`, `verify_mfa_handler`, `disable_mfa_handler`, and `mfa_challenge_handler`. Update `login_handler` to check `user.mfa_enabled` before issuing cookies.

- [ ] **Step 4: Wire MFA routes in `crates/cms-api/src/auth/mod.rs`**
  Mount `.route("/mfa/setup", post(setup_mfa_handler))` etc.

- [ ] **Step 5: Run tests to verify they pass**
  Run: `cargo test -p cms-api --test mfa_http_handlers_test`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add crates/cms-api/src/auth/ crates/cms-api/tests/mfa_http_handlers_test.rs; git commit -m "feat(api): add production-ready mfa http endpoints and login challenge"`

---

### Task 2: SDK & Auth Shared Packages Alignment (`@cms/sdk`, `@cms/auth`)

**Files:**
- Delete: `packages/sdk/src/resources/roles.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/resources/auth.ts`
- Modify: `packages/auth/src/types.ts`
- Modify: `packages/auth/src/hooks/use-auth-mutations.ts`
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: Backend MFA endpoints from Task 1.
- Produces:
  - `cmsClient.auth.setupMfa()`, `verifyMfa()`, `disableMfa()`, `challengeMfa()`
  - Hooks: `useMfaSetup()`, `useMfaVerify()`, `useMfaDisable()`, `useMfaChallenge()`
  - Removes `cmsClient.roles` entirely.

- [ ] **Step 1: Delete `packages/sdk/src/resources/roles.ts` and remove from `client.ts`**
  Remove `RolesResource` import and `public readonly roles: RolesResource;`.

- [ ] **Step 2: Add typed MFA methods to `packages/sdk/src/resources/auth.ts`**
  Implement `setupMfa`, `verifyMfa`, `disableMfa`, `challengeMfa`.

- [ ] **Step 3: Export MFA types in `packages/auth/src/types.ts`**
  Export `MfaSetupResponse`, `MfaVerifyPayload`, `MfaChallengePayload`.

- [ ] **Step 4: Implement MFA mutation hooks in `packages/auth/src/hooks/use-auth-mutations.ts`**
  Create `useMfaSetup`, `useMfaVerify`, `useMfaDisable`, `useMfaChallenge`. Re-export in `packages/auth/src/index.ts`.

- [ ] **Step 5: Run typecheck across packages**
  Run: `pnpm --filter @cms/sdk --filter @cms/auth typecheck`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add packages/sdk packages/auth; git commit -m "feat(sdk,auth): add typed mfa methods and remove legacy roles resource"`

---

### Task 3: Purge Dead Custom Roles & 2D Matrix from Studio

**Files:**
- Delete:
  - `apps/studio/src/features/project-settings/components/project-roles-section.tsx`
  - `apps/studio/src/features/project-settings/components/project-roles-section.test.tsx`
  - `apps/studio/src/features/project-settings/components/role-editor-panel.tsx`
  - `apps/studio/src/features/project-settings/components/workspace-roles-tab.tsx`
  - `apps/studio/src/features/workspace/WorkspaceRolesSection.tsx`
  - `apps/studio/src/features/workspace/WorkspaceRolesSection.test.tsx`
  - `apps/studio/src/shared/hooks/api/roles.ts`
- Modify:
  - `apps/studio/src/features/project-settings/index.ts`
  - `apps/studio/src/shared/hooks/api/index.ts`
  - `apps/studio/src/features/project-settings/WorkspaceSettingsPage.tsx`
  - `apps/studio/src/features/project-settings/WorkspaceSettingsPage.test.tsx`
  - `apps/studio/src/features/workspace/WorkspaceMembersPage.tsx`

**Interfaces:**
- Removes obsolete role management tabs and hooks without breaking existing member management.

- [ ] **Step 1: Delete obsolete custom roles components and tests**
  Remove the 7 dead files listed above using PowerShell `Remove-Item`.

- [ ] **Step 2: Remove role exports in `index.ts` barrels**
  Update `apps/studio/src/features/project-settings/index.ts` and `apps/studio/src/shared/hooks/api/index.ts`.

- [ ] **Step 3: Update `WorkspaceSettingsPage.tsx` and its tests**
  Remove `workspace-roles` tab from `WorkspaceSettingsTab`, tabs array, and component render. Update `WorkspaceSettingsPage.test.tsx`.

- [ ] **Step 4: Update `WorkspaceMembersPage.tsx`**
  Remove the `roles` Tab and TabTrigger from `WorkspaceMembersPage.tsx`.

- [ ] **Step 5: Run Studio typecheck & vitest**
  Run: `pnpm --filter @cms/studio typecheck` and `pnpm --filter @cms/studio test`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add apps/studio; git commit -m "refactor(studio): purge legacy custom roles and 2d permission matrix UI"`

---

### Task 4: ReBAC Project Members UI & Ownership Transfer (`members-section.tsx`)

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/members-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/members-section.test.tsx`

**Interfaces:**
- Consumes: Canonical ReBAC roles (`admin`, `member`, `viewer`).
- Produces:
  - Clean member list with role badges (`Crown`, `Shield`, `Pencil`, `Eye`).
  - Single-owner enforcement with Transfer Ownership dialog.
  - Role capabilities tooltip/popover explaining Zanzibar relations.

- [ ] **Step 1: Update `members-section.test.tsx` to assert ReBAC roles**
  Remove custom role mocking and assert canonical roles (`admin`, `member`, `viewer`).

- [ ] **Step 2: Run test to verify failure/discrepancies**
  Run: `pnpm --filter @cms/studio test members-section`

- [ ] **Step 3: Refactor `members-section.tsx`**
  - Remove `Tabs` (`members` vs `roles`) and `useProjectRoles`.
  - Provide direct select for `admin`, `member`, `viewer`.
  - Add visual badges and clear capability descriptions.
  - Keep transfer ownership modal for current owner.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `pnpm --filter @cms/studio test members-section`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add apps/studio/src/features/project-settings/components/members-section.*; git commit -m "feat(studio): align project members with canonical rebac relations"`

---

### Task 5: Studio 2FA Security Card in Account Settings (`account-tab.tsx`)

**Files:**
- Create: `apps/studio/src/features/project-settings/components/two-factor-auth-card.tsx`
- Create: `apps/studio/src/features/project-settings/components/two-factor-auth-card.test.tsx`
- Modify: `apps/studio/src/features/project-settings/components/account-tab.tsx`

**Interfaces:**
- Consumes: `useMfaSetup`, `useMfaVerify`, `useMfaDisable` from `@cms/auth`.
- Produces: TwoFactorAuthCard component with QR setup dialog, 6-digit confirmation test, recovery code download, and disable dialog.

- [ ] **Step 1: Write tests for `TwoFactorAuthCard`**
  Create `two-factor-auth-card.test.tsx` testing inactive state, setup dialog opening, and recovery codes display.

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @cms/studio test two-factor-auth-card`
  Expected: FAIL

- [ ] **Step 3: Implement `TwoFactorAuthCard`**
  Build component with active/inactive status, setup modal (base64 QR display, secret copy, `InputOTP` verification, recovery code download & copy), and disable confirmation.

- [ ] **Step 4: Embed `TwoFactorAuthCard` inside `account-tab.tsx`**
  Mount under account security section.

- [ ] **Step 5: Run tests to verify they pass**
  Run: `pnpm --filter @cms/studio test two-factor-auth-card`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add apps/studio/src/features/project-settings/components/; git commit -m "feat(studio): add enterprise 2fa security card to account settings"`

---

### Task 6: Sign-In MFA Challenge & Dual Social Auth (`SignInForm.tsx`)

**Files:**
- Modify: `packages/auth/src/forms/sign-in-form.tsx`
- Modify: `packages/auth/src/forms/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `useMfaChallenge` from `@cms/auth`.
- Produces:
  - 2-step sign-in form (Step 1 credentials/OTP -> Step 2 TOTP or recovery code).
  - GitHub and Google branded OAuth buttons.

- [ ] **Step 1: Write tests in `sign-in-form.test.tsx`**
  Add tests for MFA challenge transition upon receiving `mfa_required` response.

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @cms/auth test sign-in-form`

- [ ] **Step 3: Implement 2-step MFA flow and GitHub provider in `sign-in-form.tsx`**
  - Add state `mfaRequired: boolean`, `mfaCode: string`, `useRecoveryCode: boolean`.
  - When credentials response signals `mfa_required`, switch to Step 2.
  - Render 6-slot `InputOTP` with autofocus, plus toggle for emergency backup code.
  - Add GitHub social button alongside Google.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `pnpm --filter @cms/auth test sign-in-form`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add packages/auth/src/forms/; git commit -m "feat(auth): add 2fa login challenge and github oauth provider"`

---

### Task 7: Machine API Key Scopes Alignment (`api-keys-tab.tsx`)

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/api-keys-tab.tsx`
- Modify: `apps/studio/src/features/project-settings/components/api-keys-tab.test.tsx`

**Interfaces:**
- Consumes: Scopes from backend `cms-api-keys`.
- Produces: Selectable scopes `cms:read`, `cms:write`, `cms:admin` with badges and descriptive labels.

- [ ] **Step 1: Update `api-keys-tab.test.tsx`**
  Update test to check for `cms:read` / `cms:write` / `cms:admin` scope badges.

- [ ] **Step 2: Update `api-keys-tab.tsx`**
  Align available scopes to canonical backend scopes (`cms:read`, `cms:write`, `cms:admin`).

- [ ] **Step 3: Run test to verify it passes**
  Run: `pnpm --filter @cms/studio test api-keys-tab`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git add apps/studio/src/features/project-settings/components/api-keys-tab.*; git commit -m "feat(studio): align machine api key scopes with cms-api-keys"`

---

### Task 8: Full End-to-End Workspace Verification

**Files:**
- Entire workspace (`cms-rs-3`)

- [ ] **Step 1: Run Rust workspace check & tests**
  Run: `cargo check --workspace`
  Run: `cargo test -p cms-api --test medbrains_auth_rebac_e2e_test`
  Run: `cargo test -p cms-api --test mfa_http_handlers_test`
  Expected: All Rust checks and tests pass with 0 warnings/errors.

- [ ] **Step 2: Run TypeScript monorepo typecheck & tests**
  Run: `pnpm --filter @cms/studio typecheck`
  Run: `pnpm --filter @cms/studio test`
  Expected: All Studio tests pass cleanly.

- [ ] **Step 3: Final Git status & commit summary**
  Ensure working directory is clean.
