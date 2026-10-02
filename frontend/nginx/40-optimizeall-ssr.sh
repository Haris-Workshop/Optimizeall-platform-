#!/bin/sh
# Run by the nginx image entrypoint (after 12-optimizeall-platform.envsh): starts the server renderer for public pages
# (server/ssr-server.mjs, docs/SEO_CRO.md § Rendering) in the background on 127.0.0.1:$SSR_PORT, restarting it if it
# exits. nginx sends pages to it (@document) and asks the API directly while it is not running (@document_api), so the
# site works without it — pages are then rendered in the browser.
#
#   SSR_ENABLED        "false" turns server rendering off (default on)
#   SSR_PORT           port of the renderer (default 3000; set in 12-optimizeall-platform.envsh)
#   SSR_MAX_OLD_SPACE  V8 heap limit of the renderer in MB (default 160; the web service shares its memory with nginx)
#   API_UPSTREAM / API_HOSTPORT  where the API is (the same settings nginx uses)
set -eu

if [ "${SSR_ENABLED:-true}" = "false" ]; then
  echo "40-optimizeall-ssr: server rendering is off (SSR_ENABLED=false); pages are rendered in the browser" >&2
  exit 0
fi
if ! command -v node >/dev/null 2>&1 || [ ! -f /opt/ssr/server/ssr-server.mjs ]; then
  echo "40-optimizeall-ssr: no Node.js or renderer in this image; pages are rendered in the browser" >&2
  exit 0
fi

(
  while :; do
    SSR_DIST=/usr/share/nginx/html node --max-old-space-size="${SSR_MAX_OLD_SPACE:-160}" /opt/ssr/server/ssr-server.mjs || true
    echo "40-optimizeall-ssr: the renderer exited; restarting in 2 s (nginx serves pages from the API meanwhile)" >&2
    sleep 2
  done
) &
