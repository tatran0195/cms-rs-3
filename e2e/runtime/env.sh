#!/usr/bin/env bash
# Shared environment for the real-stack CMS E2E environment.
set -a

export CMS_ENV=e2e
export CMS_SERVER__HOST=127.0.0.1
export CMS_SERVER__PORT=3000
export CMS_SERVER__HTTPS=false

export CMS_DATABASE__URL=postgres://postgres:postgres!Tsvs7345@127.0.0.1:5432/cms_e2e
export CMS_DATABASE__MAX_POOL_SIZE=10

export CMS_AUTH__SESSION_SECRET=cms-e2e-session-secret
export CMS_AUTH__JWT_SECRET=cms-e2e-jwt-secret

# Local SMTP sink (the documented "Mailpit-style" plain mode) instead of Gmail.
export CMS_MAILER__SMTP_HOST=127.0.0.1
export CMS_MAILER__SMTP_PORT=1025
export CMS_MAILER__SMTP_USE_TLS=false
export CMS_MAILER__SMTP_PLAIN_NO_TLS=true
export CMS_MAILER__SMTP_USERNAME=
export CMS_MAILER__SMTP_PASSWORD=
export CMS_MAILER__FROM_EMAIL=no-reply@cms-e2e.local
export CMS_MAILER__FROM_NAME="CMS E2E"

# In-process storage + search, kept inside the E2E runtime dir.
export CMS_STORAGE__BACKEND=local
export CMS_STORAGE__LOCAL_ROOT=d:/Workspace/Software/_working/cms-rs-3/target/e2e-runtime/uploads
export CMS_SEARCH__BACKEND=tantivy
export CMS_SEARCH__INDEX_DIR=d:/Workspace/Software/_working/cms-rs-3/target/e2e-runtime/indexes
export CMS_SEARCH__VECTOR_SEARCH_ENABLED=false

export CMS_QUEUE__BACKEND=postgres
export CMS_ANALYTICS__BACKEND=postgres

# Localhost SPA is same-origin; keep origin enforcement permissive for tests.
export CMS_ADMIN_ORIGIN__ENFORCE=false
export CMS_ADMIN_ORIGIN__ALLOW_LOCALHOST=true
export CMS_SECURITY_HEADERS__ENABLE_HSTS=false

# The server runs from the E2E runtime dir, so point it at the built studio.
export FRONTEND_DIR=d:/Workspace/Software/_working/cms-rs-3/dist/frontend

# Playwright-facing defaults.
export E2E_BASE_URL=http://127.0.0.1:3000
export E2E_MAIL_DIR=d:/Workspace/Software/_working/cms-rs-3/target/e2e-mail
export E2E_SMTP_PORT=1025

export RUST_LOG=cms_server=info,cms_worker=info,warn

set +a