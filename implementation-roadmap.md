# Nibleaf CMS — Implementation Roadmap

> **How to use:** Paste the content of the next unchecked session into a new chat as the starting prompt. Each session is scoped to one coherent change that can be reviewed and committed independently.

**Repository:** `d:\Workspace\Software\_working\cms-rs-3`  
**Audit plan:** [`2026-10-05-nibleaf-architecture-audit-refactoring-plan.md`](file:///d:/Workspace/Software/_working/cms-rs-3/2026-10-05-nibleaf-architecture-audit-refactoring-plan.md)  
**Frontend plan:** [`docs/superpowers/plans/2026-10-05-frontend-architecture-refactor.md`](file:///d:/Workspace/Software/_working/cms-rs-3/docs/superpowers/plans/2026-10-05-frontend-architecture-refactor.md)

---

## Status Legend

- ✅ Done — committed
- 🔲 Not started
- 🚧 Partially done (details inline)

---

## Phase F — Frontend Architecture Refactor

These sessions address the audit's **P1 — Reader provider mismatch** and the frontend plan tasks. All are frontend-only and do not require Rust changes.

### Session F-1 — Dead Legacy SSR Files Purge & Alias Cleanup
**Status:** ✅ Done  
Already completed: 8 dead SSR files deleted, `shared/lib/index.ts` exports only active libs, bridge aliases cleaned from tsconfig/vite/vitest.

---

### Session F-2 — Decouple `@cms/site` Navigation via Explicit `basePath`
**Status:** ✅ Done  
`site-paths.ts` already implements `basePath` in `siteHref`. `site-origin.ts` is deleted. `apps/reader` passes `basePath=""`. Studio preview passes `basePath="/sites/${projectId}"`.

---

### Session F-3 — Replace `*Fn` Pseudo-Server-Functions with Typed Services
**Status:** ✅ Done  
All `getSiteFn`, `getSessionFn`, `getSitePageFn`, `listSiteChangelogFn`, `getGitPreviewFn` removed. `siteService` and `authClient.getSession()` are canonical. `session.ts` deleted.

---

### Session F-4 — Distribute Monolithic API Hooks to Feature Slices
**Status:** ✅ Done  
All four feature service files exist:
- `features/editor/services/editor-api.ts`
- `features/project-settings/services/settings-api.ts`
- `features/publishing/services/publishing-api.ts`
- `features/projects/services/projects-api.ts`

`mutations.ts` retains only cross-cutting hooks and re-exports from features.

---

### Session F-5 — Inject Hosted `SiteApiProvider` in Studio Preview
**Status:** ✅ Done (committed `416a12d`)  
`apps/studio/src/routes/sites/$projectId/route.tsx` wraps `SiteLayout` in `SiteApiProvider` with `siteService.search` and `siteService.answer`. `packages/site/src/context/site-api-context.tsx` is the typed provider; no default `/api/v1/search` fallback remains.

---

### Session F-6 — Remove Ask-AI / `answer` Surface
**Status:** ✅ Done (committed `dd0212c`)

**Audit ref:** P1 — "Until a real answer flow is selected, remove the Ask-AI surface rather than returning a canned result."

**Context:** The `answer` capability is wired but the backend fabricates a canned `no_answer`. The `SiteApiConfig.answer` field and any UI that calls it should be removed until a real RAG flow exists.

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 Reader provider mismatch, answer surface).

The `answer` method exists in `packages/site/src/context/site-api-context.tsx` (SiteApiConfig interface) and is wired in `apps/studio/src/routes/sites/$projectId/route.tsx` and `apps/reader/src/router.tsx`. The backend returns a canned no_answer response. Task: remove the `answer` field from SiteApiConfig, remove the answer wiring from both route files, and remove any UI component in `@cms/site` that surfaces the Ask-AI / answer feature. Run `bun --filter @cms/site typecheck && bun --filter @cms/studio typecheck && bun --filter @cms/reader typecheck` and confirm clean. Propose the commit message only — do not commit.
```

---

### Session F-7 — Remove ADR Violations: Plan/Billing/Marketing/Consent surfaces
**Status:** ✅ Done

**Audit ref:** P2 — ADR scope violation; plan/entitlement UI, consent component, marketing-event endpoint.

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P2 ADR scope violation section).

Task: Remove all plan/billing/entitlement UI and the analytics consent component from the Studio frontend. Specifically:
1. Find and remove `SiteAnalyticsConsent` import/render from `packages/site/src/views/SiteLayout.tsx`.
2. Remove `site-analytics-consent.tsx` and its types/tests from `@cms/site`.
3. Search `apps/studio/src` for any plan/billing/entitlement tabs or components and remove them.
4. Remove `marketingAnalytics` from any public metadata/type that exposes it.
5. Run typecheck across studio, site, reader. Propose commit message only.
```

---

### Session F-8 — Replace Plan-Aware Add-Ons with Typed `SiteFeatures`
**Status:** ✅ Done

**Audit ref:** P1 — add-on contract; generic plan-aware add-on system.

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 add-on contract section).

