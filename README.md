# Trailhead

A collaborative trip planner built to teach TrailBase through a real client-side application.

**Stack:** React 19 · Vite · TypeScript · Tailwind/shadcn-style components · TanStack Query · TrailBase Record APIs · SQLite · Rust WASM

## Quick start

Requirements: `trail`, Rust with `wasm32-wasip2`, Node, npm, curl, and Mailpit.

```bash
brew install mailpit # once on macOS
./dev.sh
```

Open:

- App: http://localhost:5173
- TrailBase admin: http://localhost:4000/_/admin/
- Mailpit inbox: http://localhost:8025
- Record API health: http://localhost:4000/api/healthcheck

Local workshop accounts all use password `secret123`:

| Account | Intended role |
|---|---|
| `alice@example.com` | trip owner |
| `bob@example.com` | editor |
| `carol@example.com` | viewer |
| `eve@example.com` | outsider |

These fixed credentials are migration seed data for local learning only.

## What it demonstrates

- Password auth, recovery, verification, OTP/MFA UI, anonymous sign-in and promotion
- Google OAuth configuration through TrailBase admin
- Strict SQLite tables exposed as typed REST Record APIs
- Multi-tenant owner/editor/viewer rules using `_USER_`, `_REQ_`, `_ROW_`, and `trip_members`
- CRUD, filtering, ordering, cursor-ready lists, views, constraints, and cascades
- Realtime itinerary, checklist, membership, activity, and weather subscriptions
- Built-in auth avatars and `std.FileUpload` trip covers
- One Rust WASM component with request user context, SQL transactions, consent-based email invitations, Tavily-backed Gemini itinerary suggestions, outbound HTTP, and two scheduled jobs

See [`docs/workshop.md`](docs/workshop.md) for the guided tour.

## Project map

```text
web/                         Static React SPA
traildepot/config.textproto  Record APIs and SQL access rules
traildepot/migrations/main/  Strict schema and local seed users
extensions/trailhead/        Rust WASM component
scripts/                     Authorization smoke tests
docs/                        Design, plan, and workshop
```

## Google OAuth

1. In Google Cloud, create an OAuth web client.
2. Add `http://localhost:4000/api/auth/v1/oauth/google/callback` as an authorized redirect URI.
3. Open TrailBase admin → Settings → Auth → OAuth providers.
4. Add Google with the client ID and secret, then restart TrailBase.
5. Use **Google, OTP, or MFA** on Trailhead’s login screen.

Secrets are written below `traildepot/secrets/`, which is ignored by Git.

## Gemini itinerary suggestions (optional)

Trip owners and editors can ask for current events and attractions from the Itinerary tab. The component sends only the destination and dates to Tavily Basic Search, then sends bounded trip context plus bounded Tavily snippets treated as untrusted data to Gemini 3.1 Flash-Lite for ungrounded generation. Suggestions stay ephemeral in the browser until scheduled; they are not shared or stored as suggestion records. Sources shown to users are validated, normalized HTTPS Tavily URLs allowlisted by matching Tavily title and URL.

Configure the component through admin-only `GET`/`POST /trailhead/admin/ai-settings`. Use an authenticated TrailBase admin token and its required CSRF token for POST (or an authenticated TrailBase client that supplies both). The POST body is:

```json
{
  "api_keys": "AIza...primary\nAIza...backup",
  "tavily_api_key": "tvly-your-key-placeholder",
  "model": "gemini-3.1-flash-lite"
}
```

Keys are kept in protected component preferences. GET returns only `configured`, `model`, `key_count`, and `search_configured`; it never leaks keys. Keep keys server-side, restrict Gemini keys to the Gemini API, and prefer current Google AI Studio authorization keys. Multiple keys from one Google project share that project's quota. Tavily's free Researcher tier includes 1,000 credits/month with no card required; Basic Search costs one credit per generation. See [Tavily pricing](https://www.tavily.com/pricing) and [Tavily credits](https://docs.tavily.com/documentation/api-credits).

Google may use free-tier prompts and responses to improve its products. Use demo-safe trip content, review generated results and validated source links, and expect provider/model availability, quotas, pricing, search results, and generated results to vary. See [`extensions/trailhead/README.md`](extensions/trailhead/README.md) for component details.

## MCP

`trail mcp` is a **stdio** server. An MCP client must launch it; it is not a network daemon and should not be backgrounded by `dev.sh`. Configure the client command as:

```text
/absolute/path/to/this/repo/mcp.sh
```

`mcp.sh` mints admin tokens from the local depot and connects to the TrailBase HTTP server. No separate MCP terminal is needed.

## Commands

```bash
npm --prefix web test
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build

cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2

python3 scripts/invitation-migration-test.py
scripts/authorization-smoke.sh
```

## Production hosting

Build the SPA and let TrailBase serve it from the same public origin used by auth emails:

```bash
npm --prefix web run build
trail run --public-dir web/dist --spa
```

Set `server.site_url` to that public HTTPS origin. The branded authentication emails load `trailhead-logo-email.png` from it; `dev.sh` serves the same asset locally from `web/public`.

### Resend invitation email

No Resend setup is required in development: invitation messages are posted to Mailpit and appear at <http://localhost:8025>.

For production:

1. Create a Resend account and verify the sending domain.
2. Create a sending API key.
3. As an authenticated TrailBase admin, `POST /trailhead/admin/email-settings` with the required CSRF header and:

```json
{
  "api_key": "re_...",
  "from": "Trailhead <trips@example.com>",
  "app_url": "https://trips.example.com"
}
```

The component stores these protected preferences and never returns the API key. The `app_url` must be the HTTPS origin serving the SPA so email recipients arrive at `/invitations`.

## TrailBase caveats shown intentionally

- JWT auth tokens remain valid until their short expiry even after logout; refresh tokens are revocable.
- Anonymous users cannot sign in again after losing/revoking their only session. OAuth promotion is not currently supported.
- Rust guest APIs are still unstable, so `trailbase-wasm` is pinned exactly.
- Local auth and invitation email is captured by Mailpit; production auth email uses SMTP while invitations use Resend.
- WASM files are discovered at startup; restart TrailBase after rebuilding a component.
