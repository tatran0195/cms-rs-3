# Auth Package & Session Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy Better-Auth remnants by cutting over backend session cookies to native `cms_session`, extracting a reusable `@cms/auth` workspace package with advanced TanStack Query hooks and router-agnostic UI forms, and migrating `@cms/studio` to consume the modern auth package.

**Architecture:** The Rust backend is updated to use `cms_session` as the sole session cookie name across config, handlers, middleware, and tests. A new `@cms/auth` package is created in `packages/auth` containing a clean SDK service (`authService`), TanStack Query query/mutation hooks with automatic session cache synchronization, and router-agnostic UI forms. Finally, `@cms/studio` deletes the legacy `auth-client.ts` shim, depends on `@cms/auth`, and wires its route loaders and pages to the new package.

**Tech Stack:** Rust (Axum, tower-cookies), TypeScript, React 19, TanStack Query v5, `@cms/sdk`, `@cms/ui`, `@cms/i18n`, Biome, Vitest, Cargo.

## Global Constraints
- Target workspace: `d:\Workspace\Software\_working\cms-rs-3`
- Session cookie name: `cms_session`
- Strictly no legacy `better-auth.session_token` fallback
- No plan, billing, or pricing features introduced
- Monorepo package convention: workspace protocol `@cms/*: "workspace:*"`
- Code format: Biome / ultracite, English only

---

### Task 1: Backend Session Cookie Modernization in `crates/cms-*`

**Files:**
- Modify: `crates/cms-config/src/auth.rs:90-130`
- Modify: `crates/cms-api/src/auth/middleware.rs:85-105`
- Modify: `crates/cms-api/src/auth/handlers.rs:105-170,425-440,645-660`
- Modify: `crates/cms-api/tests/common/mod.rs:25-30`
- Modify: `crates/cms-middleware/src/admin_origin.rs:670-705`
- Modify: `crates/cms-entity/src/auth.rs:285-335`
- Modify: `packages/shared/src/constants.ts:1-10`

**Interfaces:**
- Produces: `pub const SESSION_COOKIE_NAME: &str = "cms_session";` in `cms_config::auth`
- Produces: `session_cookie_value` and `clear_session_cookie_value` outputting `cms_session=...`

- [ ] **Step 1: Write the failing test for `SESSION_COOKIE_NAME`**

In `crates/cms-config/src/auth.rs`, add a test in `mod tests`:
```rust
#[test]
fn test_session_cookie_name_is_cms_session() {
    assert_eq!(SESSION_COOKIE_NAME, "cms_session");
    let config = AuthConfig::default();
    let cookie_val = config.session_cookie_value("token123", 3600, false, false);
    assert!(cookie_val.starts_with("cms_session=token123;"));
    let clear_val = config.clear_session_cookie_value(false, false);
    assert!(clear_val.starts_with("cms_session=;"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p cms-config test_session_cookie_name_is_cms_session`  
Expected: FAIL (`SESSION_COOKIE_NAME` not found or assertion fails on `cms_session`)

- [ ] **Step 3: Update `crates/cms-config/src/auth.rs`**

Add the constant and update cookie builders:
```rust
pub const SESSION_COOKIE_NAME: &str = "cms_session";

impl AuthConfig {
    pub fn session_cookie_value(
        &self,
        token: &str,
        max_age_secs: i64,
        is_production: bool,
        https: bool,
    ) -> String {
        let secure_suffix = if self.is_cookie_secure(is_production, https) {
            "; Secure"
        } else {
            ""
        };
        let same_site = match self.session_cookie_same_site.to_lowercase().as_str() {
            "strict" => "Strict",
            "none" => "None",
            _ => "Lax",
        };
        format!(
            "{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; \
             SameSite={same_site}{secure_suffix}; Max-Age={max_age_secs}"
        )
    }

    pub fn clear_session_cookie_value(&self, is_production: bool, https: bool) -> String {
        let secure_suffix = if self.is_cookie_secure(is_production, https) {
            "; Secure"
        } else {
            ""
        };
        let same_site = match self.session_cookie_same_site.to_lowercase().as_str() {
            "strict" => "Strict",
            "none" => "None",
            _ => "Lax",
        };
        format!(
            "{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; \
             SameSite={same_site}{secure_suffix}"
        )
    }
}
```

- [ ] **Step 4: Update `crates/cms-api/src/auth/middleware.rs`**

