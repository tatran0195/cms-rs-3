# TypeScript SDK & ts-rs Type Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export strongly-typed TypeScript definitions from Rust DTOs using `ts-rs`, create an official `@cms/sdk` monorepo package with a domain-resource client that unwraps `ApiResponse<T>`, and integrate it into `apps/studio`.

**Architecture:** `ts-rs` derives on `crates/cms-entity` DTOs generate `.ts` files into `packages/sdk/src/types/generated/` via a test harness. The `@cms/sdk` package bundles these types and provides a typed HTTP client (`createCmsClient`) that unwraps `ApiResponse<T>.data` and throws structured `CmsApiError`. `apps/studio` consumes `@cms/sdk` to eliminate untyped proxy calls and ad-hoc interfaces.

**Tech Stack:** Rust (Edition 2021, Axum, Serde, `ts-rs` 12), TypeScript (7.0.2), Bun (1.3+), Vite, `tsdown`.

## Global Constraints

- Platform is internal company deployment only: ZERO billing, plan, or pricing features (ADR 001).
- Unified API response wire contract is strictly `{ "data": T, "meta"?: ResponseMeta }`.
- Follow monorepo conventions: packages live under `packages/*` with `@cms/*` scope, using `workspace:*` dependencies and `@cms/tsconfig`.
- Run commands with Bun (`bun run`, `bun --filter`), never npm/pnpm.

---

### Task 1: Add `ts-rs` and derive `TS` on Common & Core Project DTOs in `cms-entity`

**Files:**
- Modify: `crates/cms-entity/Cargo.toml`
- Modify: `crates/cms-entity/src/common.rs`
- Modify: `crates/cms-entity/src/project.rs`
- Modify: `crates/cms-entity/src/id.rs`

**Interfaces:**
- Consumes: Existing Serde structs in `cms-entity`.
- Produces: `ts_rs::TS` implementations for `ApiResponse<T>`, `ResponseMeta`, `SuccessResponse`, `Project`, `ProjectResponse`, `CreateProjectRequest`, `UpdateProjectRequest`, `EntityId`.

- [ ] **Step 1: Add `ts-rs` dependency to `crates/cms-entity/Cargo.toml`**

Add `ts-rs` with `chrono-impl` and `uuid-impl` to `crates/cms-entity/Cargo.toml`:
```toml
[dependencies]
ts-rs = { version = "12.0", features = ["chrono-impl", "uuid-impl"] }
```

- [ ] **Step 2: Add `#[derive(ts_rs::TS)]` to `crates/cms-entity/src/id.rs`**

Derive `TS` on `EntityId` with `#[ts(type = "string")]`:
```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ts_rs::TS)]
#[ts(type = "string")]
pub struct EntityId(String);
```

- [ ] **Step 3: Add `#[derive(ts_rs::TS)]` to `crates/cms-entity/src/common.rs`**

