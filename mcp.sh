#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec trail --depot="$ROOT/traildepot" mcp --user="${TRAILBASE_MCP_USER:-admin@localhost}" "${TRAILBASE_URL:-http://localhost:4000}"