Update `extract_from_cookie`:
```rust
    let session_token = Cookie::split_parse(cookie_str)
        .find_map(|c| {
            c.ok()
                .filter(|c| c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                .map(|c| c.value().to_string())
        })
        .ok_or(AppError::Unauthorized)?;
```

- [ ] **Step 5: Update `crates/cms-api/src/auth/handlers.rs`**

Replace occurrences of `"better-auth.session_token"` with `cms_config::auth::SESSION_COOKIE_NAME`:
In `logout_handler`:
```rust
    if let Some(cookie_header) = headers.get(axum::http::header::COOKIE) {
        if let Ok(cookie_str) = cookie_header.to_str() {
            if let Some(token) = AxumCookie::split_parse(cookie_str).find_map(|c| {
                c.ok()
                    .filter(|c| c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                    .map(|c| c.value().to_string())
            }) {
                AuthService::logout(&state.biz_context, &token).await?;
            }
        }
    }
```
In `refresh_session_handler`:
```rust
    let session_token = AxumCookie::split_parse(cookie_str)
        .find_map(|c| {
            c.ok()
                .filter(|c| c.name() == "refresh_token" || c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                .map(|c| c.value().to_string())
        })
        .ok_or(AppError::Unauthorized)?;
```
In `stop_impersonating_handler`:
```rust
    if let Some(cookie_header) = headers.get(axum::http::header::COOKIE) {
        if let Ok(cookie_str) = cookie_header.to_str() {
            if let Some(token) = AxumCookie::split_parse(cookie_str).find_map(|c| {
                c.ok()
                    .filter(|c| c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                    .map(|c| c.value().to_string())
            }) {
                let _ = AuthService::logout(&state.biz_context, &token).await;
            }
        }
    }
```
In `get_session_handler`:
```rust
    let session_token = headers
        .get(axum::http::header::COOKIE)
        .and_then(|h| h.to_str().ok())
        .and_then(|cookie_str| {
            AxumCookie::split_parse(cookie_str).find_map(|c| {
                c.ok()
                    .filter(|c| c.name() == cms_config::auth::SESSION_COOKIE_NAME)
                    .map(|c| c.value().to_string())
            })
        });
```

- [ ] **Step 6: Update tests and doc comments**

In `crates/cms-api/tests/common/mod.rs`:
Change `format!("better-auth.session_token={token}")` to `format!("cms_session={token}")`.

In `crates/cms-middleware/src/admin_origin.rs`:
Change `.header("cookie", "better-auth.session_token=test")` to `.header("cookie", "cms_session=test")`.

In `crates/cms-entity/src/auth.rs`:
Update comments:
```rust
/// Authenticated user representation matching CMS auth format
```
and
```rust
/// Authenticated session representation matching CMS auth format
```

In `packages/shared/src/constants.ts`:
Update comment:
```ts
/** Workspace member roles. */
```

- [ ] **Step 7: Run backend test suite**

Run: `cargo test -p cms-config; cargo test -p cms-api`  
Expected: PASS

- [ ] **Step 8: Commit Task 1**

```powershell
git add crates/ packages/shared/
git commit -m "feat(auth): cut over backend session cookie from better-auth to cms_session"
```

---

