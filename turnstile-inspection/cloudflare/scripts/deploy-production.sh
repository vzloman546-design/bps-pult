#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${TURNSTILE_USER_PASSWORDS_JSON:?TURNSTILE_USER_PASSWORDS_JSON is required}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CF="$ROOT/cloudflare"

cd "$CF"

npm install --no-audit --no-fund

node scripts/prepare-production-resources.mjs

PAGES_PROJECT="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('deployment.production.json','utf8'));process.stdout.write(x.pagesProject)")"
PAGES_URL="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('deployment.production.json','utf8'));process.stdout.write(x.pagesUrl)")"

echo "Deploying Worker..."
npx wrangler deploy --config wrangler.production.toml

WORKER_URL="$(node scripts/resolve-worker-url.mjs | tail -n 1)"

wait_worker() {
  for _ in $(seq 1 30); do
    if curl -fsS "$WORKER_URL/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Worker health check failed: $WORKER_URL" >&2
  return 1
}

echo "Applying D1 schema..."
npx wrangler d1 execute turnstile-inspection \
  --remote \
  --yes \
  --config wrangler.production.toml \
  --file ./schema.sql

node scripts/generate-setup.mjs > /tmp/turnstile-setup.json

echo "Checking Web Push identity..."
npx wrangler secret list \
  --config wrangler.production.toml \
  --format json > /tmp/turnstile-worker-secrets.json

if ! node -e "const x=JSON.parse(require('fs').readFileSync('/tmp/turnstile-worker-secrets.json','utf8'));process.exit(x.some(v=>v.name==='VAPID_KEYPAIR_JWK')?0:1)"; then
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/turnstile-setup.json','utf8')).VAPID_KEYPAIR_JWK)" \
    | npx wrangler secret put VAPID_KEYPAIR_JWK --config wrangler.production.toml
fi

wait_worker

echo "Building Pages application..."
cd "$ROOT"
TURNSTILE_API_BASE="$WORKER_URL" bash pages-build.sh

cd "$CF"
echo "Deploying Pages..."
npx wrangler pages deploy ../pages-dist \
  --project-name="$PAGES_PROJECT" \
  --branch=main

echo "Initializing users..."
INITIALIZED="$(curl -fsS "$WORKER_URL/api/bootstrap/status" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(String(!!JSON.parse(s).initialized)))")"

BOOTSTRAP_TOKEN="already-initialized"

if [ "$INITIALIZED" != "true" ]; then
  BOOTSTRAP_TOKEN="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/turnstile-setup.json','utf8')).BOOTSTRAP_TOKEN)")"
  printf '%s' "$BOOTSTRAP_TOKEN" \
    | npx wrangler secret put BOOTSTRAP_TOKEN --config wrangler.production.toml

  node -e '
    const passwords=JSON.parse(process.env.TURNSTILE_USER_PASSWORDS_JSON);
    process.stdout.write(JSON.stringify({
      username:"kakur13",
      displayName:"Какурин Артем Русланович",
      password:passwords.kakur13
    }));
  ' > /tmp/bootstrap-admin.json

  echo "Waiting for bootstrap secret propagation and creating administrator..."
  ready=0

  for _ in $(seq 1 45); do
    status="$(curl -sS -o /tmp/bootstrap-response.json -w '%{http_code}' \
      -X POST "$WORKER_URL/api/bootstrap/admin" \
      -H "content-type: application/json" \
      -H "x-bootstrap-token: $BOOTSTRAP_TOKEN" \
      --data-binary @/tmp/bootstrap-admin.json || true)"

    if [ "$status" = "201" ] || [ "$status" = "409" ]; then
      ready=1
      break
    fi

    if [ "$status" != "403" ]; then
      echo "Unexpected bootstrap response: HTTP $status" >&2
      cat /tmp/bootstrap-response.json >&2 || true
      exit 1
    fi

    sleep 2
  done

  if [ "$ready" != "1" ]; then
    echo "Bootstrap secret did not propagate in time" >&2
    exit 1
  fi
fi
TURNSTILE_API_BASE="$WORKER_URL" \
TURNSTILE_BOOTSTRAP_TOKEN="$BOOTSTRAP_TOKEN" \
node scripts/provision-production-users.mjs

echo "Running production smoke checks..."
curl -fsS "$WORKER_URL/api/health" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "$PAGES_URL/" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "$PAGES_URL/" >/dev/null

echo "Production deployment completed"
echo "PWA: $PAGES_URL"
echo "Worker: $WORKER_URL"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Осмотр турникетов — Cloudflare"
    echo ""
    echo "- PWA: $PAGES_URL"
    echo "- Worker API: $WORKER_URL"
    echo "- D1: turnstile-inspection"
    echo "- KV: turnstile-inspection-documents"
    echo "- Учётных записей: 5"
  } >> "$GITHUB_STEP_SUMMARY"
fi
