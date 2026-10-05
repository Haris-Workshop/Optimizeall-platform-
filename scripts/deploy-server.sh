#!/usr/bin/env bash
# Runs ON the server: deploys a release of Optimize All with Docker Compose (docs/VPS.md).
# An admin copies it and the compose files into the deploy directory (docs/VPS.md § Server setup); the GitHub deploy
# key runs it only through the forced command deploy/server/deploy-optimizeall.
#
# Usage (in the deploy directory, e.g. /opt/optimizeall):
#   ./deploy-server.sh init [PUBLIC_BASE_URL] [ADMIN_EMAIL]
#                                                      prepare a new server: secrets/ with generated values and
#                                                      .env.production; never overwrites existing files
#   ./deploy-server.sh deploy TAG REGISTRY [USER] [PUBLIC_BASE_URL] [ADMIN_EMAIL]
#                                                      pull REGISTRY/optimizeall-{api,migrator,web}:TAG and start it;
#                                                      the registry password/token is read from stdin (empty: no login);
#                                                      REGISTRY "local": images optimizeall-*:TAG built on this server,
#                                                      nothing is pulled; runs init first when .env.production does not
#                                                      exist yet
#   ./deploy-server.sh compose ARGS...                 docker compose on the running release, e.g. "compose logs api"
#
# Files in the deploy directory: docker-compose.production.yml, docker-compose.mysql.yml (used when .env.production
# has LOCAL_MYSQL=true), docker-compose.isolated.yml (ISOLATED=true: shared server), .env.production (settings), secrets/ (one secret per file), release.env (images now
# deployed) and release.previous.env (the ones before).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

die() { echo "::error::$*" >&2; exit 1; }

# Value of KEY in .env.production (last occurrence), or $2.
setting() {
  local value
  value="$(grep -E "^$1=" .env.production 2>/dev/null | tail -n 1 | cut -d= -f2-)" || true
  printf '%s' "${value:-${2:-}}"
}

compose() {
  local files=(-f docker-compose.production.yml)
  [ "$(setting LOCAL_MYSQL false)" = true ] && files+=(-f docker-compose.mysql.yml)
  if [ "$(setting ISOLATED false)" = true ]; then
    [ "$(setting LOCAL_MYSQL false)" = true ] || die "ISOLATED=true needs LOCAL_MYSQL=true (docs/VPS.md)"
    files+=(-f docker-compose.isolated.yml)
  fi
  local envs=(--env-file .env.production)
  [ -f "${RELEASE_ENV:-release.env}" ] && envs+=(--env-file "${RELEASE_ENV:-release.env}")
  docker compose "${envs[@]}" "${files[@]}" "$@"
}

# Random alphanumeric string of length $1 (safe inside MySQL connection strings).
alnum() {
  local out=""
  while [ "${#out}" -lt "$1" ]; do out+="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9')"; done
  printf '%s' "${out:0:$1}"
}

# Writes secrets/$1 with value $2 unless the file already exists. Compose mounts secret files with their host
# permissions and the API and migrator run as uid 1654, so the files are readable (644); the directory (700) keeps
# other users of the server out.
secret() {
  [ -e "secrets/$1" ] && return 0
  printf '%s' "$2" > "secrets/$1"
  chmod 644 "secrets/$1"
  echo "init: created secrets/$1"
}

# Sets KEY=value in .env.production (replacing an existing line).
set_setting() {
  if grep -qE "^$1=" .env.production; then
    sed -i "s|^$1=.*|$1=$2|" .env.production
  else
    printf '%s=%s\n' "$1" "$2" >> .env.production
  fi
}

init() {
  local base_url="${1:-}" admin_email="${2:-}"
  command -v openssl >/dev/null || die "openssl is required"
  mkdir -p secrets && chmod 700 secrets

  local mysql_password
  if [ -s secrets/mysql_password ]; then mysql_password="$(cat secrets/mysql_password)"; else mysql_password="$(alnum 32)"; fi
  secret mysql_password "$mysql_password"
  secret mysql_root_password "$(alnum 32)"
  secret db_connection_string "Server=mysql;Port=3306;Database=optimizeall;User=optimizeall;Password=${mysql_password};SslMode=None;AllowPublicKeyRetrieval=true;"
  secret jwt_signing_key "$(openssl rand -base64 48 | tr -d '\n')"
  secret hash_salt "$(openssl rand -hex 32)"
  secret postback_secret "$(openssl rand -hex 32)"
  # Satisfies the password policy (length >= 10, not common, varied characters).
  secret bootstrap_admin_password "$(alnum 20)-Oa9"
  secret smtp_password ""
  secret whatsapp_access_token ""

  if [ ! -f .env.production ]; then
    [ -f .env.production.example ] || die "init: .env.production.example is missing (the Deploy workflow copies it)"
    cp .env.production.example .env.production
    chmod 600 .env.production
    # A reverse proxy on this host (Caddy, nginx) reaches the web container through the Docker bridge, and the web
    # container reaches the API over the compose network: both are in 172.16.0.0/12.
    set_setting TRUSTED_PROXY_NETWORK 172.16.0.0/12
    set_setting REAL_IP_FROM 172.16.0.0/12
    set_setting LOCAL_MYSQL true
    [ -n "$base_url" ] && set_setting PUBLIC_BASE_URL "$base_url"
    [ -n "$admin_email" ] && set_setting BOOTSTRAP_ADMIN_EMAIL "$admin_email"
    echo "init: created .env.production"
  fi

  if grep -qE '^SMTP_HOST=smtp\.example\.com$' .env.production; then
    echo "::warning::SMTP is not configured yet: set SMTP_HOST, SMTP_USERNAME and EMAIL_FROM_ADDRESS in $PWD/.env.production and the password in secrets/smtp_password, then redeploy. Until then emails are not delivered."
  fi
  if grep -qE '^PUBLIC_BASE_URL=https://app\.example\.com$' .env.production; then
    echo "::warning::PUBLIC_BASE_URL in $PWD/.env.production is still the example; set it to the site's https address."
  fi
}

