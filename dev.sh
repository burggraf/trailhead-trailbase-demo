#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAILBASE_URL="${TRAILBASE_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
MAILPIT_URL="http://localhost:8025"
PIDS=()

log() { printf '\033[1;32m[trailhead]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[trailhead]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  trap - INT TERM EXIT
  if ((${#PIDS[@]})); then
    log "Stopping services…"
    kill -TERM "${PIDS[@]}" 2>/dev/null || true
    for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
  fi
}
trap cleanup INT TERM EXIT

for command in trail cargo rustup node npm curl mailpit; do
  command -v "$command" >/dev/null || fail "Missing required command: $command"
done

cd "$ROOT"
rustup target list --installed | grep -qx wasm32-wasip2 || rustup target add wasm32-wasip2

if curl -fsS "$MAILPIT_URL/readyz" >/dev/null 2>&1; then
  log "Reusing Mailpit at $MAILPIT_URL"
else
  log "Starting Mailpit…"
  mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 \
    --database "$ROOT/traildepot/data/mailpit.db" --label Trailhead --disable-version-check &
  mailpit_pid="$!"
  PIDS+=("$mailpit_pid")
  for _ in {1..60}; do
    curl -fsS "$MAILPIT_URL/readyz" >/dev/null 2>&1 && break
    kill -0 "$mailpit_pid" 2>/dev/null || fail "Mailpit exited during startup"
    sleep .25
  done
  curl -fsS "$MAILPIT_URL/readyz" >/dev/null 2>&1 || fail "Mailpit did not become ready"
fi

WASM="traildepot/wasm/trailhead.wasm"
if [[ ! -f "$WASM" ]] || find extensions/trailhead/src extensions/trailhead/Cargo.toml -type f -newer "$WASM" -print -quit | grep -q .; then
  log "Building Trailhead WASM extension…"
  cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
  mkdir -p traildepot/wasm
  cp extensions/trailhead/target/wasm32-wasip2/release/trailhead.wasm "$WASM"
fi

if curl -fsS "$TRAILBASE_URL/api/healthcheck" >/dev/null 2>&1; then
  log "Reusing TrailBase at $TRAILBASE_URL"
else
  log "Starting TrailBase…"
  # TrailBase's --dev flag suppresses email delivery; explicit CORS keeps the SPA working while Mailpit receives auth mail.
  trail run --public-dir "$ROOT/web/public" --cors-allowed-origins="$WEB_URL" &
  trail_pid="$!"
  PIDS+=("$trail_pid")
  for _ in {1..60}; do
    curl -fsS "$TRAILBASE_URL/api/healthcheck" >/dev/null 2>&1 && break
    kill -0 "$trail_pid" 2>/dev/null || fail "TrailBase exited during startup"
    sleep .25
  done
  curl -fsS "$TRAILBASE_URL/api/healthcheck" >/dev/null 2>&1 || fail "TrailBase did not become ready"
fi

if [[ ! -d web/node_modules ]]; then
  log "Installing frontend dependencies…"
  npm --prefix web install
fi

if curl -fsS "$WEB_URL" >/dev/null 2>&1; then
  log "Reusing Vite at $WEB_URL"
else
  log "Starting Vite…"
  npm --prefix web run dev -- --host localhost &
  web_pid="$!"
  PIDS+=("$web_pid")
  for _ in {1..60}; do
    curl -fsS "$WEB_URL" >/dev/null 2>&1 && break
    kill -0 "$web_pid" 2>/dev/null || fail "Vite exited during startup"
    sleep .25
  done
  curl -fsS "$WEB_URL" >/dev/null 2>&1 || fail "Vite did not become ready"
fi

log "Ready: app $WEB_URL · TrailBase $TRAILBASE_URL · inbox $MAILPIT_URL · admin $TRAILBASE_URL/_/admin/"
log "Press Ctrl+C to stop services started by this script."

while :; do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || fail "A managed service exited"
  done
  sleep 1
done
