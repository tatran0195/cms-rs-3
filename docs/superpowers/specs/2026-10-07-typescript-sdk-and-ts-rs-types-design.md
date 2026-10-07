# Design Specification: TypeScript SDK & ts-rs Type Generation

**Date**: 2026-10-07  
**Status**: Approved  
**Scope**: `@cms/sdk`, `crates/cms-entity`, `crates/cms-api`, `apps/studio`

---

## 1. Executive Summary

This specification establishes end-to-end type safety between the Rust Axum backend and TypeScript consumers across the monorepo. It introduces:
1. **Automated Rust to TypeScript generation** using `ts-rs` on all DTOs and entities in `crates/cms-entity`.
2. **A dedicated TypeScript SDK package** (`@cms/sdk`) in `packages/sdk` that exports the generated types and provides a strongly typed API client.
3. **Unified response handling** in the SDK client that validates and unwraps the backend's `ApiResponse<T>` (`{ data: T, meta?: ResponseMeta }`), throwing typed errors on failure.
4. **Integration with Studio** (`apps/studio`), replacing untyped proxy calls and ad-hoc TypeScript interfaces with verified contracts.

---

## 2. Rust Type Export Architecture (`ts-rs`)

### 2.1 Dependency Configuration
In `crates/cms-entity/Cargo.toml`:
```toml
[dependencies]
ts-rs = { version = "12", features = ["chrono-impl", "uuid-impl"] }
```

### 2.2 Entity and DTO Derivations
All request models, response DTOs, and common envelope types in `crates/cms-entity/src/` will derive `ts_rs::TS`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "packages/sdk/src/types/generated/")]
pub struct ApiResponse<T> {
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ResponseMeta>,
}
```

The exported modules cover:
- `common.rs`: `ApiResponse`, `ResponseMeta`, `SuccessResponse`, `PaginationMeta`, `AuditFields`, `SortOrder`
- `project.rs`: `Project`, `CreateProjectRequest`, `UpdateProjectRequest`, `ProjectResponse`, `ProjectListItem`
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

### 2.3 Automated Export Pipeline
An export test harness `crates/cms-entity/tests/export_ts_bindings.rs` will be created:
- Tests invoke `TS::export_all()` or specific type exports into `packages/sdk/src/types/generated/`.
- A barrel file `packages/sdk/src/types/index.ts` re-exports all generated types.
- A root script `"export:types"` will be added in `package.json`:
  ```json
  "export:types": "cargo test -p cms-entity --test export_ts_bindings"
  ```

---

## 3. TypeScript SDK Package Architecture (`@cms/sdk`)

### 3.1 Monorepo Placement & Configuration
Directory: `packages/sdk/`

`package.json`:
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

### 3.2 Client Factory & Error Handling
`packages/sdk/src/client.ts` implements `createCmsClient(config)`:

```typescript
export interface CmsClientConfig {
  baseUrl?: string;
  fetch?: typeof fetch;
  getLocale?: () => string;
  headers?: Record<string, string>;
}

export class CmsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CmsApiError';
  }
}
```

### 3.3 Resource Namespaces
The client organizes methods according to domain boundaries:
- `client.projects`:
  - `list()`
  - `get(id)`
  - `create(data)`
  - `update(id, data)`
  - `delete(id)`
  - `branches`: `list(projectId)`, `create(projectId, data)`, `delete(projectId, branchId)`
  - `languages`: `list(projectId)`, `create(projectId, data)`, `delete(projectId, code)`
  - `deployments`: `list(projectId)`, `publish(projectId, data)`, `rollback(projectId, id)`
  - `apiKeys`: `list(projectId)`, `create(projectId, data)`, `revoke(projectId, id)`
  - `members`: `list(projectId)`, `invite(projectId, data)`, `updateRole(projectId, id, role)`, `remove(projectId, id)`
  - `assets`: `list(projectId)`, `presign(projectId, data)`, `confirm(projectId, data)`
  - `theme`: `getTemplate(projectId)`, `importTemplate(projectId, data)`
  - `git`: `getStatus(projectId)`, `sync(projectId, op)`, `rotateSecret(projectId)`
  - `integrations`: `list(projectId)`, `configure(projectId, provider, data)`, `remove(projectId, provider)`
  - `readerAccess`: `get(projectId)`, `setMode(projectId, mode)`, `createAudience(projectId, data)`, `inviteReader(projectId, data)`
  - `analytics`: `get(projectId, params)`, `getUsage(projectId)`
  - `search`: `getConfig(projectId)`, `updateConfig(projectId, data)`, `reindex(projectId)`
  - `openapi`: `getConfig(projectId)`, `updateConfig(projectId, data)`
- `client.workspace`:
  - `get()`
  - `update(data)`
  - `members`: `list()`, `invite(data)`, `remove(id)`
  - `analytics(params)`
- `client.public`:
  - `getMeta()`
  - `getInvitation(id)`
  - `getSite(id)`
  - `searchSite(id, query)`

Each method returns `Promise<TData>` (unwrapped from `ApiResponse<TData>.data`), with access to the raw envelope via an options argument or method modifier.

---

## 4. Studio Integration (`apps/studio`)

1. Add `@cms/sdk: workspace:*` into `apps/studio/package.json`.
2. Initialize singleton client in `apps/studio/src/shared/services/cms-client.ts`:
   - Configures default origin (`window.location.origin` / fallback).
   - Injects `getLocale` from `@cms/i18n`.
3. Provide smooth integration into existing React Query hooks:
   - Export typed helpers or use `cmsClient` directly in feature service files (`publishing-api.ts`, `projects-api.ts`, `settings-api.ts`, `editor-api.ts`).
   - Replace manual interface declarations with canonical types imported from `@cms/sdk/types`.

---

## 5. Verification Plan

1. **Rust Compilation**: Run `cargo check --workspace` to ensure all `ts-rs` derives compile without conflicts.
2. **Type Generation**: Run `cargo test -p cms-entity --test export_ts_bindings` and verify `.ts` files are emitted into `packages/sdk/src/types/generated/`.
3. **SDK Build**: Run `bun --filter @cms/sdk build` and `bun --filter @cms/sdk typecheck`.
4. **Studio Typecheck**: Run `bun --filter @cms/studio typecheck` to confirm end-to-end integration without regressions.