The shared add-on model in `packages/shared/src/addons.ts` retains `ALL_PLANS`, plan-aware availability and entitlement projections. The Reader still consumes feedback/edit-suggestion/issue-link settings through this model.

Task:
1. Identify what Reader behavior actually needs from add-ons (feedback placement, edit URL, issue URL).
2. Define a small typed `SiteFeatures` schema in `packages/site/src/types.ts` (or equivalent) for only those live Reader features.
3. Remove plan/availability/provisioning fields from the add-on model.
4. Update Reader components to consume `SiteFeatures` instead of the plan-aware model.
5. Remove empty-schema add-on catalog cards from Studio if they have no real behavior.
6. Run typechecks. Propose commit message only.
```

---

## Phase B — Backend Correctness (Rust)

These sessions require `cargo` to be available. Run them in order; each has an explicit exit gate.

### Session B-1 — Fix Static-File Path Traversal (P0)
**Status:** ✅ Done

**Audit ref:** P0 — static-file confinement (`crates/cms-sites/src/spa.rs`)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P0 static-file confinement).

File: `crates/cms-sites/src/spa.rs`, function `serve_spa_file`. It joins a caller-supplied wildcard path to candidate directories without rejecting parent components or verifying the canonical result stays under the asset root.

Task:
1. Refactor `serve_spa_file` to: reject paths containing `..` or absolute components before joining; canonicalize the joined path; verify the canonical result starts with the configured asset root (handle symlinks); never fall back to reading arbitrary candidates.
2. Add unit tests for: plain traversal (`../../etc/passwd`), encoded traversal (`%2e%2e/`), double-slash, and a valid path.
3. Run `cargo test -p cms-sites` and `cargo clippy -p cms-sites`. Propose commit message only.
```

---

### Session B-2 — Fix Portable Runner HTML Injection (P0)
**Status:** ✅ Done

**Audit ref:** P0 — portable Reader HTML injection (`apps/runner/src/main.rs`)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P0 portable Reader HTML injection).

File: `apps/runner/src/main.rs`, function `serve_spa`. It inserts `serde_json::to_string(&shell)` into an executable `<script>` and interpolates project name/description into title/meta without HTML escaping.

Task:
1. Replace the executable inline script with a `<script type="application/json" id="__bootstrap__">` data block using script-safe escaping (escape `</script`, U+2028, U+2029).
2. HTML-escape every metadata attribute and text node (name, description, any site config).
3. Add a regression test fixture with `</script>`, `"`, `<`, U+2028 in project name/description asserting the serialized output does not break HTML context.
4. Run `cargo test -p cms-runner`. Propose commit message only.
```

---

### Session B-3 — Harden Auth Config & Cookie Flags (P0)
**Status:** ✅ Done

**Audit ref:** P0 — production auth/config (`crates/cms-config/src/auth.rs`, `AppState::validate_config`)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P0 production auth/config section).

Files: `crates/cms-config/src/auth.rs`, `crates/cms-middleware/src/app_state.rs`, session cookie config.

Task:
1. Make `AppState::validate_config` (currently a no-op) reject startup if: JWT/session secret equals a known default or is shorter than 32 chars; DB password is `postgres` or empty; queue backend is in-memory in production mode.
2. Add `Secure` flag and an explicit `SameSite` policy to session cookies.
3. Wire `AdminOriginLayer` / `validate_admin_origin` to the routes that mutate admin state (find the existing middleware and the unattached call sites).
4. Run `cargo test -p cms-middleware -p cms-config`. Propose commit message only.
```