Add `ts_rs::TS` to envelope and shared types:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct ResponseMeta { ... }

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct ApiResponse<T> {
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ResponseMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct SuccessResponse { ... }

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct PaginationMeta { ... }

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct AuditFields { ... }

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub enum SortOrder { ... }
```

- [ ] **Step 4: Add `#[derive(ts_rs::TS)]` to `crates/cms-entity/src/project.rs`**

Derive `TS` on `Project`, `ProjectResponse`, `ProjectListItem`, `CreateProjectRequest`, `UpdateProjectRequest`.

- [ ] **Step 5: Verify Rust compilation**

Run: `cargo check -p cms-entity`
Expected: PASS with exit code 0.

---

### Task 2: Add `#[derive(TS)]` across All Domain DTOs and Create Export Test Harness

**Files:**
- Modify: `crates/cms-entity/src/branch.rs`
- Modify: `crates/cms-entity/src/language.rs`
- Modify: `crates/cms-entity/src/deployment.rs`
- Modify: `crates/cms-entity/src/domain.rs`
- Modify: `crates/cms-entity/src/asset.rs`
- Modify: `crates/cms-entity/src/theme.rs`
- Modify: `crates/cms-entity/src/git.rs`
- Modify: `crates/cms-entity/src/integration.rs`
- Modify: `crates/cms-entity/src/reader_access.rs`
- Modify: `crates/cms-entity/src/org.rs`
- Modify: `crates/cms-entity/src/analytics.rs`
- Modify: `crates/cms-entity/src/search.rs`
- Modify: `crates/cms-entity/src/comment.rs`
- Modify: `crates/cms-entity/src/auth.rs`
- Modify: `crates/cms-entity/src/openapi.rs`
- Modify: `crates/cms-entity/src/usage.rs`
- Create: `crates/cms-entity/tests/export_ts_bindings.rs`

**Interfaces:**
- Consumes: All request and response structs in `cms-entity`.
- Produces: Generated TypeScript declaration files in `packages/sdk/src/types/generated/`.

- [ ] **Step 1: Add `#[derive(ts_rs::TS)]` to all remaining DTOs in `cms-entity`**

Add `#[derive(ts_rs::TS)]` to:
- `branch.rs`: `BranchResponse`, `CreateBranchRequest`, `DeleteBranchResponse`
- `language.rs`: `LanguageResponse`, `CreateLanguageRequest`, `DeleteLanguageResponse`
- `deployment.rs`: `DeploymentListItem`, `RollbackDeploymentRequest`
- `domain.rs`: `CustomDomain`, `AddCustomDomainRequest`
- `asset.rs`: `AssetResponse`, `PresignAssetRequest`, `PresignAssetResponse`, `ConfirmAssetRequest`, `ConfirmAssetResponse`
- `theme.rs`: `ProjectThemeStyles`, `ProjectThemeTemplateResponse`, `ImportProjectThemeTemplateResponse`, `DeleteThemeResponse`
- `git.rs`: `ProjectGitWorkflowStatus`, `WebhookSecretRotateResponse`, `GitConflict`
- `integration.rs`: `ProjectIntegrationCatalogItem`, `ProjectIntegrationCredential`, `DeleteProjectIntegrationResponse`, `ProjectIntegrationConfirmationResponse`
- `reader_access.rs`: `ProjectReaderAccessResponse`, `ProjectAudienceItem`, `ProjectReaderInvitationResponse`, `ProjectJwtTestResponse`, `ProjectReaderEmergencyRevokeResponse`, `DeleteAudienceResponse`
- `org.rs`: `WorkspaceResponse`, `WorkspaceMembersResponse`, `WorkspaceInvitationResponse`, `MemberResponse`, `WorkspaceMutationResponse`
- `analytics.rs`: `ProjectAnalyticsResponse`, `ProjectUsageTelemetryResponse`, `WorkspaceAnalyticsResponse`
- `search.rs`: `ProjectSearchConfigResponse`, `SiteSearchHit`, `SearchAnswer`
- `comment.rs`: `ProjectCommentResponse`, `CreateCommentRequest`
- `auth.rs`: `ProjectApiKeyResponse`, `CreateProjectApiKeyRequest`
- `openapi.rs`: `ProjectOpenApiConfigurationResponse`
- `usage.rs`: `UsageEvent`

- [ ] **Step 2: Create `crates/cms-entity/tests/export_ts_bindings.rs`**

```rust
use std::fs;
use std::path::PathBuf;
use ts_rs::TS;

#[test]
fn export_ts_bindings() {
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/sdk/src/types/generated");
    fs::create_dir_all(&out_dir).expect("failed to create generated dir");

    macro_rules! export_type {
        ($t:ty) => {
            <$t>::export_all_to(&out_dir).expect(concat!("failed to export ", stringify!($t)));
        };
    }

    export_type!(cms_entity::common::ResponseMeta);
    export_type!(cms_entity::common::SuccessResponse);
    export_type!(cms_entity::common::PaginationMeta);
    export_type!(cms_entity::common::SortOrder);
    export_type!(cms_entity::project::ProjectResponse);
    export_type!(cms_entity::project::ProjectListItem);
    export_type!(cms_entity::project::CreateProjectRequest);
    export_type!(cms_entity::project::UpdateProjectRequest);
    export_type!(cms_entity::branch::BranchResponse);
    export_type!(cms_entity::branch::CreateBranchRequest);
    export_type!(cms_entity::branch::DeleteBranchResponse);
    export_type!(cms_entity::language::LanguageResponse);
    export_type!(cms_entity::language::CreateLanguageRequest);
    export_type!(cms_entity::language::DeleteLanguageResponse);
    export_type!(cms_entity::deployment::DeploymentListItem);
    export_type!(cms_entity::deployment::RollbackDeploymentRequest);
    export_type!(cms_entity::asset::AssetResponse);
    export_type!(cms_entity::asset::PresignAssetRequest);
    export_type!(cms_entity::asset::PresignAssetResponse);
    export_type!(cms_entity::asset::ConfirmAssetRequest);
    export_type!(cms_entity::asset::ConfirmAssetResponse);
    export_type!(cms_entity::theme::ProjectThemeStyles);
    export_type!(cms_entity::theme::ProjectThemeTemplateResponse);
    export_type!(cms_entity::theme::ImportProjectThemeTemplateResponse);
    export_type!(cms_entity::theme::DeleteThemeResponse);
    export_type!(cms_entity::git::ProjectGitWorkflowStatus);
    export_type!(cms_entity::git::WebhookSecretRotateResponse);
    export_type!(cms_entity::git::GitConflict);
    export_type!(cms_entity::integration::ProjectIntegrationCatalogItem);
    export_type!(cms_entity::integration::ProjectIntegrationCredential);
    export_type!(cms_entity::integration::DeleteProjectIntegrationResponse);
    export_type!(cms_entity::integration::ProjectIntegrationConfirmationResponse);
    export_type!(cms_entity::reader_access::ProjectReaderAccessResponse);
    export_type!(cms_entity::reader_access::ProjectAudienceItem);
    export_type!(cms_entity::reader_access::ProjectReaderInvitationResponse);
    export_type!(cms_entity::reader_access::ProjectJwtTestResponse);
    export_type!(cms_entity::reader_access::ProjectReaderEmergencyRevokeResponse);
    export_type!(cms_entity::reader_access::DeleteAudienceResponse);
    export_type!(cms_entity::org::WorkspaceResponse);
    export_type!(cms_entity::org::WorkspaceMembersResponse);
    export_type!(cms_entity::org::WorkspaceInvitationResponse);
    export_type!(cms_entity::org::MemberResponse);
    export_type!(cms_entity::org::WorkspaceMutationResponse);
    export_type!(cms_entity::analytics::ProjectAnalyticsResponse);
    export_type!(cms_entity::analytics::ProjectUsageTelemetryResponse);
    export_type!(cms_entity::analytics::WorkspaceAnalyticsResponse);
    export_type!(cms_entity::search::ProjectSearchConfigResponse);
    export_type!(cms_entity::comment::ProjectCommentResponse);
    export_type!(cms_entity::comment::CreateCommentRequest);
    export_type!(cms_entity::auth::ProjectApiKeyResponse);
    export_type!(cms_entity::auth::CreateProjectApiKeyRequest);
    export_type!(cms_entity::openapi::ProjectOpenApiConfigurationResponse);
}
```

- [ ] **Step 3: Run the export test and verify emitted files**

Run: `cargo test -p cms-entity --test export_ts_bindings`
Expected: PASS, and files exist in `packages/sdk/src/types/generated/`.

---

### Task 3: Scaffold `@cms/sdk` Package and Configure Build Pipeline

**Files:**
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/tsdown.config.ts`
- Create: `packages/sdk/src/types/index.ts`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: Generated files in `packages/sdk/src/types/generated/`.
- Produces: `@cms/sdk` and `@cms/sdk/types` package exports.

- [ ] **Step 1: Create `packages/sdk/package.json`**

```json
{
  "name": "@cms/sdk",
  "license": "AGPL-3.0-only",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts"
  },
  "scripts": {
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "typecheck": "tsc --noEmit",
    "build": "tsdown"
  },
  "devDependencies": {
    "@cms/tsconfig": "workspace:*",
    "@types/node": "^26.6.4",
    "tsdown": "^0.23.0",
    "typescript": "^7.0.2"
  }
}
```

- [ ] **Step 2: Create `packages/sdk/tsconfig.json`**

```json
{
  "extends": "@cms/tsconfig/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/sdk/tsdown.config.ts`**

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/types/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 4: Create `packages/sdk/src/types/index.ts`**

Re-export all generated types and provide the core `ApiResponse<T>` interface:
```typescript
export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

export * from './generated/ResponseMeta';
export * from './generated/SuccessResponse';
export * from './generated/PaginationMeta';
export * from './generated/SortOrder';
export * from './generated/ProjectResponse';
export * from './generated/ProjectListItem';
export * from './generated/CreateProjectRequest';
export * from './generated/UpdateProjectRequest';
export * from './generated/BranchResponse';
export * from './generated/CreateBranchRequest';
export * from './generated/DeleteBranchResponse';
export * from './generated/LanguageResponse';
export * from './generated/CreateLanguageRequest';
export * from './generated/DeleteLanguageResponse';
export * from './generated/DeploymentListItem';
export * from './generated/RollbackDeploymentRequest';
export * from './generated/AssetResponse';
export * from './generated/PresignAssetRequest';
export * from './generated/PresignAssetResponse';
export * from './generated/ConfirmAssetRequest';
export * from './generated/ConfirmAssetResponse';
export * from './generated/ProjectThemeStyles';
export * from './generated/ProjectThemeTemplateResponse';
export * from './generated/ImportProjectThemeTemplateResponse';
export * from './generated/DeleteThemeResponse';
export * from './generated/ProjectGitWorkflowStatus';
export * from './generated/WebhookSecretRotateResponse';
export * from './generated/GitConflict';
export * from './generated/ProjectIntegrationCatalogItem';
export * from './generated/ProjectIntegrationCredential';
export * from './generated/DeleteProjectIntegrationResponse';
export * from './generated/ProjectIntegrationConfirmationResponse';
export * from './generated/ProjectReaderAccessResponse';
export * from './generated/ProjectAudienceItem';
export * from './generated/ProjectReaderInvitationResponse';
export * from './generated/ProjectJwtTestResponse';
export * from './generated/ProjectReaderEmergencyRevokeResponse';
export * from './generated/DeleteAudienceResponse';
export * from './generated/WorkspaceResponse';
export * from './generated/WorkspaceMembersResponse';
export * from './generated/WorkspaceInvitationResponse';
export * from './generated/MemberResponse';
export * from './generated/WorkspaceMutationResponse';
export * from './generated/ProjectAnalyticsResponse';
export * from './generated/ProjectUsageTelemetryResponse';
export * from './generated/WorkspaceAnalyticsResponse';
export * from './generated/ProjectSearchConfigResponse';
export * from './generated/ProjectCommentResponse';
export * from './generated/CreateCommentRequest';
export * from './generated/ProjectApiKeyResponse';
export * from './generated/CreateProjectApiKeyRequest';
export * from './generated/ProjectOpenApiConfigurationResponse';
```

- [ ] **Step 5: Add `"export:types"` to root `package.json`**

Add script:
```json
"export:types": "cargo test -p cms-entity --test export_ts_bindings"
```

- [ ] **Step 6: Test build and typecheck of `@cms/sdk`**

Run: `bun run export:types && bun --filter @cms/sdk build && bun --filter @cms/sdk typecheck`
Expected: PASS with exit code 0.

---

### Task 4: Implement Typed HTTP Client & Domain Resources in `@cms/sdk`

**Files:**
- Create: `packages/sdk/src/errors.ts`
- Create: `packages/sdk/src/http.ts`
- Create: `packages/sdk/src/resources/projects.ts`
- Create: `packages/sdk/src/resources/workspace.ts`
- Create: `packages/sdk/src/resources/public.ts`
- Create: `packages/sdk/src/client.ts`
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/test/client.test.ts`

**Interfaces:**
- Consumes: Types from `packages/sdk/src/types/index.ts`.
- Produces: `CmsClient`, `createCmsClient()`, `CmsApiError`.

- [ ] **Step 1: Write `packages/sdk/src/errors.ts`**

Define `CmsApiError` with status, code, and details.

- [ ] **Step 2: Write `packages/sdk/src/http.ts`**

Implement `HttpClient`:
- Prepares URL with `baseUrl`, path, and query params.
- Appends standard headers (`Content-Type`, locale header).
- Sends `fetch` request.
- Checks `response.ok`:
  - If false: parses error body `{ error: { code, message, details } }` and throws `CmsApiError`.
  - If true: parses JSON and unwraps `(await response.json()).data`.
- Provides `.request<T>()` and `.requestRaw<T>()`.

- [ ] **Step 3: Implement domain resources**

- `packages/sdk/src/resources/projects.ts`: methods for projects, branches, languages, deployments, assets, themes, addons, git, integrations, reader-access, members, search, openapi, analytics, comments.
- `packages/sdk/src/resources/workspace.ts`: methods for workspace get, update, members, invitations, analytics.
- `packages/sdk/src/resources/public.ts`: methods for metadata, invitation lookup, public sites.

- [ ] **Step 4: Implement `packages/sdk/src/client.ts` and `packages/sdk/src/index.ts`**

Assemble `createCmsClient(config: CmsClientConfig): CmsClient`.

- [ ] **Step 5: Write unit test in `packages/sdk/test/client.test.ts`**

Test:
- Successful call unwrapping `{ data: { id: "1", name: "Docs" } }` -> `{ id: "1", name: "Docs" }`.
- Error response unwrapping `{ error: { code: "NOT_FOUND", message: "Project not found" } }` -> throws `CmsApiError` with status 404, code `"NOT_FOUND"`.

- [ ] **Step 6: Run tests and typecheck**

Run: `bun --filter @cms/sdk test && bun --filter @cms/sdk typecheck`
Expected: PASS.

---

### Task 5: Integrate `@cms/sdk` into `apps/studio`

**Files:**
- Modify: `apps/studio/package.json`
- Create: `apps/studio/src/shared/services/cms-client.ts`
- Modify: `apps/studio/src/shared/hooks/api/client-helpers.ts`
- Modify: `apps/studio/src/features/projects/services/projects-api.ts`
- Modify: `apps/studio/src/features/editor/services/editor-api.ts`

**Interfaces:**
- Consumes: `@cms/sdk`.
- Produces: Typed studio API calls with zero manual casting.

- [ ] **Step 1: Add `@cms/sdk` dependency to `apps/studio/package.json`**

```json
"@cms/sdk": "workspace:*"
```
Run `bun install`.

- [ ] **Step 2: Create `apps/studio/src/shared/services/cms-client.ts`**

Instantiate singleton `cmsClient`:
```typescript
import { createCmsClient } from '@cms/sdk';
import { getLocale } from '@cms/i18n';

const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4310';

export const cmsClient = createCmsClient({
  baseUrl: `${baseOrigin}/api`,
  getLocale: () => {
    try {
      return getLocale();
    } catch {
      return 'en';
    }
  },
});
```

- [ ] **Step 3: Update `client-helpers.ts` with canonical SDK types**

Re-export `CmsApiError` or map `ApiResponseError` to `CmsApiError`.

- [ ] **Step 4: Update feature API services to use SDK types**

Update `projects-api.ts` and `editor-api.ts` to use types from `@cms/sdk/types` (`ProjectResponse`, `BranchResponse`, `LanguageResponse`, `CreateProjectRequest`, etc.).

- [ ] **Step 5: Typecheck Studio**

Run: `bun --filter @cms/studio typecheck`
Expected: PASS with 0 errors.

---

### Task 6: Final Verification & Clean Check

**Files:**
- None (verification gate)

- [ ] **Step 1: Run workspace-wide Rust check**

Run: `cargo check --workspace`
Expected: PASS.

- [ ] **Step 2: Run workspace-wide TypeScript check**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Run package builds**

Run: `bun run build:packages`
Expected: PASS.
