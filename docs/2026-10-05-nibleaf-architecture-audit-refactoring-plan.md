# Nibleaf Rust + SPA Architecture Audit and Refactoring Plan

**Status:** proposed architecture transformation plan  
**Audit date:** 2026-10-05  
**Audited revision:** `eb28ff39897e9d143227d58f9e0a1dfee14c4b8a` (`main`)  
**Scope:** Rust workspace, Studio SPA, shared/site packages, portable Reader, migrations, CI and deployment wiring.

> This is a static repository audit, not a claim that the system passed runtime validation. No source was changed during the audit; no build or test ran because `cargo` and `bun` were unavailable on the audit host. The recommendations below include the validation work needed before removing or changing persisted features. The working tree was clean before this plan was written.

## 1. Executive assessment

Nibleaf has a sensible **single-product monolith** underneath the accumulated code: an Axum API, PostgreSQL migrations and queries, a modular Rust workspace, a React Studio, a reusable Reader, and a real immutable `DeploymentSnapshot`/page-index path for published sites. Those are useful foundations. The main problem is not that the system needs more services or abstractions; it is that it has too many *parallel or unfinished representations* of those foundations.

The highest-risk gaps are concrete, not stylistic:

1. A public wildcard route passes a request path into filesystem joins without proving the resolved file stays under the SPA root. The portable Runner interpolates project-controlled data into raw HTML and an executable inline script without context-safe escaping.
2. Production configuration can silently use development auth secrets. The declared admin-origin guard is not wired to routes, session cookies lack `Secure`, and forwarded host headers are accepted without a trusted-proxy check.
3. A clean release is not defined end to end. CI builds Rust but not Studio/Reader assets, the binary name differs between Cargo/CI/deploy/NSSM, the installer points at a missing `deploy.env`, and the deployment profile contains a default database password and in-memory queue.
4. Several user-visible contracts are structurally incompatible: a recursive frontend API proxy erases response types; management routes are mounted twice; Reader search is not given the hosted provider; add-on and integration endpoints return shapes their UIs do not consume.
5. Background features report more than they do. Export requests do not reach the worker, schedules have no due-job dispatcher, Git/integration adapters fabricate status or success, and the in-memory queue can complete jobs without running the real handler.
6. The accepted internal-platform ADR says billing, marketing and consent surfaces are removed, but plan/entitlement gates, marketing events and a rendered analytics-consent component remain active.

**Recommended direction:** establish one secure, typed, shippable monolith; put business invariants and transactions in application use cases; use one durable PostgreSQL job path and one worker topology; treat publishing as creation of an immutable release; serve hosted and portable Reader experiences from one typed content contract; and remove incomplete or out-of-scope surfaces instead of disguising them with adapters.

Do **not** start with a large rename or generic repository framework. The code needs fewer competing paths and clearer ownership, not more architecture for its own sake.

## 2. Governing decisions

These decisions resolve conflicts in earlier plans and should guide every phase:

- **No compatibility scaffolding for old internals.** Migrate the in-repository callers and delete `/api/app` aliases, uppercase enum aliases, fabricated DTO projections, recursive `any` proxies and legacy handlers. Preserve actual user content with explicit one-way data migrations and backups; that is data stewardship, not a reason to keep obsolete runtime contracts.
- **Correctness, then simplicity.** Prefer one working path over a broad catalog of pretend capabilities. Reject unknown providers, formats and versions rather than silently mapping them to a default.
- **Keep the monolith.** Keep one API deployable and one worker deployable. Do not introduce microservices, a new message broker, a generic plugin framework or a second ORM to solve code-ownership problems.
- **Make the transport thin.** Axum handlers parse/authenticate/validate requests, call named use cases, and map typed outcomes to HTTP. They should not assemble domain rules from raw JSON or issue persistence queries directly.
- **Make the published release the read boundary.** Retain and strengthen the existing immutable `DeploymentSnapshot` path. A hosted page, a portable Reader bundle and a downloadable export must all identify the exact release/content version they represent.
- **Define Reader I/O once.** A typed `SiteReaderProvider` supplies bootstrap, page, search and any deliberately supported answer/analytics operations. Hosted Studio preview and the portable Runner are adapters to that contract, not separate contracts embedded in UI components.
- **Treat ADR 001 as binding.** Remove plan/billing/marketing/consent features. Keep operational usage diagnostics and internal analytics only where they have a real operational consumer.
- **An unfinished capability is not a placeholder.** Either implement a deliberately scoped end-to-end feature with true persisted status and tests, or remove its UI, route, schema and dependencies.

## 3. Current system map and architecture critique

