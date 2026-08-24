#!/bin/sh
set -eu

response=$(curl --fail --silent --show-error "${TRAILBASE_URL:-http://localhost:4000}/hello")
[ "$response" = '{"message":"Hello, world!"}' ] || {
  echo "unexpected response: $response" >&2
  exit 1
}
