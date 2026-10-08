# Auth Package & Session Modernization Design Spec

**Date:** 2026-10-08  
**Scope:** `cms-rs-3` (crates/cms-* backend & packages/auth frontend package)  
**Status:** Approved by User  

---

## 1. Context and Problem Statement

During the migration from the original Hono + Better-Auth backend to the Rust Axum platform (`cms-rs-3`) and `@cms/sdk`, transitional Better-Auth compatibility shims were retained:
1. **Legacy Session Cookie**: The session cookie across Rust Axum handlers, middleware, and tests remained hardcoded as `better-auth.session_token`.
2. **Legacy Better-Auth Adapter Shim**: `apps/studio/src/features/auth/services/auth-client.ts` simulated Better-Auth's nested client API (`authClient.emailOtp.*`, `authClient.signIn.*`, `authClient.organization.*`, `authClient.admin.*`) wrapping `@cms/sdk`.
3. **Monolithic Auth in Studio**: Auth logic, TanStack Query cache logic, and form components were bundled inside `apps/studio`, preventing reuse across other frontend surfaces (such as `apps/reader` or future admin apps).
4. **Legacy Comments & Annotations**: Entity docstrings in `cms-entity` and shared constants referenced Better-Auth.

The objective is to strictly cut over to a native `cms_session` cookie on the backend, create a dedicated, reusable `@cms/auth` workspace package hosting advanced TanStack Query hooks and router-agnostic UI forms, and integrate it cleanly into `@cms/studio`.

---

## 2. Backend Session Cookie Modernization (`crates/cms-*`)

### 2.1 Cookie Configuration
- In `crates/cms-config/src/auth.rs`:
  - Define canonical cookie constant:
    ```rust
    pub const SESSION_COOKIE_NAME: &str = "cms_session";
    ```
  - In `AuthConfig::session_cookie_value(...)`:
    Format cookie header with `SESSION_COOKIE_NAME`:
    ```rust
    format!(
        "{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; \
         SameSite={same_site}{secure_suffix}; Max-Age={max_age_secs}"
    )
    ```
  - In `AuthConfig::clear_session_cookie_value(...)`:
    Format cookie clearance header with `SESSION_COOKIE_NAME`:
    ```rust
    format!(
        "{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; \
         SameSite={same_site}{secure_suffix}"
    )
    ```

### 2.2 Axum API Handlers & Middleware
- In `crates/cms-api/src/auth/middleware.rs`:
  - In `extract_from_cookie`, parse the cookie matching `SESSION_COOKIE_NAME` (`cms_session`).
- In `crates/cms-api/src/auth/handlers.rs`:
  - In `logout_handler`: look for `SESSION_COOKIE_NAME` (`cms_session`) and invoke `AuthService::logout`.
  - In `refresh_session_handler`: extract `SESSION_COOKIE_NAME` (`cms_session`) and return refreshed cookie.
  - In `stop_impersonating_handler`: look for `SESSION_COOKIE_NAME` (`cms_session`).
  - In `get_session_handler`: extract `SESSION_COOKIE_NAME` (`cms_session`).
- In `crates/cms-middleware/src/admin_origin.rs` and `crates/cms-api/tests/common/mod.rs`:
  - Update test fixtures and request headers from `better-auth.session_token` to `cms_session`.

### 2.3 Comments & Entity Cleanup
- In `crates/cms-entity/src/auth.rs`:
  - Update comments on `AuthUser` and `AuthSession` from `"matching Better-Auth / SPA client format"` to `"Authenticated user representation matching CMS auth format"`.
- In `packages/shared/src/constants.ts`:
  - Update comments on `WORKSPACE_ROLES` to remove Better-Auth references.

---

## 3. Dedicated `@cms/auth` Package (`packages/auth`)

### 3.1 Package Metadata & Setup
- Path: `packages/auth/`
- Workspace name: `@cms/auth`
- Export map:
  - `.`: `./src/index.ts`
  - `./forms`: `./src/forms/index.ts`
  - `./hooks`: `./src/hooks/index.ts`
  - `./service`: `./src/service/index.ts`
  - `./types`: `./src/types.ts`
