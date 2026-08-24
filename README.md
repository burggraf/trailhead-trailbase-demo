# Trailhead

A collaborative trip planner built to teach TrailBase through a real client-side application.

**Stack:** React 19 · Vite · TypeScript · Tailwind/shadcn-style components · TanStack Query · TrailBase Record APIs · SQLite · Rust WASM

## Quick start

Requirements: `trail`, Rust with `wasm32-wasip2`, Node, npm, and curl.

```bash
./dev.sh
```

Open:

- App: http://localhost:5173
- TrailBase admin: http://localhost:4000/_/admin/
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
- One Rust WASM component with six HTTP routes, request user context, SQL transactions, outbound Nominatim/Open-Meteo requests, and two scheduled jobs

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

scripts/authorization-smoke.sh
```

## TrailBase caveats shown intentionally

- JWT auth tokens remain valid until their short expiry even after logout; refresh tokens are revocable.
- Anonymous users cannot sign in again after losing/revoking their only session. OAuth promotion is not currently supported.
- Rust guest APIs are still unstable, so `trailbase-wasm` is pinned exactly.
- Local email falls back to the host sendmail setup unless SMTP is configured.
- WASM files are discovered at startup; restart TrailBase after rebuilding a component.
