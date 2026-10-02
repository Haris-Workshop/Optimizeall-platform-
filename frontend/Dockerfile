# syntax=docker/dockerfile:1.7
#
# Optimize All web image: Vite build served by unprivileged nginx, which also reverse-proxies the API
# (/api/, /t/, /health/) so the browser talks to a single origin (no CORS, SameSite=Strict refresh cookie works).
#
# Build context: frontend/
#   docker build -t optimizeall-web frontend
#   docker run -p 8080:8080 -e API_UPSTREAM=http://api:8080 optimizeall-web
#
# Runtime env:
#   API_UPSTREAM    base URL of the API (scheme://host:port, no path). Default http://api:8080.
#   IMG_SRC_EXTRA   extra CSP img-src sources, space separated (e.g. "https://images.example.com"). Default empty.
#                   Must match the API's Content:AllowedImageHosts.
#   MEDIA_SRC_EXTRA extra CSP media-src sources for lesson videos hosted elsewhere (e.g. "https://cdn.example.com"). Default empty.
#   API_HOSTPORT, REAL_IP_FROM, API_WAIT_SECONDS, API_RESOLVE_INTERVAL: see nginx/12-optimizeall-platform.envsh (Render: docs/RENDER.md).
#   SSR_ENABLED, SSR_PORT, SSR_MAX_OLD_SPACE: the server renderer of public pages, see nginx/40-optimizeall-ssr.sh.

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

# ---------------------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV CI=true

# Dependency layer (cached until the lockfile changes).
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

# Node.js for the server renderer of public pages (server/ssr-server.mjs, started by 40-optimizeall-ssr.sh next to
# nginx; docs/SEO_CRO.md § Rendering). The renderer is one self-contained bundle (dist-ssr/): no node_modules.
USER root
RUN apk add --no-cache nodejs

# The official image renders /etc/nginx/templates/*.template with envsubst into /etc/nginx/conf.d at startup.
# Only variables that are defined in the environment are substituted, so nginx's own $vars are untouched.
ENV API_UPSTREAM=http://api:8080
# Defined (empty) so envsubst always renders it; see nginx/snippets/security-headers.conf.
ENV IMG_SRC_EXTRA=""
ENV MEDIA_SRC_EXTRA=""

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/snippets/ /etc/nginx/snippets/
COPY --chmod=0755 nginx/12-optimizeall-platform.envsh /docker-entrypoint.d/12-optimizeall-platform.envsh
COPY --chmod=0755 nginx/40-optimizeall-ssr.sh /docker-entrypoint.d/40-optimizeall-ssr.sh
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist-ssr /opt/ssr/dist-ssr
COPY server/ssr-server.mjs /opt/ssr/server/ssr-server.mjs

EXPOSE 8080
USER 101

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