| Boundary | Current shape | Assessment |
|---|---|---|
| Rust workspace | `cms-api` → `cms-biz` → `cms-db`, plus entity, auth, queue, sites, search, storage, mailer and worker crates | Good monolith boundary in principle. The API crate's own docs call handlers thin, but `project/handlers.rs` is 4,102 lines and mixes project, Git, export, integration, theme and heuristic-AI behavior. `cms-entity` also carries HTTP/OpenAPI and SQLx concerns, so “entity” is not a clean domain boundary. |
| Studio | React SPA, shared packages and a hand-authored recursive API proxy | Useful single editor surface, but route/type safety is largely illusory: the proxy derives its output from `JSON.parse`, while backend and UI contracts already disagree. |
| Site experience | `packages/site`, hosted preview routes in Studio, Rust-rendered hosted public sites, and `apps/reader` in the portable Runner | Several render/data paths coexist. Hosted preview calls the public-site service for page loaders but the shared Reader search defaults to the Runner endpoint. The portable Reader has its own SQLite queries and does not consistently scope by version/language. |
| Publish | Existing `DeploymentSnapshot` and `DeploymentSnapshotPageIndex` are used by hosted public reads | Keep this as the immutable release foundation. Do not add a second mutable “export snapshot” model for the same content identity. |
| Jobs | PostgreSQL, Redis and in-memory implementations; API starts consumers; `cms-worker` also has an executable | Too many topologies. Production deploy config selects volatile memory; Redis ack/nack semantics are inconsistent; worker tasks are not joined at shutdown. |
| Exports/integrations | Typed services coexist with project-handler facades that return fabricated or incomplete values | Merge to a truthful implementation or remove. The façade currently makes incomplete behavior look complete. |
| Release operations | Rust-only CI build, runtime SPA file lookup and compile-time Reader embedding | No reproducible artifact contract; build and deploy naming/config drift makes a clean release unreliable. |

### Target structure (conceptual; do not mass-rename first)

```text
apps/
  api/       Axum composition root and HTTP server; no background consumption
  worker/    one job-consumer executable (can initially be the existing cms-worker binary)
  studio/    internal React SPA
  reader/    shared Reader UI
  runner/    read-only portable bundle server

crates/
  cms-api          HTTP routes, request/response DTO mapping, middleware
  cms-biz          named application use cases and transaction boundaries
  cms-db           PostgreSQL/SQLite persistence adapters and query ownership
  cms-entity       split gradually into domain values and explicit wire DTOs
  cms-sites        published-host lookup/serving, not marketing or static dev fallbacks
  cms-queue        one durable PostgreSQL job implementation
  cms-worker       job handlers and worker composition
  cms-search       indexing/search; optional model calls only when intentionally enabled
  cms-storage      asset adapter
  cms-mailer       real outbound delivery and test doubles

packages/
  api-client       generated from the Rust OpenAPI contract
  site-contract    typed SiteReaderProvider and release DTOs
  site             Reader components using only the provider contract
```

`cms-biz` may be renamed to `cms-application` after behavior and dependency direction are clear. Do not create generic ports/repositories for every query; introduce interfaces only at actual boundaries (storage, queue, mail, search, hosted/portable Reader) or where a workflow needs an atomic transaction.

## 4. Critical findings and decision ledger

Priority meanings: **P0** block an exposed production release until addressed; **P1** foundational correctness; **P2** simplify/remove incomplete product surface; **P3** maintenance and optimization after behavior is covered.