### Task 2: Scaffold and Implement Reusable `@cms/auth` Package (Service & Hooks)

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/types.ts`
- Create: `packages/auth/src/service/auth-service.ts`
- Create: `packages/auth/src/service/index.ts`
- Create: `packages/auth/src/hooks/keys.ts`
- Create: `packages/auth/src/hooks/use-session.ts`
- Create: `packages/auth/src/hooks/use-auth-mutations.ts`
- Create: `packages/auth/src/hooks/index.ts`
- Create: `packages/auth/src/index.ts`
- Test: `packages/auth/src/hooks/use-session.test.ts`

**Interfaces:**
- Produces: `authService` in `@cms/auth/service`
- Produces: `authKeys`, `useSession`, `useSignInEmailOtp`, `useSendVerificationOtp`, `useVerifyEmailOtp`, `useVerifyEmail`, `useSignOut`, `useUpdateUser`, `useAcceptInvitation`, `useStopImpersonating` in `@cms/auth/hooks`

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@cms/auth",
  "version": "0.1.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./forms": "./src/forms/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./service": "./src/service/index.ts",
    "./types": "./src/types.ts"
  },
  "scripts": {
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@cms/i18n": "workspace:*",
    "@cms/icons": "workspace:*",
    "@cms/sdk": "workspace:*",
    "@cms/ui": "workspace:*",
    "@cms/validators": "workspace:*",
    "@tanstack/react-query": "^5.104.1",
    "lucide-react": "^1.52.0",
    "zod": "^4.6.5"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@cms/tsconfig": "workspace:*",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^26.6.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "typescript": "^7.0.2",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Create `packages/auth/tsconfig.json`**

```json
{
  "extends": "@cms/tsconfig/base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "baseUrl": "."
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/auth/src/types.ts`**

```ts
import type {
  AcceptInvitationPayload,
  AuthSession,
  AuthSessionData,
  AuthUser,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '@cms/sdk';

export type {
  AcceptInvitationPayload,
  AuthSession,
  AuthSessionData,
  AuthUser,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
};
```

- [ ] **Step 4: Create `packages/auth/src/service/auth-service.ts` and `src/service/index.ts`**

```ts
import type { CmsClient } from '@cms/sdk';
import type {
  AcceptInvitationPayload,
  AuthSessionData,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '../types';

export const authService = {
  getSession: (client: CmsClient): Promise<AuthSessionData | null> =>
    client.auth.getSession(),

  signInEmailOtp: (client: CmsClient, payload: SignInEmailOtpPayload): Promise<AuthSessionData> =>
    client.auth.signInEmailOtp(payload),

  sendVerificationOtp: (client: CmsClient, payload: SendVerificationOtpPayload): Promise<{ status?: boolean }> =>
    client.auth.sendVerificationOtp(payload),

  verifyEmailOtp: (client: CmsClient, payload: VerifyEmailOtpPayload): Promise<{ success?: boolean }> =>
    client.auth.verifyEmailOtp(payload),

  verifyEmail: (client: CmsClient, token: string): Promise<{ success?: boolean }> =>
    client.auth.verifyEmail(token),

  requestEmailChange: (client: CmsClient, payload: RequestEmailChangePayload): Promise<{ success?: boolean }> =>
    client.auth.requestEmailChange(payload),

  changeEmail: (client: CmsClient, payload: ChangeEmailPayload): Promise<{ success?: boolean }> =>
    client.auth.changeEmail(payload),

  signInSocial: (client: CmsClient, payload: SignInSocialPayload): Promise<SignInSocialResponse> =>
    client.auth.signInSocial(payload),

  signOut: (client: CmsClient): Promise<{ success?: boolean }> =>
    client.auth.signOut(),

  updateUser: (client: CmsClient, payload: UpdateUserPayload): Promise<{ success?: boolean }> =>
    client.auth.updateUser(payload),

  acceptInvitation: (client: CmsClient, payload: AcceptInvitationPayload): Promise<{ success?: boolean }> =>
    client.auth.acceptInvitation(payload),

  stopImpersonating: (client: CmsClient): Promise<{ success?: boolean }> =>
    client.auth.stopImpersonating(),
};
```
In `packages/auth/src/service/index.ts`:
```ts
export * from './auth-service';
```

- [ ] **Step 5: Create `packages/auth/src/hooks/keys.ts`**

```ts
export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
};
```

- [ ] **Step 6: Create `packages/auth/src/hooks/use-session.ts`**

```ts
import type { CmsClient } from '@cms/sdk';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../service/auth-service';
import type { AuthSessionData } from '../types';
import { authKeys } from './keys';

export function useSession(client: CmsClient) {
  const query = useQuery<AuthSessionData | null>({
    queryKey: authKeys.session(),
    queryFn: () => authService.getSession(client),
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isPending: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
```

- [ ] **Step 7: Create `packages/auth/src/hooks/use-auth-mutations.ts` and `src/hooks/index.ts`**

```ts
import type { CmsClient } from '@cms/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../service/auth-service';
import type {
  AcceptInvitationPayload,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '../types';
import { authKeys } from './keys';

export function useSignInEmailOtp(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SignInEmailOtpPayload) => authService.signInEmailOtp(client, payload),
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session);
    },
  });
}

export function useSendVerificationOtp(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: SendVerificationOtpPayload) => authService.sendVerificationOtp(client, payload),
  });
}