- Dependencies:
  - `@cms/sdk`: `workspace:*`
  - `@cms/ui`: `workspace:*`
  - `@cms/i18n`: `workspace:*`
  - `@cms/icons`: `workspace:*`
  - `@cms/validators`: `workspace:*`
  - `@tanstack/react-query`: `^5.104.1`
  - `lucide-react`: `^1.52.0`
  - `zod`: `^4.6.5`
- Peer Dependencies: `react`, `react-dom`.

### 3.2 Service Layer (`src/service/auth-service.ts`)
Flat async functions directly delegating to `CmsClient.auth` without nested legacy namespaces:
- `getSession(client: CmsClient): Promise<AuthSessionData | null>`
- `signInEmailOtp(client: CmsClient, payload: SignInEmailOtpPayload): Promise<AuthSessionData>`
- `sendVerificationOtp(client: CmsClient, payload: SendVerificationOtpPayload): Promise<{ success?: boolean }>`
- `verifyEmailOtp(client: CmsClient, payload: VerifyEmailOtpPayload): Promise<{ success?: boolean }>`
- `verifyEmail(client: CmsClient, token: string): Promise<{ success?: boolean }>`
- `signInSocial(client: CmsClient, payload: SignInSocialPayload): Promise<SignInSocialResponse>`
- `signOut(client: CmsClient): Promise<{ success?: boolean }>`
- `updateUser(client: CmsClient, payload: UpdateUserPayload): Promise<{ success?: boolean }>`
- `acceptInvitation(client: CmsClient, payload: AcceptInvitationPayload): Promise<{ success?: boolean }>`
- `stopImpersonating(client: CmsClient): Promise<{ success?: boolean }>`

### 3.3 TanStack Query Hooks Layer (`src/hooks/`)
- **Query Keys Factory (`src/hooks/keys.ts`)**:
  ```ts
  export const authKeys = {
    all: ['auth'] as const,
    session: () => [...authKeys.all, 'session'] as const,
  };
  ```
- **`useSession(client?: CmsClient)`**:
  - Fetches current session using `authKeys.session()`.
  - Cache duration: 5 minutes (`staleTime: 5 * 60 * 1000`).
- **`useSignInEmailOtp(client?: CmsClient)`**:
  - Mutation that triggers `signInEmailOtp`.
  - On success: updates `authKeys.session()` with returned `AuthSessionData` via `queryClient.setQueryData`.
- **`useSendVerificationOtp(client?: CmsClient)`**:
  - Mutation for sending verification or sign-in OTP with reactive loading/error states.
- **`useVerifyEmailOtp(client?: CmsClient)` & `useVerifyEmail(client?: CmsClient)`**:
  - Mutations for confirming email OTP or URL verification tokens.
- **`useSignOut(client?: CmsClient)`**:
  - Mutation that calls `signOut`.
  - On success: resets `authKeys.session()` to `null` and calls `queryClient.clear()`.
- **`useUpdateUser(client?: CmsClient)`**:
  - Mutation updating profile attributes, automatically invalidating `authKeys.session()`.
- **`useAcceptInvitation(client?: CmsClient)` & `useStopImpersonating(client?: CmsClient)`**:
  - Mutations for invitations and admin impersonation reset.

### 3.4 Router-Agnostic UI Forms (`src/forms/`)
Forms operate cleanly using callback props without coupling to `@tanstack/react-router`:
1. **`SignInForm`**:
   - Handles email input, OTP dispatch, countdown timer, OTP submission, and social sign-in.
   - Props:
     ```ts
     export interface SignInFormProps {
       client?: CmsClient;
       onSuccess?: (session: AuthSessionData) => void;
       onNavigateSignUp?: () => void;
       onNavigateForgotPassword?: () => void;
       googleEnabled?: boolean;
     }
     ```
