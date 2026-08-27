# Trailhead Rust WASM component

One TrailBase component containing user-aware HTTP handlers and scheduled jobs. See [`../../docs/workshop.md`](../../docs/workshop.md#8-wasm-extension) for the route tour.

```bash
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
cp extensions/trailhead/target/wasm32-wasip2/release/trailhead.wasm traildepot/wasm/
```

Restart TrailBase, then run `scripts/authorization-smoke.sh` from the repository root.

Invitation email uses Mailpit automatically when Resend is not configured. Open `http://localhost:8025` after inviting someone; no Resend account is needed for local development.

For production, an authenticated TrailBase admin can `POST /trailhead/admin/email-settings` with CSRF protection:

```json
{
  "api_key": "re_...",
  "from": "Trailhead <trips@example.com>",
  "app_url": "https://trips.example.com"
}
```

The sender domain must already be verified in Resend. Posting an empty `api_key` returns delivery to local Mailpit mode. `GET /trailhead/admin/email-settings` reports whether Resend is configured without exposing the key.

## Gemini itinerary suggestions

An authenticated TrailBase admin can configure Gemini through `POST /trailhead/admin/ai-settings`; `GET /trailhead/admin/ai-settings` reports `configured`, `model`, and `key_count`. Both routes require an admin token, and POST also requires the matching CSRF protection supplied by TrailBase's authenticated client.

```json
{
  "api_keys": "AIza...primary\nAIza...backup",
  "model": "gemini-2.5-flash-lite"
}
```

The component trims and deduplicates newline-separated keys, stores them in protected component preferences, and never returns them from GET. Posting no usable keys removes the configuration. Never put real keys in committed files, browser code, logs, chat, or shell history. Restrict each key to the Gemini API and prefer current Google AI Studio authorization keys. Keys in the same Google project share project quota, so adding keys does not multiply that quota.

`POST /trailhead/trips/{id}/suggestions` is available only to the trip owner and editors. The component sends bounded trip and itinerary context to Gemini, requests Google Search grounding, validates the response, and returns no more than eight suggestions with safe HTTPS grounding sources. The browser holds results temporarily; only a scheduled itinerary item and its activity event are persisted.

Google may use free-tier prompts and responses to improve its products. Use demo-safe data and verify suggestions before scheduling. Gemini model availability, quotas, pricing, grounded source availability, and generated results can change.

The SDK is pinned because TrailBase documents the Rust guest API as unstable. Native tests cannot currently link the SDK’s exported WASI symbols; use wasm clippy/build plus HTTP smoke tests. Pure helper tests remain in the source for when native linking becomes available.