export function useVerifyEmailOtp(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: VerifyEmailOtpPayload) => authService.verifyEmailOtp(client, payload),
  });
}

export function useVerifyEmail(client: CmsClient) {
  return useMutation({
    mutationFn: (token: string) => authService.verifyEmail(client, token),
  });
}

export function useRequestEmailChange(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: RequestEmailChangePayload) => authService.requestEmailChange(client, payload),
  });
}

export function useChangeEmail(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: ChangeEmailPayload) => authService.changeEmail(client, payload),
  });
}

export function useSignInSocial(client: CmsClient) {
  return useMutation({
    mutationFn: async (payload: SignInSocialPayload) => {
      const result = await authService.signInSocial(client, payload);
      if (result.url && typeof window !== 'undefined') {
        window.location.href = result.url;
      }
      return result;
    },
  });
}

export function useSignOut(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.signOut(client),
    onSuccess: () => {
      queryClient.setQueryData(authKeys.session(), null);
      queryClient.clear();
    },
  });
}

export function useUpdateUser(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateUserPayload) => authService.updateUser(client, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
  });
}

export function useAcceptInvitation(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: AcceptInvitationPayload) => authService.acceptInvitation(client, payload),
  });
}

export function useStopImpersonating(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.stopImpersonating(client),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
  });
}
```
In `packages/auth/src/hooks/index.ts`:
```ts
export * from './keys';
export * from './use-session';
export * from './use-auth-mutations';
```
In `packages/auth/src/index.ts`:
```ts
export * from './types';
export * from './service';
export * from './hooks';
```

- [ ] **Step 8: Write unit test for `useSession` and `authService`**

In `packages/auth/src/hooks/use-session.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { authService } from '../service/auth-service';