2. **`SignUpForm`**:
   - Handles registration, OTP confirmation, and initial setup.
   - Props:
     ```ts
     export interface SignUpFormProps {
       client?: CmsClient;
       onSuccess?: (session: AuthSessionData) => void;
       onNavigateSignIn?: () => void;
       googleEnabled?: boolean;
     }
     ```
3. **`VerifyEmailForm`**:
   - Handles verification via URL query token or email OTP form with resend countdown.
   - Props:
     ```ts
     export interface VerifyEmailFormProps {
       client?: CmsClient;
       token?: string;
       email?: string;
       onSuccess?: () => void;
     }
     ```
4. **`AcceptInviteForm`**:
   - Validates and accepts workspace invitations.
   - Props:
     ```ts
     export interface AcceptInviteFormProps {
       client?: CmsClient;
       invitationId: string;
       onSuccess?: () => void;
     }
     ```
5. **`ForgotPasswordForm` & `ResetPasswordForm`**:
   - Password reset request and confirmation components.

---

## 4. Integration into `@cms/studio`

### 4.1 Dependency Setup
- Add `@cms/auth: "workspace:*"` to `apps/studio/package.json`.

### 4.2 Removing Legacy Files
- Delete `apps/studio/src/features/auth/services/auth-client.ts`.
- Delete `apps/studio/src/features/auth/services/auth-client.test.ts`.

### 4.3 Studio Routes & Pages Updates
- `apps/studio/src/routes/(auth)/route.tsx` & `apps/studio/src/routes/app/route.tsx`:
  - In `beforeLoad`, check session via `authService.getSession(cmsClient)`.
  - In components, consume `useSession()`.
  - Clean up legacy comments referring to Better-Auth.
- `apps/studio/src/features/auth/SignInPage.tsx`:
  - Renders `<SignInForm onSuccess={() => navigate({ to: '/app' })} onNavigateSignUp={() => navigate({ to: '/sign-up' })} />`.
- `apps/studio/src/features/auth/SignUpPage.tsx`:
  - Renders `<SignUpForm onSuccess={() => navigate({ to: '/app' })} onNavigateSignIn={() => navigate({ to: '/sign-in' })} />`.
- `apps/studio/src/features/auth/VerifyEmailPage.tsx`:
  - Renders `<VerifyEmailForm token={token} email={email} onSuccess={() => navigate({ to: '/app' })} />`.
- `apps/studio/src/features/auth/AcceptInvitePage.tsx`:
  - Renders `<AcceptInviteForm invitationId={invitationId} onSuccess={() => navigate({ to: '/app' })} />`.
- Account & Support components:
  - `apps/studio/src/features/workspace/components/SidebarAccountFooter.tsx`: uses `useSignOut()` and `useSession()`.
  - `apps/studio/src/features/workspace/components/SupportAccessBanner.tsx`: uses `useStopImpersonating()`.
  - `apps/studio/src/features/project-settings/components/account-tab.tsx`: uses `useUpdateUser()`, `useSendVerificationOtp()`.

### 4.4 E2E Test Modernization
- In `apps/studio/e2e/helpers/test-auth.ts`:
  - Parse and assemble `cms_session=${sessionToken}` instead of `better-auth.session_token`.
- In `apps/studio/e2e/studio-app-ui.spec.ts`:
  - Set browser cookies with `name: 'cms_session'`.
- In `apps/studio/scripts/check-bundle-budget.mjs`:
  - Update forbidden public asset pattern from `auth-client-` to reflect the new structure.

---

## 5. Verification Plan

1. **Rust Tests**:
   - Run `cargo test -p cms-config` and `cargo test -p cms-api` to ensure session cookie parsing and generation succeed.
2. **Typecheck & Monorepo Validation**:
   - Run `bun run typecheck` across all packages and apps.
3. **Unit Tests**:
   - Run `bun --filter @cms/auth test` and `bun --filter @cms/studio test`.
4. **Lint & Code Format**:
   - Run `bun run check` / `biome check`.
