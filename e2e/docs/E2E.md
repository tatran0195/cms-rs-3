# Running the CMS end-to-end suite

This suite drives the **real product**: a browser loads the built React studio,
which calls the real Rust API, which writes to a real PostgreSQL database and
publishes immutable release snapshots through the in-process worker. Nothing is
stubbed, and there is no API mocking layer.

The only non-UI collaborators are deliberately narrow and documented in
`src/support/`:

| Helper | What it does | Why it is allowed |
| --- | --- | --- |
| `mail.ts` | Reads the one-time code the SMTP sink actually delivered | A person's mailbox. Authentication is genuinely passwordless, so a login through the UI needs the real email. |
| `db.ts` | Read-only `SELECT` queries | Independent verification that what the UI claimed is what was persisted — a different read path than the frontend's own response. |
| `browser-api.ts` | `fetch` from inside the authenticated page | Independent verification, plus security-boundary payloads the UI cannot express (an id from another tenant, a stale language). |
| `forged-api.ts` | Cookie-less HTTP client | Replaying stale/forged payloads (a consumed OTP) and probing unauthenticated boundaries. Creates no state. |

**Every entity under test is created by a person clicking through the studio.**
SQL is never used to set up application state.

---

## 1. Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Rust | 1.96.1 | `cargo build -p cms-server --bin cms-server`. The first build compiles ~900 crates; expect ~20 minutes and ~8 GB of `target/`. |
| Bun | 1.4.2 | `bun install --frozen-lockfile` at the repo root. |
| Node | ≥ 20 | Used by Playwright and the Vite build. |
| PostgreSQL | 17 | The stack launcher starts and migrates it. |
| `psql` client | 17 | `db.ts` shells out to it for verification queries. |
| Python | 3.11+ | Runs the SMTP sink. |

System libraries needed by the Rust build: `pkg-config`, `libssl-dev`,
`libonig-dev`, `zlib1g-dev`, `libclang` (for `ort`), `build-essential`.

> **Disk and memory.** The debug link step needs several GB of free disk and
> roughly 2 GB of RAM. On a 2 GB machine, give the build swap (6 GB worked) and
> run the frontend build *after* the backend finishes — running both at once
> gets the Vite process OOM-killed.

---

## 2. Start the stack

```bash
cd cms-rs-3
bun install --frozen-lockfile
bun --filter @cms/studio build          # emits dist/frontend
cargo build -p cms-server --bin cms-server

e2e/runtime/start-stack.sh --reset-db   # PostgreSQL + SMTP + server
```

`start-stack.sh` is the single entry point. It:

1. starts PostgreSQL on `127.0.0.1:5433` (data in `/home/user/pgdata`),
2. creates and migrates `cms_e2e` (dropping it first with `--reset-db`),
3. starts the SMTP sink on `127.0.0.1:1025`, writing every delivered message to
   `/home/user/e2e-mail/*.json`,
4. starts `cms-server` on `http://127.0.0.1:3000` with `FRONTEND_DIR` pointed at
   `dist/frontend`, and waits for `/api/health` to report healthy.

Logs land in `/home/user/cms-e2e-runtime/logs/{postgres,smtp,server}.log`.

`runtime/env.sh` is the single source of truth for ports and paths. The
Playwright config reads the same file through `src/support/env.ts`, so the test
runner and the server can never disagree about where the mailbox or the
database lives.

### Migrations and reset

The server runs embedded SQLx migrations on boot. `--reset-db` drops and
recreates the database, so every run starts from the real schema as committed —
no drift from a previous run, and no hand-applied patches.

---

## 3. Run the tests

```bash
cd cms-rs-3/e2e
npm install
npx playwright install --with-deps chromium firefox webkit

npx playwright test                              # everything, Chromium
npx playwright test --project=chromium -g "publish"
npx playwright test tests/workflows              # the deep cross-entity flows
npx playwright test --project=firefox           # cross-engine smoke only
```

Useful environment variables (all have working defaults):

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://127.0.0.1:3000` | Stack origin |
| `E2E_MAIL_DIR` | `/home/user/e2e-mail` | Where the SMTP sink writes |
| `CMS_DATABASE__URL` | `postgres://postgres@127.0.0.1:5433/cms_e2e` | Verification database |
| `E2E_WORKERS` | `3` | Local parallelism; `2` on CI |

### Browser matrix