describe('authService', () => {
  it('calls getSession on CmsClient auth', async () => {
    const mockSession = { user: { id: 'u1', email: 'test@example.com' }, session: { id: 's1', userId: 'u1' } };
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue(mockSession),
      },
    } as any;

    const res = await authService.getSession(mockClient);
    expect(res).toEqual(mockSession);
    expect(mockClient.auth.getSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run tests and typecheck**

Run: `bun --filter @cms/auth typecheck; bun --filter @cms/auth test`  
Expected: PASS

- [ ] **Step 10: Commit Task 2**

```powershell
git add packages/auth/
git commit -m "feat(auth): scaffold @cms/auth package with authService, query keys, and mutation hooks"
```

---

### Task 3: Implement Reusable Router-Agnostic UI Auth Forms in `@cms/auth`

**Files:**
- Create: `packages/auth/src/forms/sign-in-form.tsx`
- Create: `packages/auth/src/forms/sign-up-form.tsx`
- Create: `packages/auth/src/forms/verify-email-form.tsx`
- Create: `packages/auth/src/forms/accept-invite-form.tsx`
- Create: `packages/auth/src/forms/forgot-password-form.tsx`
- Create: `packages/auth/src/forms/reset-password-form.tsx`
- Create: `packages/auth/src/forms/index.ts`
- Modify: `packages/auth/src/index.ts`
- Test: `packages/auth/src/forms/sign-in-form.test.tsx`

**Interfaces:**
- Produces: `<SignInForm />`, `<SignUpForm />`, `<VerifyEmailForm />`, `<AcceptInviteForm />`, `<ForgotPasswordForm />`, `<ResetPasswordForm />` in `@cms/auth/forms`

- [ ] **Step 1: Create `packages/auth/src/forms/sign-in-form.tsx`**

Implement router-agnostic `SignInForm`:
- Props: `client: CmsClient`, `onSuccess?: (session: AuthSessionData) => void`, `onNavigateSignUp?: () => void`, `googleEnabled?: boolean`.
- Uses `useSendVerificationOtp` and `useSignInEmailOtp`.
- Provides email input, OTP input, countdown timer, loading states, and error alerts.

- [ ] **Step 2: Create `packages/auth/src/forms/sign-up-form.tsx`**

Implement router-agnostic `SignUpForm`:
- Props: `client: CmsClient`, `onSuccess?: (session: AuthSessionData) => void`, `onNavigateSignIn?: () => void`, `googleEnabled?: boolean`.
- Name input, email input, OTP input, submit triggers.

- [ ] **Step 3: Create `packages/auth/src/forms/verify-email-form.tsx`**

Implement router-agnostic `VerifyEmailForm`:
- Props: `client: CmsClient`, `token?: string`, `email?: string`, `onSuccess?: () => void`.
- Handles automatic token confirmation or manual OTP entry with resend button.

- [ ] **Step 4: Create `packages/auth/src/forms/accept-invite-form.tsx`**

Implement router-agnostic `AcceptInviteForm`:
- Props: `client: CmsClient`, `invitationId: string`, `onSuccess?: () => void`.
- Uses `useAcceptInvitation`.

- [ ] **Step 5: Create `packages/auth/src/forms/forgot-password-form.tsx` and `reset-password-form.tsx`**

Provide password recovery and reset forms.

- [ ] **Step 6: Export from `packages/auth/src/forms/index.ts` and `src/index.ts`**

Export all form components and prop interfaces.

- [ ] **Step 7: Write unit test in `packages/auth/src/forms/sign-in-form.test.tsx`**

Verify form renders email field and handles OTP submission trigger.

- [ ] **Step 8: Run typecheck and tests**

Run: `bun --filter @cms/auth typecheck; bun --filter @cms/auth test`  
Expected: PASS

- [ ] **Step 9: Commit Task 3**

```powershell
git add packages/auth/
git commit -m "feat(auth): implement reusable router-agnostic auth forms in @cms/auth"
```

---

### Task 4: Integrate `@cms/auth` into `@cms/studio` and Delete Legacy Better-Auth Shim

**Files:**
- Modify: `apps/studio/package.json`
- Delete: `apps/studio/src/features/auth/services/auth-client.ts`
- Delete: `apps/studio/src/features/auth/services/auth-client.test.ts`
- Modify: `apps/studio/src/features/auth/index.ts`
- Modify: `apps/studio/src/routes/(auth)/route.tsx`
- Modify: `apps/studio/src/routes/app/route.tsx`
- Modify: `apps/studio/src/features/auth/SignInPage.tsx`
- Modify: `apps/studio/src/features/auth/SignUpPage.tsx`
- Modify: `apps/studio/src/features/auth/VerifyEmailPage.tsx`
- Modify: `apps/studio/src/features/auth/AcceptInvitePage.tsx`
- Modify: `apps/studio/src/features/workspace/components/SidebarAccountFooter.tsx`
- Modify: `apps/studio/src/features/workspace/components/SupportAccessBanner.tsx`
- Modify: `apps/studio/src/features/project-settings/components/account-tab.tsx`

- [ ] **Step 1: Add `@cms/auth` to `apps/studio/package.json`**

In `apps/studio/package.json` dependencies:
```json
"@cms/auth": "workspace:*",
```
Run `bun install` to link the workspace.

- [ ] **Step 2: Delete `auth-client.ts` legacy shim and its test**

Delete `apps/studio/src/features/auth/services/auth-client.ts`.
Delete `apps/studio/src/features/auth/services/auth-client.test.ts`.

- [ ] **Step 3: Update `apps/studio/src/features/auth/index.ts`**

Export modern auth modules and bridge Studio's `cmsClient`:
```ts
export { AcceptInvitePage } from './AcceptInvitePage';
export { AuthLayout } from './components/AuthLayout';
export { AuthProviders } from './components/AuthProviders';
export { ForgotPasswordPage } from './ForgotPasswordPage';
export { ResetPasswordPage } from './ResetPasswordPage';
export { SignInPage } from './SignInPage';
export { SignUpPage } from './SignUpPage';
export { VerifyEmailPage } from './VerifyEmailPage';
export { authDocumentTitle } from './utils/auth-document-title';
export { isEmailNotVerifiedError } from './utils/auth-errors';
```
And provide convenient bound hooks for Studio:
```ts
import { cmsClient } from '@/shared/services/cms-client';
import {
  useSession as useAuthSession,
  useSignOut as useAuthSignOut,
  useUpdateUser as useAuthUpdateUser,
  useSendVerificationOtp as useAuthSendOtp,
  useRequestEmailChange as useAuthRequestEmailChange,
  useChangeEmail as useAuthChangeEmail,
  useStopImpersonating as useAuthStopImpersonating,
  authService,
} from '@cms/auth';

export const useSession = () => useAuthSession(cmsClient);
export const useSignOut = () => useAuthSignOut(cmsClient);
export const useUpdateUser = () => useAuthUpdateUser(cmsClient);
export const useSendVerificationOtp = () => useAuthSendOtp(cmsClient);
export const useRequestEmailChange = () => useAuthRequestEmailChange(cmsClient);
export const useChangeEmail = () => useAuthChangeEmail(cmsClient);
export const useStopImpersonating = () => useAuthStopImpersonating(cmsClient);
export { authService };
```

- [ ] **Step 4: Update Studio routes**

In `apps/studio/src/routes/(auth)/route.tsx`:
```ts
import { authService, useSession } from '@/features/auth';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/(auth)')({
  beforeLoad: async ({ location }) => {
    if (await authService.getSession(cmsClient)) {
      const firstPublish = location.pathname.endsWith('/sign-up') && new URLSearchParams(location.searchStr).get('intent') === 'first-publish';
      throw redirect({ to: '/app', search: firstPublish ? { firstPublish: true } : {} });
    }
  },
  // ...
```
In `apps/studio/src/routes/app/route.tsx`:
```ts
import { authService, useSession } from '@/features/auth';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const routeSession = await authService.getSession(cmsClient);
    // ...
```

- [ ] **Step 5: Refactor Studio Auth Pages to use `<SignInForm />`, `<SignUpForm />`, etc.**

In `SignInPage.tsx`:
Render `<SignInForm client={cmsClient} onSuccess={...} onNavigateSignUp={...} />`.
In `SignUpPage.tsx`:
Render `<SignUpForm client={cmsClient} onSuccess={...} onNavigateSignIn={...} />`.
In `VerifyEmailPage.tsx`:
Render `<VerifyEmailForm client={cmsClient} token={token} email={email} onSuccess={...} />`.
In `AcceptInvitePage.tsx`:
Render `<AcceptInviteForm client={cmsClient} invitationId={invitationId} onSuccess={...} />`.

- [ ] **Step 6: Update Workspace & Account components**

In `SidebarAccountFooter.tsx`:
Replace `authClient.signOut()` and `authClient.useSession()` with `useSignOut()` and `useSession()`.
In `SupportAccessBanner.tsx`:
Replace `authClient.admin.stopImpersonating()` with `useStopImpersonating()`.
In `account-tab.tsx`:
Use `useUpdateUser()`, `useSendVerificationOtp()`, `useRequestEmailChange()`, `useChangeEmail()`.

- [ ] **Step 7: Run Studio test suite & typecheck**

Run: `bun --filter @cms/studio typecheck; bun --filter @cms/studio test`  
Expected: PASS

- [ ] **Step 8: Commit Task 4**

```powershell
git add apps/studio/ packages/auth/
git commit -m "feat(studio): migrate to @cms/auth package and remove legacy Better-Auth client shim"
```

---

### Task 5: Modernize E2E Tests, Bundle Budget Check, and Final Verification

**Files:**
- Modify: `apps/studio/e2e/helpers/test-auth.ts:35-50`
- Modify: `apps/studio/e2e/studio-app-ui.spec.ts:45-120`
- Modify: `apps/studio/scripts/check-bundle-budget.mjs:30-35`

- [ ] **Step 1: Update E2E test helpers**

In `apps/studio/e2e/helpers/test-auth.ts`:
Change:
```ts
const match = cookies.match(/cms_session=([^;]+)/);
```
and:
```ts
cookieHeader: `cms_session=${sessionToken}`,
```

In `apps/studio/e2e/studio-app-ui.spec.ts`:
Change:
```ts
name: 'cms_session',
```
across all test browser cookie setups.

- [ ] **Step 2: Update `check-bundle-budget.mjs`**

In `apps/studio/scripts/check-bundle-budget.mjs`:
Update `forbiddenPublicAssetPatterns`:
Remove legacy pattern reference `auth-client-` and replace with `@cms/auth` chunk pattern if applicable.

- [ ] **Step 3: Run comprehensive verification across monorepo**

Run:
1. `bun run typecheck`
2. `bun --filter @cms/auth test`
3. `bun --filter @cms/studio test`
4. `cargo test -p cms-config`
5. `cargo test -p cms-api`
6. `bun run format`

Expected: ALL PASS with 0 errors.

- [ ] **Step 4: Commit Task 5**

```powershell
git add apps/studio/
git commit -m "test(studio): update e2e cookie names to cms_session and verify bundle budget"
```
