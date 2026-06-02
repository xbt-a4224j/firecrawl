#!/usr/bin/env bash
# Stand up the full Firecrawl stack for the walkthrough — idempotent and demo-safe.
#   - if the API is already healthy, do nothing (fast no-op).
#   - otherwise `docker compose up` the whole stack (api + playwright + redis + rabbitmq + postgres).
#     Playwright runs in a Linux container, so this avoids the macOS headless-chromium crash.
# Readiness = a real scrape of example.com returns success, i.e. the WHOLE pipeline works, not just
# that a port is open.
set -uo pipefail

API="${FIRECRAWL_API:-http://localhost:3002}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ready() {
  curl -s -m 60 -X POST "$API/v2/scrape" \
    -H 'Content-Type: application/json' \
    -d '{"url":"https://example.com","formats":["markdown"]}' 2>/dev/null \
    | grep -q '"success":true'
}

echo "▶ checking $API …"
if curl -sf -m 3 "$API/" >/dev/null 2>&1 && ready; then
  echo "✓ stack already healthy — nothing to do"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ docker not found. Start the stack manually, or set FIRECRAWL_API to a running instance." >&2
  exit 1
fi

echo "▶ bringing up the stack with docker compose (first build can take a few minutes) …"
( cd "$REPO_ROOT" && docker compose up -d --build ) || {
  echo "✗ docker compose failed. Try: (cd '$REPO_ROOT' && docker compose logs --tail=50)" >&2
  exit 1
}

echo "▶ waiting for the pipeline to be ready (a real scrape must succeed) …"
for i in $(seq 1 90); do
  if curl -sf -m 3 "$API/" >/dev/null 2>&1 && ready; then
    echo "✓ stack is up and a test scrape succeeded ($((i * 4))s)"
    exit 0
  fi
  sleep 4
done

echo "✗ stack did not become ready in time." >&2
echo "  debug: (cd '$REPO_ROOT' && docker compose ps && docker compose logs --tail=50 api playwright-service)" >&2
exit 1