Chromium is the reference engine: the editor is a TipTap/ProseMirror canvas with
drag-and-drop tree reordering and a push-state SPA, and Chromium is the engine
those were developed against. Firefox and WebKit run a **cross-engine smoke
workflow** (`tests/workflows/cross-engine.spec.ts`) — sign in, create a site,
publish, read back — to catch engine-specific rendering and input handling
without quadrupling the runtime of every business test.

### Artifacts

| Artifact | Path |
| --- | --- |
| Trace (only on failure) | `e2e/test-results/**/trace.zip` |
| Screenshot (only on failure) | `e2e/test-results/**/test-failed-*.png` |
| Video (CI, on failure) | `e2e/test-results/**/*.webm` |
| HTML report | `e2e/playwright-report/index.html` |
| Machine-readable results | `e2e/test-results/results.json` |
| Server log | `/home/user/cms-e2e-runtime/logs/server.log` |
| Delivered mail | `/home/user/e2e-mail/*.json` |

View a trace with `npx playwright show-trace test-results/<dir>/trace.zip`.

---

## 4. Waiting and retries

Tests use Playwright web-first assertions (`toBeVisible`, `toHaveURL`,
`expect.poll`) against observable product state — the autosave indicator, a
dialog closing, a URL transition. **There is no `waitForTimeout` in the suite.**
A fixed sleep would hide exactly the races this suite exists to find.

Timeouts are set high because they are ceilings, not pacing:

* `timeout: 180_000` per test — publishing builds an immutable snapshot through
  the worker, which on a cold 2 GB CI box is slow.
* `expect.timeout: 15_000`, `actionTimeout: 20_000`.

`retries: 1` on CI only, and a test that passes on retry is reported as a
flaky defect in the test report rather than being allowed to pass quietly.

---

## 5. CI

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.4.2 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: e2e/package-lock.json }
      - uses: dtolnay/rust-toolchain@1.96.1
      - uses: Swatinem/rust-cache@v2

      - name: System dependencies
        run: sudo apt-get update && sudo apt-get install -y postgresql-17 libonig-dev zlib1g-dev libssl-dev libclang-dev

      - run: bun install --frozen-lockfile
      - run: bun --filter @cms/studio build
      - run: cargo build -p cms-server --bin cms-server --release

      - run: npm ci && npx playwright install --with-deps chromium firefox webkit
        working-directory: e2e

      - name: Start PostgreSQL
        run: |
          sudo systemctl enable --now postgresql
          sudo -u postgres createdb cms_e2e

      - name: Start SMTP sink and server
        run: |
          python3 e2e/runtime/smtp_sink.py &
          CMS_DATABASE__URL=postgres://postgres@127.0.0.1:5432/cms_e2e \
          CMS_SERVER__PORT=3000 \
          FRONTEND_DIR=$PWD/dist/frontend \
          CMS_MAILER__SMTP_HOST=127.0.0.1 CMS_MAILER__SMTP_PORT=1025 \
          ./target/release/cms-server &

      - name: Wait for readiness
        run: |
          npx wait-on http://127.0.0.1:3000/api/health -t 60000
          npx wait-on tcp:5432 -t 60000
        working-directory: e2e

      - name: Playwright
        run: npx playwright test --project=chromium
        working-directory: e2e

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-artifacts
          path: |
            e2e/playwright-report/
            e2e/test-results/
          retention-days: 14
```

Readiness is asserted explicitly (health endpoint + TCP on the database) rather
than by sleeping, so a slow CI box does not turn into a false failure and a
crashed server does not turn into a mysterious test error.

---

## 6. How to add a test

1. Put cross-entity business flows in `tests/workflows/`; single-entity
   lifecycle tests in `tests/<entity>/`.
2. Import `test` and `expect` from `../../src/fixtures/test` — never from
   `@playwright/test` directly, so the fixtures and diagnostics are attached.
3. Perform the work through the UI. Use `db` only to confirm afterwards.
4. Call `diagnostics.assertClean()` at the end. If the test *deliberately*
   provokes a failure (a wrong code, a rejected slug), declare it first with
   `diagnostics.expectFailure(...)` so an accidental new error still fails.
5. Prefer a page-object helper over inline selectors once a flow is used by more
   than one test.

---

## 7. Known product defects found by this suite

See [`../docs/E2E_FINDINGS.md`](../docs/E2E_FINDINGS.md) for the full defect
report with reproduction steps, impact and status.