| Priority / area | Repository evidence and consequence | Decision |
|---|---|---|
| **P0 — static-file confinement** | `crates/cms-sites/src/spa.rs::serve_spa_file` replaces backslashes and joins the caller-supplied wildcard path to candidate directories, but does not reject parent components or verify the canonical result remains beneath the selected root. `wildcard_handler` reaches this path for unresolved hosts. A traversal may expose files outside `dist/frontend`. | **Fix immediately.** Resolve against one configured asset root, reject traversal/absolute paths, canonicalize and verify containment (including symlinks), and never fall back to reading arbitrary candidates. Add encoded, slash, backslash, dot-segment and symlink tests. |
| **P0 — portable Reader HTML injection** | `apps/runner/src/main.rs::serve_spa` inserts `serde_json::to_string(&shell)` into an executable `<script>` and interpolates project name/description into title/meta markup. JSON string serialization alone does not make data safe for an HTML script element; a stored `</script>` or quote can break the context. | **Fix immediately.** Prefer a non-executable JSON data block with script-safe escaping (`<`, U+2028/U+2029) and parse it as data; HTML-escape every metadata attribute/text value. Add an XSS regression fixture for name, description and nested config. Ship CSP as defense in depth, not as a substitute for escaping. |
| **P0 — production auth/config** | `cms-config/src/auth.rs` defaults to literal development session/JWT secrets. `AppState::validate_config` is a no-op. Credentialed CORS is configured, but `AdminOriginLayer`/`validate_admin_origin` have no route call sites. Session cookies omit `Secure`. `deploy.toml` has `postgres:postgres`. | **Redesign startup validation.** In production, missing/known-default secrets, insecure DB credentials, invalid origins, disabled TLS/proxy assumptions or a non-durable queue must prevent startup. Rotate credentials. Apply Origin/CSRF checks to cookie-authenticated mutations while preserving bearer/API-key clients; add `Secure` and an intentional SameSite policy. Secrets come from the deployment secret store, never the committed sample. |
| **P0 — host trust and headers** | `cms-sites/src/host_resolution.rs::get_host` trusts `X-Forwarded-Host` from every caller. Published-site CSP permits `unsafe-inline`, `unsafe-eval` and broad `https:` sources; both API and site security layers emit `X-XSS-Protection`. | **Redesign at the edge.** Accept forwarded host/proto only from configured proxy peers, validate host syntax, and remove hard-coded `.cms.com/.cms.app/.cms.dev` fallback domains in favor of configured canonical origins. Remove obsolete XSS-filter settings and build a tested per-surface CSP; keep output encoding/sanitization authoritative. |
| **P0 — portable Runner exposure** | `apps/runner` binds to `0.0.0.0` by default and installs `CorsLayer::permissive()` despite serving a local, read-only export. | **Narrow by default.** Bind to loopback unless the operator explicitly opts into network exposure; remove permissive CORS for same-origin use. If remote sharing is a supported scenario, require an explicit flag and scoped origin policy. Move synchronous rusqlite work off Tokio executor threads. |
| **P1 — build/deploy contract** | `.gitlab-ci.yml` builds only Rust and artifacts `cms_server.exe`; Cargo's binary is `cms-server.exe`; `deploy.ps1` expects `cms_server.exe`; `nssm-install.bat` expects `cms-server.exe`. The installer defaults to missing `config/deploy.env`, while the checked-in profile is `config/deploy.toml`; `FRONTEND_DIR` is unused. CI does not build Studio/Reader. `cms-sites` reads `dist/frontend` at runtime and serves placeholder HTML with 200 when missing; Runner embeds `dist/reader`. | **Replace with one release bundle.** Pin the artifact name once; build Studio and Reader before the Rust Runner; package the Studio assets with the server binary and portable Runner. Validate the config file and all assets at startup. A production build must fail rather than ship a placeholder 200 page. Install API and worker services deliberately. |
| **P1 — duplicate HTTP contract** | `cms-api/src/lib.rs::create_api_router` mounts domain routers directly and again under `/app`. Studio uses `/api/app/...`; tests codify that path. `apps/studio/src/shared/services/api.ts` is a recursive proxy whose response type comes from `JSON.parse`, effectively `any`. There are legacy project export/theme routes beside typed export routes. | **Replace with one contract.** Make the direct `/api/projects`, `/api/pages`, etc. surface canonical, migrate Studio, tests, asset URLs and docs in the same change, then delete `/api/app` and legacy route aliases. Generate the TypeScript client from the Rust OpenAPI description and fail CI on generated-client drift. Do not retain a dynamic compatibility proxy. |
| **P1 — application/data ownership** | `project/handlers.rs` is 4,102 lines; HTTP modules contain ad-hoc JSON and persistence orchestration. Nested handlers sometimes ignore path identity: add-on update ignores the URL project ID; integration update/delete/verify select the first row and ignore `provider_id`; Git conflict resolution ignores the URL project ID. | **Refactor around use cases and scoped IDs.** Move invariants, authorization and multi-row operations into `cms-biz`; make every nested command prove `resource.project_id == path.project_id` inside the use case. Split handler files by bounded context after the typed contract exists. Keep simple SQL reads simple; do not wrap every query in a generic repository. |
| **P1 — project initialization** | `ProjectService::create_project` creates a project/settings but does not create branch/language/add-on defaults; organization, membership, project and settings are not one transaction. Page handlers repair missing `main`/language state opportunistically and suppress some errors. | **Make creation atomic.** Create required organization membership, project, default branch, default language and required settings in one transaction; remove repair/mutation from reads and ordinary page writes. Replace “best effort” defaults with explicit validation/errors. Do not provision plan-gated add-ons. |
| **P1 — Reader provider mismatch** | `packages/site/src/context/site-api-context.tsx` defaults search to `/api/v1/search` (the portable Runner route). Hosted Studio calls `siteService` at `/api/public/sites/:id/search`, but `apps/studio/src/routes/sites/$projectId/route.tsx` never wraps `SiteLayout` in `SiteApiProvider`. Shared search therefore has no hosted project binding. `answer` has no default; the UI can report a canned `no_answer` even though a separate hosted `siteService.answer` exists. | **Unify the Reader contract.** Add typed bootstrap/page/search operations plus explicitly supported optional capabilities to `SiteReaderProvider`. Inject a hosted provider in Studio preview and a Runner provider in offline mode. Until a real answer flow is selected, remove the Ask-AI surface rather than returning a canned result. |
| **P1 — portable version/language correctness** | Runner `query_page` looks up by path without a version predicate and its root fallback selects the first page across all versions. `api_search` does not apply the requested version/language and returns a constant score; errors can become empty successful results. Missing language content silently falls back to any language. | **Make every query release-scoped.** Require a bundle schema/release ID, version and language; include these in SQL predicates and indexes. Make missing pages/content explicit, remove arbitrary cross-version/language fallbacks, return honest search errors and deterministic ranking. Test duplicate paths across versions and languages. |
| **P1 — queue topology and reliability** | `config/deploy.toml` selects in-memory jobs. `MemoryJobQueue::process_job` can mark a job complete without dispatching a handler; consumers serialize on one locked receiver. Redis `ack`/`nack` operate on an ID while `consume` expects a serialized envelope; retry counts are read/stored at different levels; Redis repeatable/list operations are incomplete. API and `cms-worker/src/main.rs` can both consume; consumer JoinHandles are dropped and shutdown is not joined. | **Use PostgreSQL as the one production queue.** API writes durable work; a dedicated worker consumes it. Make insertion atomic with the business transaction using the existing job table as a transactional outbox/queue record, or add a minimal outbox if the current schema cannot support that. Add bounded retries, leases/claims, idempotency, dead-letter visibility and cancellation. Remove Redis production support and the no-op in-memory consumer; keep an in-memory fake only for unit tests. Join worker tasks on shutdown. |
| **P1 — export is not a working workflow** | UI links call project-handler `/export` and `/theme-repository` surfaces; there are also typed export routes. Project export handlers fabricate counts/status/artifact fields, default unknown formats to Markdown, unwrap an empty format list, and do not enqueue `JobType::Export`. The worker supports Export but no normal enqueue or due-schedule dispatcher was found. `ExportFormat::Sqlite` encodes `SQLITE`, but migration `20260101000000_init.sql` only defines `HTML/PDF/MARKDOWN/EPUB`; uppercase aliases duplicate enum variants. Schedules can create Markdown snapshots without enqueueing the target format; cancel reports `CANCELLED` but writes `Failed`; missing artifact URLs become empty strings. | **Choose one honest feature.** First implement manual export of an immutable published release with typed request/status/artifact DTOs, real durable enqueue, actual output bytes, truthful failure/cancel state and complete asset reads. Reject invalid/empty formats. Remove the project-handler facades and make the UI use the typed service. Defer/remove schedules until a due-schedule claimant exists. If manual export has no active internal use, remove its UI, routes, worker cases, tables and dependencies instead. Do not carry fake fields or uppercase aliases. |
| **P1 — export/release identity** | `ExportSnapshot` stores project/branch/language identity rather than immutable page/assets, while hosted publishing already has immutable `DeploymentSnapshot`/page-index data. The export worker can consequently read content that changes after the “snapshot.” SQLite export suppresses some branch/language/asset errors and may emit empty asset blobs. | **Merge snapshot concepts.** Exports take a `release_id` and read exactly the same immutable release as hosted/portable Readers. Fail the job if any required asset/content cannot be included. If draft export is a real need, create an explicit immutable draft revision—not a mutable “snapshot” label. |
| **P1 — add-on contract** | Backend returns raw `ProjectAddonResponse` (`addon_type`, `is_enabled`, UUID row ID); frontend expects a catalog object keyed by semantic `AddonId`, with `availability` and `revision`. No production caller of `defaultProjectAddonProvisioning` was found, and project creation does not seed rows. Reader still consumes feedback/edit-suggestion/issue-link settings. The shared add-on model retains `ALL_PLANS` and entitlement compatibility projections. | **Remove the generic plan-aware add-on system.** Replace only genuinely used Reader behavior with a small typed `SiteFeatures`/project-config schema (e.g. feedback placement, edit URL, issue URL); delete empty-schema cards, generic row CRUD, provisioning projections and plan availability logic. If no feature is operationally used, remove the whole surface. Make Reader defaults explicit and testable. |
| **P1 — integration catalog is not its backend** | `IntegrationsTab` consumes `IntegrationCatalogEntry[]` and indexes entries by provider ID. Project handlers return stored rows through `integration_to_si` with a UUID `id`, hard-coded category/health/revision, no `availability` or nested `connection`; the UI does not merge in the static catalog. Create defaults unknown providers to webhook; update/delete/verify ignore the provider ID and target the first row; confirmation returns literal `"confirmed"`; verification always succeeds. The catalog lists instance-managed systems (analytics, storage, email, AI, ClickHouse) alongside project-configurable webhooks. | **Reduce to real integrations.** Move instance-level adapters to deployment/operations configuration, not a project catalog. Keep only project integrations with actual delivery behavior and active internal use (initially Slack/Discord/Zapier webhooks if confirmed); implement provider-scoped typed CRUD, secret-safe DTOs, real verification and queued delivery. Reject unknown providers. Otherwise delete the tab, handlers, DTOs and schema. |
| **P1 — Git surface is partly simulated** | Git status suppresses errors and fabricates credentials/webhook/preview values; the “webhook secret” path can synthesize `whsec_{connection_id}`; tokens are stored plaintext; `trigger_sync` does not enqueue a Git job; unsupported providers return `Ok(None)`; project conflict path is ignored. | **Keep only real Git workflows.** Retain GitHub (and GitLab only if actively used) behind encrypted credentials, validated repo/branch/path inputs, scoped typed status and durable queued sync. Make worker outcomes observable and idempotent. Generate/rotate real webhook secrets. Remove unsupported provider choices and fake status/secret routes; if Git sync is unused, remove the entire feature and its tables. |
| **P2 — duplicate Markdown rendering** | Published Rust sites, exports and the React Reader use separate Markdown pipelines (`cms-sites/src/markdown_renderer.rs`, `cms-biz/src/export.rs`, `packages/site`); Studio has parity tooling but output still depends on the consumer. Sanitization, heading IDs and code rendering can diverge. | **Create one authoritative publish renderer.** Render/sanitize once into immutable `PublishedPage` HTML plus headings/metadata during release creation. Hosted public serving, preview and portable export consume that representation. Keep source Markdown for editing. Remove duplicate export/Reader rendering when the acceptance corpus passes; do not weaken sanitization to get parity. |
| **P2 — ADR scope violation** | `cms-biz/src/project.rs` and export paths call entitlement checks; shared add-ons retain plan/availability machinery; public metadata returns `marketingAnalytics: null`; `/marketing-events` suppresses analytics failures and returns success; `SiteLayout` renders `SiteAnalyticsConsent` despite ADR 001. Marketing/TechnoStar and `cms.com`/`cms.app` references remain. | **Complete the accepted scope decision.** Remove billing/plan/entitlement UI, API, feature gates and schema; remove consent scripts/types/tests and marketing-event endpoint/metadata. Keep operational usage diagnostics and first-party operational analytics only when consumed. Centralize canonical Nibleaf origins/mail identity and delete stale brands, links and aliases. |
| **P2 — fake/dormant capability surfaces** | `action_project_ai_handler` labels deterministic outline/first-paragraph summary/rephrase/canned continuation as AI; ClickHouse adapter always errors; the PGP security endpoint serves an empty placeholder; marketing events return success after swallowed persistence errors. | **Remove or deliberately implement.** Delete the heuristic AI endpoint unless renamed as a non-AI text utility; do not add a compatibility shim. Keep real `cms-search` model-backed RAG only if its user-facing contract is explicit and configured. Remove ClickHouse selection until a real adapter exists, remove the fake PGP endpoint or serve a genuine key, and never convert persistence failure into success. |
| **P2 — analytics ownership** | Analytics event types/query paths are duplicated between entity/DB modules and adapters; ClickHouse is a stub. | **Consolidate.** Keep one internal event schema and one PostgreSQL-backed operational/first-party analytics path. Remove unused adapters and duplicated types. Retain usage metering needed for operational diagnostics; remove billing-shaped plans/entitlements, not all usage tables. Establish retention and privacy rules for IP/user-agent fields. |
| **P3 — dependency and lint debt** | Root workspace declares unused `apalis`; Redis path brings optional `deadpool-redis`; `lazy_static` is used despite Rust 1.96.1; workspace allows broad `unused`/`dead_code`; PDF/EPUB/SQLite pins lag current release lines. | **Prune after behavior tests.** Remove `apalis` and Redis dependencies with their backends if PostgreSQL is the only queue. Replace `lazy_static` with `std::sync::LazyLock` where it is a direct fit. Remove broad lint allowances after dead paths are deleted. Upgrade PDF/EPUB/SQLite dependencies only behind fixture/build regression tests; do not upgrade SQLx for optics (the workspace already uses 0.9). |

