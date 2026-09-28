#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/pages-dist"

rm -rf "$OUT"
mkdir -p "$OUT"

copy() {
  cp "$HERE/$1" "$OUT/$1"
}

copy_as() {
  cp "$HERE/$1" "$OUT/$2"
}

# Team PWA becomes the root Cloudflare Pages application.
copy_as "team.html" "index.html"
copy "team.html"

API_BASE="${TURNSTILE_API_BASE:-}"
if [ -z "$API_BASE" ]; then
  echo "TURNSTILE_API_BASE is required for Cloudflare Pages build" >&2
  exit 1
fi

cat > "$OUT/team-config.js" <<EOF
window.TURNSTILE_TEAM_CONFIG = {
  enabled: true,
  apiBase: "${API_BASE%/}",
  appName: "Осмотр турникетов",
  syncQueueKey: "turnstileTeam.syncQueue.v1",
  sessionKey: "turnstileTeam.session.v1"
};
EOF

copy "styles.css"
copy "team.css"
copy "team-storage.js"
copy "team-api.js"
copy "team-install.js"
copy "team-ui.js"
copy "team-app.js"
copy "pdf-renderer.js"
copy "server-print.js"
copy "team-manifest.webmanifest"
copy "sw.js"

copy "favicon-v11.png"
copy "apple-touch-icon-v11.png"
copy "turnstile-icon-192-v11.png"
copy "turnstile-icon-512-v11.png"

copy "assets-init.js"
copy "asset-page1-1.js"
copy "asset-page2-1.js"
copy "asset-page2-2.js"
copy "asset-page3-1.js"
copy "asset-page3-2.js"
copy "asset-page4-1.js"
copy "asset-page4-2.js"
copy "asset-page5-1.js"
copy "asset-page5-2.js"
copy "asset-page6-1.js"
copy "asset-atlas-1.js"
copy "asset-atlas-2.js"
copy "asset-atlas-3.js"
copy "assets-meta.js"
copy "assets-final.js"

touch "$OUT/.nojekyll"

echo "Cloudflare Pages bundle created at: $OUT"