# Removes this project's images other than the current and previous release. Only optimizeall-* images: nothing
# else on the server is ever touched.
remove_old_images() {
  local keep ref
  keep="$(cat release.env release.previous.env 2>/dev/null | grep -E '^(API|MIGRATOR|WEB)_IMAGE=' | cut -d= -f2-)" || true
  docker image ls --format '{{.Repository}}:{{.Tag}}' \
    | grep -E '(^|/)optimizeall-(api|migrator|web):' \
    | while read -r ref; do
        grep -qxF "$ref" <<<"$keep" || docker image rm "$ref" >/dev/null 2>&1 || true
      done
}

deploy() {
  local tag="${1:?usage: deploy-server.sh deploy TAG REGISTRY [USER] [PUBLIC_BASE_URL] [ADMIN_EMAIL]}"
  local registry="${2:?usage: deploy-server.sh deploy TAG REGISTRY [USER] [PUBLIC_BASE_URL] [ADMIN_EMAIL]}"
  local user="${3:-}" base_url="${4:-}" admin_email="${5:-}"
  command -v docker >/dev/null || die "Docker is not installed on this server (docs/VPS.md § Server setup)"
  docker compose version >/dev/null 2>&1 || die "the Docker Compose plugin is not installed (docs/VPS.md § Server setup)"

  # First deploy: prepares the server. Later: only adds secret files introduced since then (never overwrites).
  init "$base_url" "$admin_email"
  # The site address set in GitHub (variable PUBLIC_BASE_URL) wins over the server's file.
  if [ -n "$base_url" ]; then set_setting PUBLIC_BASE_URL "$base_url"; fi

  local prefix="$registry/"
  [ "$registry" = local ] && prefix=""
  cat > release.env.next <<EOF
# Written by deploy-server.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
RELEASE_TAG=$tag
API_IMAGE=${prefix}optimizeall-api:$tag
MIGRATOR_IMAGE=${prefix}optimizeall-migrator:$tag
WEB_IMAGE=${prefix}optimizeall-web:$tag
EOF

  if [ "$registry" = local ]; then
    local image
    for image in api migrator web; do
      docker image inspect "optimizeall-$image:$tag" >/dev/null 2>&1 \
        || die "deploy: image optimizeall-$image:$tag is not on this server"
    done
  else
    # Registry credentials live only for this pull, in a throw-away Docker config (nothing stays on the server).
    local token
    token="$(cat)"
    DOCKER_CONFIG="$(mktemp -d)"
    export DOCKER_CONFIG
    trap 'rm -rf "$DOCKER_CONFIG"' EXIT
    if [ -n "$token" ]; then
      printf '%s' "$token" | docker login "${registry%%/*}" -u "${user:-deploy}" --password-stdin >/dev/null
    fi
    echo "deploy: pulling $tag"
    RELEASE_ENV=release.env.next compose pull --quiet
    rm -rf "$DOCKER_CONFIG"
    unset DOCKER_CONFIG
    trap - EXIT
  fi

  [ -f release.env ] && cp release.env release.previous.env
  mv release.env.next release.env

  # `up` runs the one-shot migrate service first and starts the API after it succeeded, then the web container once
  # the API is healthy (depends_on in the compose file).
  echo "deploy: starting $tag"
  if ! compose up -d --remove-orphans; then
    compose logs --tail 80 migrate api || true
    die "deploy: $tag did not start (log above). Previous release: $(grep -s '^RELEASE_TAG=' release.previous.env | cut -d= -f2)"
  fi

  local port code=""
  port="$(setting WEB_PORT 8080)"
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/health/ready" || true)"
    [ "$code" = 200 ] && break
    sleep 5
  done
  if [ "$code" != 200 ]; then
    compose ps || true
    compose logs --tail 80 api web || true
    die "deploy: $tag is not ready after 5 minutes (/health/ready: ${code:-no answer})"
  fi

  remove_old_images
  echo "deploy: $tag is live"
}

case "${1:-}" in
  init) shift; init "$@" ;;
  deploy) shift; deploy "$@" ;;
  compose) shift; compose "$@" ;;
  *) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
