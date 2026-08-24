#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${TRAILBASE_URL:-http://localhost:4000}"
cd "$ROOT"

curl -fsS "$BASE/api/healthcheck" >/dev/null || { echo "TrailBase is not running at $BASE" >&2; exit 1; }

mint() {
  trail --depot=traildepot user mint "$1" 2>&1 | sed -n 's/^auth: "Bearer \(.*\)"$/\1/p' | head -1
}
json() {
  python3 -c "import json,sys; print(json.load(sys.stdin)$1)"
}
sub() {
  python3 -c 'import base64,json,sys; p=sys.argv[1].split(".")[1]; p += "="*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p))["sub"])' "$1"
}
request() {
  local token="$1" method="$2" path="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body" "$BASE$path"
  else
    curl -fsS -X "$method" -H "Authorization: Bearer $token" "$BASE$path"
  fi
}

ALICE="$(mint alice@example.com)"; BOB="$(mint bob@example.com)"; CAROL="$(mint carol@example.com)"; EVE="$(mint eve@example.com)"
[[ -n "$ALICE" && -n "$BOB" && -n "$CAROL" && -n "$EVE" ]] || { echo "Workshop users are missing; restart TrailBase to apply migrations" >&2; exit 1; }
ALICE_ID="$(sub "$ALICE")"

TRIP="$(request "$ALICE" POST /trailhead/trips "{\"title\":\"Authorization smoke $(date +%s)\",\"destination\":\"Innsbruck, Austria\",\"start_date\":\"2026-10-01\",\"end_date\":\"2026-10-04\",\"status\":\"planning\",\"notes\":\"temporary smoke-test trip\"}" | json '["id"]')"

BOB_TOKEN="$(request "$ALICE" POST "/trailhead/trips/$TRIP/invites" '{"email":"bob@example.com","role":"editor"}' | json '["token"]')"
CAROL_TOKEN="$(request "$ALICE" POST "/trailhead/trips/$TRIP/invites" '{"email":"carol@example.com","role":"viewer"}' | json '["token"]')"
request "$BOB" POST "/trailhead/invites/$BOB_TOKEN/accept" >/dev/null
request "$CAROL" POST "/trailhead/invites/$CAROL_TOKEN/accept" >/dev/null

ITEM="$(request "$ALICE" POST /api/records/v1/itinerary_items "{\"trip_id\":\"$TRIP\",\"created_by\":\"$ALICE_ID\",\"day\":\"2026-10-01\",\"start_time\":\"09:00:00\",\"title\":\"Tenant-rule test\",\"place\":\"Old Town\",\"notes\":\"\",\"position\":0}" | json '["ids"][0]')"

request "$BOB" PATCH "/api/records/v1/itinerary_items/$ITEM" '{"title":"Editor update allowed"}' >/dev/null

CAROL_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "Authorization: Bearer $CAROL" -H 'Content-Type: application/json' -d '{"title":"Viewer update forbidden"}' "$BASE/api/records/v1/itinerary_items/$ITEM")"
[[ "$CAROL_STATUS" == 403 ]] || { echo "Expected viewer update 403, got $CAROL_STATUS" >&2; exit 1; }

EVE_COUNT="$(request "$EVE" GET /api/records/v1/trips | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["records"]))')"
[[ "$EVE_COUNT" == 0 ]] || { echo "Outsider could list tenant trips" >&2; exit 1; }

BOB_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $BOB" "$BASE/api/records/v1/trips/$TRIP")"
[[ "$BOB_STATUS" == 200 ]] || { echo "Expected editor read 200, got $BOB_STATUS" >&2; exit 1; }

EVE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $EVE" "$BASE/api/records/v1/trips/$TRIP")"
[[ "$EVE_STATUS" == 404 || "$EVE_STATUS" == 403 ]] || { echo "Expected outsider read denial, got $EVE_STATUS" >&2; exit 1; }

request "$ALICE" DELETE "/api/records/v1/trips/$TRIP" >/dev/null
printf 'PASS owner created/deleted; editor updated; viewer mutation denied; outsider isolated\n'
