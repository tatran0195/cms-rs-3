#!/usr/bin/env bash
# Quick manual smoke of the real stack: sign in through the API the same way the
# UI does, then confirm a project/page/release round trip works end to end.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"

BASE="${E2E_BASE_URL}"
EMAIL="smoke.$(date +%s)@cms-e2e.local"

echo "→ requesting OTP for $EMAIL"
curl -sS -X POST "$BASE/api/auth/email-otp/send-verification-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"type\":\"sign-in\"}"
echo

sleep 1
CODE="$(python3 - "$E2E_MAIL_DIR" "$EMAIL" <<'PY'
import json, os, re, sys
mail_dir, email = sys.argv[1], sys.argv[2]
best = None
for name in sorted(os.listdir(mail_dir)):
    if not name.endswith('.json'):
        continue
    path = os.path.join(mail_dir, name)
    try:
        msg = json.load(open(path, encoding='utf-8'))
    except Exception:
        continue
    if email in [t.lower() for t in msg.get('to', [])]:
        best = msg
if not best:
    sys.exit('no mail for ' + email)
m = re.search(r'\b(\d{6})\b', best.get('body', ''))
print(m.group(1) if m else '')
PY
)"
echo "→ code=$CODE"

echo "→ signing in"
COOKIE_JAR="$(mktemp)"
curl -sS -c "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-in/email-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$CODE\"}" | head -c 200
echo

echo "→ creating a project"
PROJECT=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/app/projects" \
  -H 'Content-Type: application/json' -d '{"name":"Smoke Site"}')
echo "$PROJECT" | head -c 300; echo
PROJECT_ID="$(echo "$PROJECT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
echo "project=$PROJECT_ID"

echo "→ languages"
curl -sS -b "$COOKIE_JAR" "$BASE/api/app/projects/$PROJECT_ID/languages" | head -c 300; echo

echo "→ publishing"
curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/app/projects/$PROJECT_ID/deployments" \
  -H 'Content-Type: application/json' -d '{"message":"smoke"}' | head -c 300; echo
sleep 4
echo "→ deployments"
curl -sS -b "$COOKIE_JAR" "$BASE/api/app/projects/$PROJECT_ID/deployments" | head -c 400; echo
rm -f "$COOKIE_JAR"