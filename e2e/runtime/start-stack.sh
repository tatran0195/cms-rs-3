#!/usr/bin/env bash
# Boot the complete, real CMS stack used by the Playwright suite.
#
#   1. PostgreSQL (already-running local cluster is reused)
#   2. The E2E SMTP sink (delivers real OTP mail to a folder)
#   3. cms-server: API + job worker + published sites, serving the built studio
#
# Usage:  runtime/start-stack.sh [--reset-db]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"

RESET_DB=0
[[ "${1:-}" == "--reset-db" ]] && RESET_DB=1

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGDATA="${PGDATA:-/home/user/pgdata}"
PGSOCK="${PGSOCK:-/home/user/pgrun}"
PGPORT="${PGPORT:-5433}"
RUNTIME_DIR="${E2E_RUNTIME_DIR:-/home/user/cms-e2e-runtime}"
LOG_DIR="$RUNTIME_DIR/logs"
BIN="$REPO/target/debug/cms-server"
ASSETS="${CMS_FRONTEND_DIST:-$REPO/dist/frontend}"

log() { printf '\033[1;34m[stack]\033[0m %s\n' "$*"; }

mkdir -p "$LOG_DIR" "$RUNTIME_DIR" "$E2E_MAIL_DIR"

# ── 1. PostgreSQL ────────────────────────────────────────────────────────────
if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  log "starting PostgreSQL on :$PGPORT"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >"$LOG_DIR/initdb.log" 2>&1
  fi
  if ! "$PGBIN/pg_ctl" -D "$PGDATA" \
      -o "-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1 -c max_connections=200 -c shared_buffers=192MB" \
      -l "$LOG_DIR/postgres.log" start >/dev/null 2>&1; then
    # A cluster left half-written by an interrupted run cannot be recovered by
    # restarting it. The E2E database is disposable, so rebuild it from scratch
    # rather than failing every subsequent run.
    log "cluster failed to start, re-initialising $PGDATA"
    "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "${PGDATA:?}" && mkdir -p "$PGDATA" && chmod 700 "$PGDATA"
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >"$LOG_DIR/initdb.log" 2>&1
    "$PGBIN/pg_ctl" -D "$PGDATA" \
      -o "-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1 -c max_connections=200 -c shared_buffers=192MB" \
      -l "$LOG_DIR/postgres.log" start >/dev/null
  fi
  for _ in $(seq 1 40); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
log "PostgreSQL ready on :$PGPORT"

# The database name is the last path segment of the URL, without any query string.
DB_NAME="${CMS_DATABASE__URL%%\?*}"
DB_NAME="${DB_NAME##*/}"
if ! psql -h 127.0.0.1 -p "$PGPORT" -U postgres -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  log "creating database $DB_NAME"
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
fi

if [[ "$RESET_DB" == "1" ]]; then
  log "resetting database $DB_NAME"
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" >/dev/null
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
fi

# ── 2. SMTP sink ─────────────────────────────────────────────────────────────
if ! (exec 3<>/dev/tcp/127.0.0.1/"$E2E_SMTP_PORT") 2>/dev/null; then
  log "starting SMTP sink on :$E2E_SMTP_PORT"
  nohup python3 "$HERE/smtp_sink.py" "$E2E_SMTP_PORT" "$E2E_MAIL_DIR" \
    >"$LOG_DIR/smtp.log" 2>&1 &
  disown || true
  for _ in $(seq 1 40); do
    (exec 3<>/dev/tcp/127.0.0.1/"$E2E_SMTP_PORT") 2>/dev/null && break
    sleep 0.25
  done
fi
log "SMTP sink ready on :$E2E_SMTP_PORT (mail dir: $E2E_MAIL_DIR)"

# ── 3. Application ───────────────────────────────────────────────────────────
if [[ ! -x "$BIN" ]]; then
  log "ERROR: $BIN not built. Run: cargo build -p cms-server --bin cms-server"
  exit 1
fi
if [[ ! -f "$ASSETS/index.html" ]]; then
  log "WARNING: frontend bundle missing at $ASSETS — the SPA will not render."
  log "         Build it with: bun --filter @cms/studio build"
fi

if curl -fsS "${E2E_BASE_URL}/api/health" >/dev/null 2>&1; then
  log "cms-server already running at $E2E_BASE_URL"
  exit 0
fi

log "starting cms-server at $E2E_BASE_URL"
( cd "$RUNTIME_DIR" && exec "$BIN" ) >"$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$RUNTIME_DIR/server.pid"

for _ in $(seq 1 120); do
  if curl -fsS "${E2E_BASE_URL}/api/health" >/dev/null 2>&1; then
    log "cms-server ready (pid $SERVER_PID)"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "ERROR: cms-server exited. Last log lines:"
    tail -40 "$LOG_DIR/server.log"
    exit 1
  fi
  sleep 1
done

log "ERROR: cms-server did not become healthy in 120s. Last log lines:"
tail -40 "$LOG_DIR/server.log"
exit 1