---

### Session B-4 — Fix Trusted Forwarded-Host Header Handling (P0)
**Status:** 🔲 Not started

**Audit ref:** P0 — host trust and headers (`crates/cms-sites/src/host_resolution.rs`)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P0 host trust section).

File: `crates/cms-sites/src/host_resolution.rs`, `get_host`. It trusts `X-Forwarded-Host` from any caller.

Task:
1. Accept `X-Forwarded-Host`/`X-Forwarded-Proto` only when the request originates from a configured set of trusted proxy IPs.
2. Remove hard-coded `.cms.com/.cms.app/.cms.dev` fallback domains; require canonical origins from config.
3. Remove `X-XSS-Protection` header from all security middleware responses.
4. Run `cargo test -p cms-sites`. Propose commit message only.
```

---

### Session B-5 — Narrow Runner Network Binding (P0)
**Status:** 🔲 Not started

**Audit ref:** P0 — portable Runner exposure (`apps/runner/src/main.rs`)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P0 portable Runner exposure).

File: `apps/runner/src/main.rs`. Binds to `0.0.0.0` by default and uses `CorsLayer::permissive()`.

Task:
1. Change the default bind address to `127.0.0.1`; expose a `--network` / `--bind` flag for explicit network exposure.
2. Replace `CorsLayer::permissive()` with a same-origin policy (no `Access-Control-Allow-Origin` for local use; or allow only if `--bind` is set to a non-loopback address and an explicit origin is provided).
3. Move synchronous rusqlite reads off Tokio executor threads using `tokio::task::spawn_blocking`.
4. Run `cargo check -p cms-runner && cargo test -p cms-runner`. Propose commit message only.
```

---

### Session B-6 — Atomic Project Creation & Remove Repair Logic (P1)
**Status:** 🔲 Not started

**Audit ref:** P1 — project initialization

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 project initialization section).

File: `crates/cms-biz/src/project.rs`, `ProjectService::create_project`.

Task:
1. Wrap project creation in one transaction: organization membership, project, default branch, default language, required settings — all or none.
2. Remove any opportunistic branch/language creation from read/page-write handlers (repair code in `project/handlers.rs`).
3. Add an integration test: create project → assert branch + language + settings exist without any extra mutations.
4. Run `cargo test -p cms-biz`. Propose commit message only.
```

---

### Session B-7 — Fix Nested Route ID Scoping (P1)
**Status:** 🔲 Not started

**Audit ref:** P1 — application/data ownership (nested handlers ignoring path identity)

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 application/data ownership section).

File: `crates/cms-api/src/project/handlers.rs`.

Audit found: add-on update ignores the URL project ID; integration update/delete/verify select the first row and ignore `provider_id`; Git conflict resolution ignores the URL project ID.

Task:
1. Fix add-on update to scope to `path.project_id`.
2. Fix integration update/delete/verify to scope by both `path.project_id` AND `provider_id`.
3. Fix Git conflict resolution to scope to `path.project_id`.
4. Add tests for each: supply a mismatched project ID and assert 404 or 403, not a silent success on the wrong resource.
5. Run `cargo test -p cms-api`. Propose commit message only.
```

---

### Session B-8 — Consolidate to PostgreSQL Job Queue (P1)
**Status:** 🔲 Not started

**Audit ref:** P1 — queue topology and reliability

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 queue topology section).

Files: `crates/cms-queue/src/{in_memory.rs,redis.rs,postgres.rs}`, `crates/cms-worker/src/{lib.rs,main.rs}`.

