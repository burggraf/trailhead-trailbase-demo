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

The SDK is pinned because TrailBase documents the Rust guest API as unstable. Native tests cannot currently link the SDK’s exported WASI symbols; use wasm clippy/build plus HTTP smoke tests. Pure helper tests remain in the source for when native linking becomes available.
