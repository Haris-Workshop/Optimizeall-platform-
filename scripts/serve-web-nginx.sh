#!/usr/bin/env bash
# Serves a built frontend (frontend/dist) with the production nginx configuration (frontend/nginx/default.conf.template
# and snippets), exactly as the web image does, but with a local nginx binary: no Docker needed. Used by
# scripts/e2e-journeys.sh (E2E_WEB_SERVER=nginx) to exercise the production path — server-rendered pages through SSI,
# SEO files, portal noindex headers, caching — and handy for checking docs/SEO_CRO.md by hand.
#
# Usage: scripts/serve-web-nginx.sh PORT API_UPSTREAM [WORK_DIR]
#   PORT          port to listen on (127.0.0.1 only)
#   API_UPSTREAM  API base URL, e.g. http://127.0.0.1:5099
#   WORK_DIR      where the rendered configuration, pid file and logs go (default: a new temp directory)
# Runs nginx in the foreground (stop it with SIGTERM / SIGQUIT). Needs nginx ≥ 1.18 on PATH (SSI is built in).
#
# When the build has the server renderer (frontend/dist-ssr, npm run build) and Node.js is installed, it also runs
# frontend/server/ssr-server.mjs on a free local port (SSR_PORT to choose it, SSR_ENABLED=false to skip it), as the web
# image does (nginx/40-optimizeall-ssr.sh): public pages then arrive server-rendered. Without it nginx asks the API
# directly, as in production while the renderer is down.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

PORT="${1:?port}"
API_UPSTREAM="${2:?API upstream, e.g. http://127.0.0.1:5099}"
WORK_DIR="${3:-$(mktemp -d "${TMPDIR:-/tmp}/oa-nginx.XXXXXX")}"
DIST="$FRONTEND_DIR/dist"
NGINX_BIN="${NGINX_BIN:-nginx}"

have "$NGINX_BIN" || die "nginx is required (apt-get install nginx)"
[ -f "$DIST/index.html" ] || die "Build the frontend first (npm run build): $DIST/index.html is missing"
[ -f "$DIST/__shell/head.html" ] || die "$DIST/__shell/head.html is missing: the seoShell Vite plugin did not run"
mkdir -p "$WORK_DIR/snippets" "$WORK_DIR/tmp"

# The server renderer's port: it is started below when available; otherwise nothing listens there and nginx asks the
# API directly (@document_api).
SSR_PID=""
if [ -z "${SSR_PORT:-}" ]; then
  for SSR_PORT in $(seq 39100 39300); do port_in_use "$SSR_PORT" || break; done
fi
# Same substitution as the nginx image's envsubst step: only these variables, nothing else.
OPTIMIZEALL_VERSION="${OPTIMIZEALL_VERSION:-local-test}"
sed -e "s|\${OA_SSR_PROXY}|http://127.0.0.1:$SSR_PORT|g" -e "s|\${OA_API_PROXY}|$API_UPSTREAM|g" -e "s|\${IMG_SRC_EXTRA}||g" -e "s|\${MEDIA_SRC_EXTRA}||g" \
    -e "s|\${OPTIMIZEALL_VERSION}|$OPTIMIZEALL_VERSION|g" \
    -e "s|listen       8080;|listen       127.0.0.1:$PORT;|" \
    -e "s|root  /usr/share/nginx/html;|root  $DIST;|" \
    -e "s|/etc/nginx/snippets/|$WORK_DIR/snippets/|g" \
    "$FRONTEND_DIR/nginx/default.conf.template" > "$WORK_DIR/default.conf"
cp "$FRONTEND_DIR"/nginx/snippets/*.conf "$WORK_DIR/snippets/"

MIME_TYPES="/etc/nginx/mime.types"
[ -f "$MIME_TYPES" ] || die "$MIME_TYPES not found"
# As root nginx would drop its workers to "nobody", which cannot read the root-owned temp directory in $WORK_DIR.
NGINX_USER=""
[ "$(id -u)" = "0" ] && NGINX_USER="user root;"
cat > "$WORK_DIR/nginx.conf" <<EOF
$NGINX_USER
worker_processes 1;
daemon off;
pid $WORK_DIR/nginx.pid;
error_log $WORK_DIR/error.log warn;
events { worker_connections 1024; }
http {
    include $MIME_TYPES;
    default_type application/octet-stream;
    access_log $WORK_DIR/access.log;
    client_body_temp_path $WORK_DIR/tmp/client;
    proxy_temp_path $WORK_DIR/tmp/proxy;
    fastcgi_temp_path $WORK_DIR/tmp/fastcgi;
    uwsgi_temp_path $WORK_DIR/tmp/uwsgi;
    scgi_temp_path $WORK_DIR/tmp/scgi;
    sendfile on;
    keepalive_timeout 65;
    include $WORK_DIR/default.conf;
}
EOF
"$NGINX_BIN" -t -p "$WORK_DIR" -c "$WORK_DIR/nginx.conf" -e "$WORK_DIR/error.log"

if [ "${SSR_ENABLED:-true}" != false ] && [ -f "$FRONTEND_DIR/dist-ssr/entry-server.js" ] && have node; then
  SSR_PORT="$SSR_PORT" SSR_DIST="$DIST" API_UPSTREAM="$API_UPSTREAM" API_HOSTPORT= \
    SSR_ENTRY="$FRONTEND_DIR/dist-ssr/entry-server.js" node "$FRONTEND_DIR/server/ssr-server.mjs" > "$WORK_DIR/ssr.log" 2>&1 &
  SSR_PID=$!
  wait_for_url "http://127.0.0.1:$SSR_PORT/healthz" 30 "$SSR_PID" || { cat "$WORK_DIR/ssr.log" >&2; die "the server renderer did not start"; }
  log "server renderer on 127.0.0.1:$SSR_PORT (log $WORK_DIR/ssr.log)"
else
  log "no server renderer (frontend/dist-ssr missing, Node.js missing or SSR_ENABLED=false): pages come from the API"
fi

log "nginx on http://127.0.0.1:$PORT → API $API_UPSTREAM (config in $WORK_DIR)"
"$NGINX_BIN" -p "$WORK_DIR" -c "$WORK_DIR/nginx.conf" -e "$WORK_DIR/error.log" &
NGINX_PID=$!
stop() {
  kill -TERM "$NGINX_PID" 2>/dev/null || true
  [ -n "$SSR_PID" ] && kill -TERM "$SSR_PID" 2>/dev/null || true
}
trap stop EXIT
trap 'stop; exit 0' TERM INT QUIT
wait "$NGINX_PID"
