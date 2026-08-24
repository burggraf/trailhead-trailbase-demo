# Trailhead TrailBase Workshop App Design

## Purpose

Build Trailhead, a polished collaborative trip-planning SPA that demonstrates TrailBase through a realistic application. The project targets developers familiar with Supabase or PocketBase and emphasizes direct Record APIs, SQL access rules, realtime subscriptions, authentication, file storage, and Rust WebAssembly extensions.

The first version is a runnable local workshop. Production deployment, billing, offline sync, public share links, and paid map providers are out of scope.

## Architecture

Use a static React + Vite + TypeScript frontend under `web/`. The browser talks directly to TrailBase through the official JavaScript client for ordinary CRUD, queries, authentication, files, and realtime. TanStack Query handles request state; realtime events invalidate affected trip queries.

TrailBase Record APIs enforce tenant isolation using ACLs plus SQL access rules. Extensions are reserved for atomic, privileged, scheduled, or integration-heavy operations. The frontend never filters records as a security boundary.

## Product features

- Email/password registration, verification, login/logout, and recovery.
- Google OAuth configuration and login.
- Anonymous trial accounts and promotion to password accounts.
- Profile CRUD, built-in TrailBase avatar management, and account settings.
- Private trips with explicit owner/editor/viewer membership.
- Trip CRUD, destination, dates, status, notes, and uploaded cover image.
- Collaborative itinerary and checklist CRUD.
- Pending invitations and secure acceptance.
- Realtime itinerary, checklist, membership, and activity updates.
- Weather and destination briefing from Nominatim and Open-Meteo.
- An in-app TrailBase inspector explaining the API or extension behind each screen.
- A Supabase/PocketBase-to-TrailBase comparison and two-user workshop guide.

## Data model

All application tables are SQLite `STRICT` tables with UUIDv7 primary keys where applicable, foreign keys, checks, and timestamp triggers.

- `profiles`: one row per `_user`; display name, bio, and home location.
- `trips`: destination, dates, status, notes, coordinates, and a `std.FileUpload` cover.
- `trip_members`: trip/user association with owner, editor, or viewer role.
- `trip_invites`: hashed token, recipient email, role, expiry, inviter, and acceptance state.
- `itinerary_items`: dated activities, place, notes, cost, order, and creator.
- `checklist_items`: text, assignee, completion, order, and creator.
- `weather_briefings`: forecast summary, source JSON, and fetch timestamp.
- `activity_events`: append-only visible trip activity.

`trip_members` is the tenant boundary. Read rules require membership. Mutations require the appropriate role and validate creator/user fields against `_USER_.id`. Trip creation and invitation acceptance use extension transactions so related records appear atomically. Cascading foreign keys clean up tenant data.

## Rust extension

One component at `extensions/trailhead` registers all handlers and jobs:

- `GET /trailhead/whoami`
- `POST /trailhead/trips`
- `POST /trailhead/trips/{id}/invites`
- `GET /trailhead/invites`
- `POST /trailhead/invites/{token}/accept`
- `POST /trailhead/trips/{id}/briefing`
- hourly stale-forecast refresh job
- daily expired-invitation cleanup job

The component demonstrates request user context, JSON parsing and responses, path parameters, parameterized SQL, transactions, outbound HTTP, error mapping, logging, jobs, and the WASM build/install cycle. Request handlers verify current-user membership or role. Jobs have system context and use narrowly scoped queries.

Nominatim supplies geocoding and Open-Meteo supplies forecasts without API keys. Successful responses are cached or persisted, provider limits are respected, and upstream failures preserve the last successful briefing.

## Frontend

Routes:

- `/login`, `/register`, `/auth/callback`
- `/` trip dashboard and pending invitations
- `/trips/:tripId` overview, itinerary, checklist, members, activity, and weather
- `/profile`
- `/settings`
- `/learn`

The visual direction uses warm stone surfaces, deep evergreen navigation, topographic accents, amber highlights, destination photography, spacious cards, responsive layouts, and dark mode. Accessibility includes semantic forms, labels, focus visibility, keyboard operation, confirmations, loading states, and clear errors.

The client calls named TrailBase APIs directly through small query hooks rather than a generic repository abstraction. An inspector drawer exposes relevant API names, rules, realtime subscriptions, and extension routes with copyable examples.

## Development workflow

`./dev.sh` is the application supervisor. It checks required tools, builds and installs a stale/missing WASM component, starts TrailBase in development mode when needed, waits for readiness, starts Vite when needed, and traps termination to stop only child processes it owns.

`trail mcp` is a stdio server and must be launched by its MCP client. `mcp.sh` remains the client command; no separate manually opened MCP terminal is required.

## Errors and verification

Frontend errors distinguish authentication, forbidden, validation, conflict, network, and provider failures. Extensions return consistent JSON errors without exposing SQL or provider internals.

Verification includes Rust tests for pure logic, extension smoke tests, frontend type-check/lint/build, an owner/editor/viewer/outsider authorization script, upload/download checks, a two-browser realtime walkthrough, and a complete `./dev.sh` startup/readiness/shutdown check.