Task:
1. Make PostgreSQL the sole production queue; remove Redis backend and the unused `apalis` workspace dependency.
2. Fix `MemoryJobQueue::process_job` — it can mark a job complete without dispatching a handler. Keep in-memory only as a unit-test fake (do not ship it in production builds).
3. Ensure enqueue is part of the same DB transaction as the command that requires the work (transactional outbox pattern if needed).
4. Add claim/lease semantics, bounded retries, dead-letter visibility.
5. Join worker task handles on shutdown.
6. Run `cargo test -p cms-queue -p cms-worker`. Propose commit message only.
```

---

### Session B-9 — Fix Runner SQL Version/Language Scoping (P1)
**Status:** 🔲 Not started

**Audit ref:** P1 — portable version/language correctness

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 portable version/language correctness section).

File: `apps/runner/src/main.rs`, functions `query_page` and `api_search`.

Task:
1. `query_page`: add a version predicate; remove the cross-version root fallback (return 404 if page not found for the given version/language, not "first page across all versions").
2. `api_search`: apply version and language to the SQL query; return real errors instead of converting them to empty successful results; remove the constant score and use deterministic ranking.
3. Add tests: duplicate path across two versions — ensure only the correct version's page is returned.
4. Run `cargo test -p cms-runner`. Propose commit message only.
```

---

### Session B-10 — Remove Fabricated Export & Heuristic AI Surfaces (P1/P2)
**Status:** 🔲 Not started

**Audit ref:** P1 — export is not a working workflow; P2 — fake/dormant capability surfaces

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 export section and P2 fake capability surfaces).

Task:
1. Remove the project-handler export facades in `project/handlers.rs` that fabricate count/status/artifact fields.
2. Remove the heuristic AI drafting endpoint (`action_project_ai_handler`) — it labels deterministic text utilities as AI.
3. Remove the fake PGP security endpoint (serves an empty placeholder).
4. Remove ClickHouse selection until a real adapter exists.
5. For each removal: find and remove the Studio UI surface that calls it.
6. Run `cargo check --workspace && bun --filter @cms/studio typecheck`. Propose commit message only.
```

---

## Phase C — CI & Release Artifact (P1)

### Session C-1 — Fix Artifact Name Mismatch & Add Studio/Reader Build to CI
**Status:** 🔲 Not started

**Audit ref:** P1 — build/deploy contract

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P1 build/deploy contract section).

Files: `.gitlab-ci.yml`, `deploy/deploy.ps1`, `deploy/nssm-install.bat`, `Cargo.toml` binary name.

Task:
1. Align the binary name across Cargo, CI artifact, deploy script and NSSM installer — pick one canonical name.
2. Add CI steps to build Studio (`bun --filter @cms/studio build`) and Reader (`bun --filter @cms/reader build`) before packaging the Rust server.
3. Replace the missing `config/deploy.env` default reference with the real TOML mechanism.
4. Add a startup check: if `dist/frontend` is absent or empty, fail with a clear error rather than serving placeholder HTML with 200.
5. Propose commit message only.
```

---

## Phase D — Dependency Cleanup (P3)

### Session D-1 — Remove Unused Dependencies & Replace `lazy_static`
**Status:** 🔲 Not started

**Audit ref:** P3 — dependency and lint debt

**Start prompt for this session:**
```
Read d:\Workspace\Software\_working\cms-rs-3\2026-10-05-nibleaf-architecture-audit-refactoring-plan.md (P3 dependency section).

Task (do only after Phase B sessions B-8 is done, since that removes Redis/apalis):
1. Confirm `apalis` and `deadpool-redis` are removed from workspace `Cargo.toml` (done in B-8).
2. Replace `lazy_static!` usages with `std::sync::LazyLock` where it is a direct fit (stable since Rust 1.80, CI toolchain is 1.96.1).
3. Remove broad `#[allow(unused)]` / `#[allow(dead_code)]` workspace lint allowances.
4. Run `cargo clippy --workspace --all-targets -- -D warnings`. Fix any new clippy errors.
5. Propose commit message only.
```

---

## Cross-phase acceptance scenario

After all sessions above are done, run the full acceptance scenario from section 7 of the audit plan:
1. Sign in with a non-default secret, create a project atomically.
2. Edit a page, publish — durable job written, worker processes it, immutable release created.
3. Studio preview loads release through hosted `SiteApiProvider`; search does not hit Runner endpoints.
4. Public host resolves only through trusted proxy config; path traversal is blocked.
5. Portable export reads the same release, binds loopback by default.
6. Worker restart does not lose or falsely complete jobs.
7. All CI steps (Rust + Studio + Reader build, typecheck, tests, security regression tests) pass from a clean checkout.
