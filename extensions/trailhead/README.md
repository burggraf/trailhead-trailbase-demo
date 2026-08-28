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

The preferred setup is the admin-only **Account settings → AI provider settings** card in Trailhead. It uses the authenticated TrailBase client and works unchanged on localhost or a deployed origin. Existing secrets are write-only, so saving replaces the complete configuration and requires re-entering every key that should remain.

For automation, an authenticated TrailBase admin can configure Gemini and Tavily through `POST /trailhead/admin/ai-settings`. Both routes require an admin token; POST also requires the matching CSRF token supplied by TrailBase's authenticated client. GET returns only `configured`, `model`, `key_count`, and `search_configured`.

```json
{
  "api_keys": "AIza...primary\nAIza...backup",
  "tavily_api_key": "tvly-your-key-placeholder",
  "model": "gemini-3.1-flash-lite"
}
```

Configure each deployment separately; credentials are stored in its TrailBase data volume rather than in the SPA or WASM artifact. The component trims and deduplicates newline-separated Gemini keys, stores both secrets in protected component preferences, and never returns either key from GET. Posting no usable keys removes the configuration. Never put real keys in committed files, browser code, logs, chat, or shell history. Restrict Gemini keys to the Gemini API and prefer current Google AI Studio authorization keys. Keys in the same Google project share project quota, so adding keys does not multiply that quota. Tavily's free Researcher tier includes 1,000 credits/month with no card required; Basic Search costs one credit per generation. See [Tavily pricing](https://www.tavily.com/pricing) and [Tavily credits](https://docs.tavily.com/documentation/api-credits).

`POST /trailhead/trips/{id}/suggestions` is available only to the trip owner and editors. The component sends only the destination and dates to Tavily Basic Search, then sends bounded trip context plus bounded Tavily snippets treated as untrusted data to Gemini 3.1 Flash-Lite for ungrounded generation. It validates the response and returns six suggestions; sources are validated, normalized HTTPS Tavily URLs allowlisted by matching Tavily title and URL. The browser holds results temporarily; only a scheduled itinerary item and its activity event are persisted.

Google may use free-tier prompts and responses to improve its products. Use demo-safe data and verify suggestions before scheduling. Provider/model availability, quotas, pricing, Tavily results, and generated results can change.

The SDK is pinned because TrailBase documents the Rust guest API as unstable. Native tests cannot currently link the SDK’s exported WASI symbols; use wasm clippy/build plus HTTP smoke tests. Pure helper tests remain in the source for when native linking becomes available.