### Dependency notes (validated against registry/upstream pages on the audit date)

- Workspace constraints are `epub-builder = "0.7"` and `printpdf = "0.7"`; upstream registry results show the 0.8.3 and 0.12.5 lines respectively. The PDF jump is large; first create deterministic fixture tests, then upgrade one crate at a time. [`epub-builder` versions](https://crates.io/crates/epub-builder/versions) · [`printpdf` releases](https://crates.io/crates/printpdf).
- Workspace uses `rusqlite = 0.33.0`; upstream's release page shows 0.40.2. Upgrade only after portable-bundle query and platform-build tests exist. [rusqlite releases](https://github.com/rusqlite/rusqlite/releases).
- `std::sync::LazyLock` has been stable since Rust 1.80, below the repository's CI toolchain 1.96.1; this is a simplification opportunity, not a claim that `lazy_static` is formally deprecated. [Rust `LazyLock` documentation](https://doc.rust-lang.org/std/sync/struct.LazyLock.html).
- Remove `X-XSS-Protection`; it is a legacy browser-filter header, not a mitigation for unsafe rendering. Use output encoding and a tested CSP. [Header background](https://howhttpworks.com/headers/x-xss-protection).

## 5. Target data flow

```text
Studio browser
  └─ generated, typed client ──> canonical /api/* routes
                                  └─ authn/authz + request validation
                                      └─ cms-biz use case / DB transaction
                                          ├─ PostgreSQL content and release state
                                          ├─ transactional durable job row
                                          └─ asset references in storage

Dedicated worker
  └─ claims job with lease/idempotency
      ├─ publish: validate -> render -> immutable DeploymentSnapshot -> activate release
      ├─ search: index the exact release
      ├─ export: render artifacts from the exact release
      ├─ email / webhook / Git: perform external I/O, persist real outcome
      └─ ack, retry, cancel or dead-letter with truthful state

Hosted public site                         Portable Reader
  └─ trusted host -> active release         └─ versioned release bundle -> read-only SQLite
      └─ immutable page/asset/search data        └─ Runner adapter
           └─ SiteReaderProvider <──────────────┘
                 └─ shared Reader UI
```

The API should not consume jobs in production. `cms-worker` is the single production worker executable; the API process only accepts commands and writes durable job records. Local development may use one script to start both processes, but it must use the same durable semantics as production.

A published release must pin **content, configuration, rendered HTML/heading metadata, language/version identity and asset references**. Hosted host resolution selects a release pointer; it must not silently fall back to a mutable branch. The portable bundle carries a required `schema_version` and release ID. If the bundle format changes, regenerate the bundle from the source release; do not keep an old-format parser just to preserve an internal implementation.

## 6. Sequenced transformation

Each phase is an architectural increment with an exit gate. Later cleanup depends on earlier contracts; do not delete database structures before their replacement path is deployed and verified.

### Phase 0 — Establish a reproducible baseline and close immediate security defects

**Why first:** Security fixes are independent of the larger redesign. The audit could not compile/test the current snapshot, so the first engineering action must establish a reliable validation environment rather than assume static findings are exhaustive.

**Work:** Install/pin the Rust and Bun toolchains in CI; record clean-build commands; make `cargo fmt`, `cargo clippy --workspace --all-targets --all-features`, `cargo test --workspace --all-features`, Bun typecheck/tests/build reproducible. Add tests for SPA traversal, Runner HTML injection, trusted forwarded-host handling, auth-secret validation and cookie flags. Fix these issues before further exposure. Add a minimal route/data contract test around create-project → create page → publish → public read.

**Risks:** Existing tests may encode broken behavior (for example `/api/app`) and expose additional defects. Do not weaken the tests to preserve current output; update them to the selected contract in the relevant phase.

**Exit criteria:** Security regression tests fail on the audited code and pass on the fix; a clean checkout can run the Rust and frontend validation commands; the audit baseline and test fixture corpus are committed.

### Phase 1 — Make production composition and release artifacts real

**Why before API surgery:** No architecture refactor matters if clean CI cannot produce what deploy expects.

**Work:** Define one release manifest naming the server, worker, Studio assets, portable Runner and configuration inputs. Correct the Cargo/CI/deploy/NSSM binary-name mismatch; build Studio assets before server packaging and Reader assets before compiling the embedded Runner. Stage `dist/frontend` next to the server (or deliberately embed it—choose one, not an ambiguous mixture) and include the required worker executable. Replace the missing `deploy.env` default with the real TOML/config mechanism. Remove committed default credentials, require externally injected secrets, choose PostgreSQL for production jobs, and add explicit startup/readiness validation for DB, migrations, storage and frontend artifacts. A missing asset bundle must fail readiness/startup, not return a CMS placeholder with status 200.

**Expected outcome:** One deployable, versioned artifact set is reproducible from a clean clone; operators can identify exactly which config and files a process uses.

**Risks:** `rust-embed` makes build ordering significant; Windows service startup and asset paths differ from developer paths. Exercise the actual Windows service installer and a clean deployment directory in CI, not only `cargo build`.

**Exit criteria:** CI emits the exact names and directory layout consumed by deployment; install/upgrade/rollback tests use a clean directory; production startup fails on missing secrets, DB credentials, queue choice or SPA assets; no committed password is usable.

### Phase 2 — Establish one typed HTTP contract and remove the dynamic proxy

**Why now:** Subsequent business refactors need one caller contract. The current proxy hides rather than protects API changes.

**Work:** Generate OpenAPI from the actual Rust routes/DTOs and generate a TypeScript client in CI. Select the direct domain route mount as canonical (`/api/projects`, `/api/pages`, etc.; public Reader endpoints remain under `/api/public`). Migrate Studio hooks, asset URLs, frontend tests, API tests and documentation together. Remove the duplicate `/api/app` mount and the “alias for compatibility” `api_router` wrapper once composition is made explicit. Use explicit request/response types and strict JSON validation. Keep the public-host API and management API distinct by authorization, not by ad-hoc JSON.

Add the typed `SiteReaderProvider` contract now, but implement hosted/portable behavior in Phase 5. `@cms/site` components must depend on that interface rather than know `/api/v1/search`.

**Expected outcome:** TypeScript catches backend shape changes; a route has one owner and one documented path; hosted and offline Reader adapters become replaceable without modifying components.

**Risks:** There are many `/api/app` call sites and product-flow tests; a temporary alias would hide migration omissions and is explicitly not the approach. Land caller migration and alias removal as one coordinated change.

**Exit criteria:** No Studio caller, generated URL, asset URL or maintained test uses `/api/app`; the server has one management route mount; OpenAPI/client drift fails CI; no recursive JSON-derived `any` client remains; generated DTO tests cover project, integration, export and Reader contracts.

### Phase 3 — Put invariants, authorization scope and initialization in use cases

**Why before async work:** Queued jobs must be created from valid, authorized and atomic commands. Repairing state in read handlers currently makes every later workflow ambiguous.

**Work:** Split `project/handlers.rs` by bounded context and move its direct persistence orchestration into named `cms-biz` commands. Preserve a pragmatic modular monolith: transaction-capable query functions are sufficient; do not introduce a generic repository per table. Require every nested route ID to match the loaded resource's project/organization. Make project creation one transaction that creates/attaches the organization membership, project, default branch, default language and required settings. Remove opportunistic branch/language creation and swallowed database errors from normal reads/writes. Remove plan-entitlement checks as part of ADR compliance, not as a replacement entitlement system.

**Expected outcome:** The same use case can be called from HTTP, worker and tests; a successful response means the requested invariant was committed, not repaired later.

**Risks:** Project bootstrap changes can expose pre-existing partial projects. Add a one-time diagnostic/migration that reports and repairs valid missing defaults before making the runtime strict; do not leave auto-repair code in the normal request path.

**Exit criteria:** Project creation is atomic and idempotently tested; reads do not create branches/languages; path-scoped resource tests reject mismatched IDs; all permission checks precede side effects; transaction rollback leaves no orphan organization/project/default rows.

### Phase 4 — Consolidate queue and worker lifecycle

**Why before publish/export:** Publishing, indexing, email and exports depend on reliable job delivery. Fixing individual producers against three inconsistent backends would multiply work.

**Work:** Adopt the existing PostgreSQL job table as the sole production queue. Make enqueue part of the same PostgreSQL transaction as the command that requires the work; if the existing queue API cannot accept a transaction, add the smallest transactional outbox representation and a relay. The API stops consuming. The worker claims rows with a lease/claim protocol, records attempts, applies bounded backoff, makes handlers idempotent, and exposes retry/dead-letter outcomes. Keep in-memory queues only as test fakes; remove Redis and the unused `apalis` declaration rather than shipping a second unsupported backend. Retain task handles and join/cancel them during shutdown. Remove the second “start consumers inside queue” trait path that can mark jobs complete without invoking `cms-worker::process_job`.

**Expected outcome:** An accepted command cannot be lost between DB commit and enqueue; worker restart does not silently drop jobs; deployment topology is explicit.

**Risks:** Existing job payloads and status tables may have no durable records in the current in-memory deployment. Inventory any live pending jobs before schema migration; old volatile jobs cannot be reconstructed, so document that rather than fabricating success.

**Exit criteria:** Integration tests cover enqueue/claim/ack/nack/retry/restart/dead-letter/idempotency and concurrent workers against PostgreSQL; a failed handler never becomes completed; API and worker are separate processes on one durable queue; shutdown waits for consumer tasks.

### Phase 5 — Make immutable releases the sole Reader/export source

**Why after Phase 4:** A release build is asynchronous work and needs reliable queue semantics. The Reader contract is already established in Phase 2.

**Work:** Strengthen the existing `DeploymentSnapshot` and page index into a versioned release record that captures rendered page HTML, headings/SEO metadata, language/version, site features and required asset references. Keep source Markdown for editing. Add one authoritative Rust publish renderer using the existing safe-rendering foundation; hosted serving and portable export consume its output rather than rendering Markdown independently. Remove the duplicate export renderer and client-side final-render path after a parity fixture suite passes. Inject a hosted `SiteReaderProvider` into Studio preview and a Runner provider into the offline app. Fix Runner SQL filtering and move rusqlite work onto blocking execution. Search errors and missing content remain errors, never an empty “successful” result.

For export, implement only the manual release export path initially: `release_id` + validated format → durable job → artifact with checksum, byte count, MIME type and real status. Add SQLite to the database enum only if SQLite export remains a selected format; otherwise delete the unsupported format. Fail exports when source queries or assets fail. Remove the parallel `ExportSnapshot` metadata model and fabricated project-handler export endpoints. Do not ship schedules until a due-schedule claimant, timezone policy, missed-run behavior, cancellation and retention are implemented; otherwise remove schedule UI/API/schema.

**Expected outcome:** A public page, Studio preview and portable Reader show the same release; an export can be reproduced and audited against that release ID.

**Risks:** Renderer consolidation can affect heading anchors, MDX-like authored content, code highlighting, sanitization and SEO. Maintain a golden corpus of real Markdown examples and compare hosted/portable output; do not accept silent sanitizer regressions. Re-export old portable bundles after schema changes instead of carrying dual readers.

**Exit criteria:** Duplicate page paths across versions and languages resolve correctly; default/root page is deterministic; hosted preview search reaches the hosted provider; portable search/page results obey release/version/language; malicious metadata cannot inject HTML/script; an export contains every referenced asset and has truthful metadata; all surfaces pass the same renderer fixtures.

### Phase 6 — Reduce unfinished product surface and align to ADR 001

**Why after foundations:** Removing routes/tables is safe only once primary internal workflows and release packaging are covered by tests.

**Work and decisions:**

- Remove plan, billing, payment and entitlement code/schema, including project/export feature gates, `ALL_PLANS`, plan labels and plan-aware add-on availability. Keep actual operational usage diagnostics.
- Remove marketing routes/content references, public marketing-event route, `marketingAnalytics: null`, analytics consent component/types/tests and third-party consent scripts. Keep first-party operational analytics only where an operator reads it.
- Replace plan-aware add-ons with a small typed project/site feature configuration for only live Reader features; remove generic CRUD/provisioning for unsupported cards.
- Reduce the project integration catalog to real project-scoped outbound integrations, with provider-specific validation and delivery. Move instance-managed search/storage/email/analytics providers to validated server config. Delete unsupported entries and fake status projection.
- Keep Git sync only for providers with active internal use. Encrypt tokens, queue sync and return actual status; otherwise delete routes and tables. Remove fake webhook-secret and placeholder provider paths in either case.
- Remove heuristic “AI drafting,” the ClickHouse stub, fake PGP security endpoint and unused legacy theme/export JSON endpoints. Keep a capability only when there is a real tested consumer.
- Centralize Nibleaf origins, hostname rules and mail identity. Remove stale `cms.com`, `cms.app`, `admin.cms.com`, `app.cms.com` and TechnoStar defaults after existing configured domains/links are inventoried and migrated.
- Consolidate analytics event/query ownership. Preserve operational usage and any audit trail with an actual security/operator consumer; delete unused entity/query/schema copies only after call-site and migration scans.

**Expected outcome:** Studio presents capabilities that work for internal users, with no empty catalog cards, simulated health or paid-plan logic.

**Risks:** Static code cannot prove whether an integration or old table has live production data. Before destructive migration, query production row counts and recent activity, confirm references with the internal owner, take a restorable backup, then perform a one-way migration. This is a data-retention check, not a reason to keep old code or dual APIs.

**Exit criteria:** ADR 001 is true of routes, UI, migrations, provider catalog and shipped assets; no paid-plan/marketing/consent surface remains; each retained integration has a real end-to-end success and failure test; unknown providers fail closed; unused schema has a reviewed drop migration and backup/restore validation.

### Phase 7 — Prune dependencies and make drift visible

**Why last:** Dependency cleanup is safer after the owning feature is removed or covered by stable fixtures.

**Work:** Run `cargo machete` and the JS workspace's unused-export/dependency analysis in CI. Remove workspace `apalis`, Redis crates/backends, unused ClickHouse configuration, legacy `lazy_static` use where `LazyLock` is equivalent, stale façade modules and broad `unused`/`dead_code` allowances. Upgrade `epub-builder`, `printpdf` and `rusqlite` one at a time with artifact fixtures and Windows/Linux builds. Do not upgrade current SQLx 0.9 solely to claim freshness. Archive/update the old “zero-churn” SPA plan and revise the active frontend plan to match the typed-client/provider decisions.

**Expected outcome:** Unused code becomes visible at review time, dependency upgrades are evidence-based and CI checks all shipped binaries/assets.

**Exit criteria:** Dependency/lint analysis has no unexplained suppressions; CI runs Rust tests/clippy, Bun typecheck/tests/build, API client drift, migration tests, security regressions, Reader golden tests and a clean release package; all deployable targets build on the actual production toolchain.

## 7. Cross-phase acceptance scenario

The transformation is not complete until this single user journey passes against a clean database and a production-shaped release bundle:

1. An internal user signs in with a non-default secret and creates a project. Required organization membership, `main` branch, default language and settings commit atomically.
2. The user edits a page and publishes. The authorized command writes release work durably; the worker processes it, records truthful status and creates an immutable release with rendered content and complete asset references.
3. Studio preview loads that release through the hosted `SiteReaderProvider`; page lookup, language/version selection and search use the same release and do not hit Runner endpoints.
4. A public host resolves only through trusted proxy/host configuration and serves the active release. A path traversal cannot read server files; project-controlled metadata/content cannot escape its HTML context.
5. The portable export is built from that release, opens read-only, returns the same page/search results for the selected version/language, and binds locally unless network exposure is explicitly requested.
6. A worker restart/retry cannot lose or falsely complete the publish/export job. Shutdown joins consumers.
7. The shipped Studio, server, worker and Runner assets are produced from a clean CI checkout and installed using the exact documented config; missing artifacts or invalid production secrets fail before traffic is accepted.

## 8. Migration risks and operating rules

- **No silent dual contract:** route or bundle changes migrate all in-repository callers in the same phase; remove the old path/reader. If an external consumer is discovered, inventory it and migrate it explicitly rather than preserving a second internal implementation indefinitely.
- **One-way schema cleanup:** back up production data, inspect counts/references, migrate any needed values into the chosen model, verify restore, then drop old tables/enums. Never infer that a type is unused solely from its name.
- **Truthful status:** `completed`, `verified`, `healthy`, `cancelled` and `downloadUrl` must correspond to persisted observable outcomes. If the operation is not implemented, the UI should not offer it.
- **Error semantics:** remove `unwrap` on user-controlled empty lists, swallowed database errors, arbitrary language/version fallback and `Ok(None)` for unsupported work. Validation errors should be explicit and typed.
- **Do not overcorrect into abstraction:** keep Axum, PostgreSQL, SQLx, the modular Rust workspace and a single React Reader. Add an abstraction only for a real boundary or invariant; avoid generic plugin catalogs and compatibility maps.

## 9. Key files to revisit during implementation

- Decisions and superseded plans: `docs/ARCHITECTURE_DECISIONS.md`, `docs/superpowers/plans/2026-10-02-app-spa-conversion.md`, `docs/superpowers/plans/2026-10-05-frontend-architecture-refactor.md`
- HTTP and business boundaries: `crates/cms-api/src/lib.rs`, `crates/cms-api/src/project/{mod.rs,handlers.rs}`, `crates/cms-biz/src/project.rs`, `crates/cms-biz/src/export.rs`
- Frontend/client and Reader wiring: `apps/studio/src/shared/services/api.ts`, `apps/studio/src/shared/services/site-service.ts`, `apps/studio/src/routes/sites/$projectId/route.tsx`, `packages/site/src/context/site-api-context.tsx`, `packages/site/src/views/SiteLayout.tsx`, `apps/reader/src/router.tsx`
- Publication/export/portable Reader: `crates/cms-sites/src/{handlers.rs,host_resolution.rs,spa.rs,markdown_renderer.rs}`, `apps/runner/src/main.rs`, `crates/cms-entity/src/export.rs`, migrations defining `ExportFormat` and deployment snapshots
- Jobs/security/release: `crates/cms-queue/src/{in_memory.rs,redis.rs,postgres.rs}`, `crates/cms-worker/src/{lib.rs,main.rs}`, `crates/cms-middleware/src/{app_state.rs,admin_origin.rs,security_headers.rs}`, `crates/cms-config/src/auth.rs`, `.gitlab-ci.yml`, `deploy/`, `config/deploy.toml`
- Product-scope cleanup: `packages/shared/src/{addons.ts,integrations.ts}`, `apps/studio/src/features/project-settings/components/{addons-section.tsx,integrations-tab.tsx}`, `packages/site/src/components/site-analytics-consent.tsx`, `crates/cms-api/src/public/handlers.rs`, `crates/cms-analytics/src/clickhouse.rs`

---

**Recommendation:** approve the sequence, not the current “zero-churn” API-proxy decision. Fix exposure and make releases buildable first; then establish typed contracts and atomic use cases; then make jobs and immutable releases reliable; only then remove billing, marketing, generic add-on/integration compatibility code and stale dependencies. This produces a smaller, more dependable Nibleaf rather than a larger system that merely has more layers.
