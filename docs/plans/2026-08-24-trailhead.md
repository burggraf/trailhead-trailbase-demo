# Trailhead TrailBase Workshop App Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a local-first collaborative trip-planning SPA that demonstrates TrailBase authentication, tenant access rules, CRUD, realtime, files, views, Rust WASM handlers, outbound HTTP, transactions, and jobs.

**Architecture:** A static React/Vite client calls TrailBase Record APIs directly for routine data access. SQL access rules enforce trip membership and roles; one Rust WASM component handles atomic trip/invitation workflows, external weather APIs, and scheduled maintenance.

**Tech Stack:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Router, TrailBase JavaScript SDK, SQLite migrations, Rust 2024, `trailbase-wasm` 0.6.0, Nominatim, Open-Meteo.

---

### Task 1: Establish the frontend shell

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.app.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/index.css`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/components/ui/*`

**Steps:**
1. Scaffold a minimal Vite React TypeScript application.
2. Add only the dependencies required by the approved design.
3. Configure Tailwind and the shadcn alias/theme variables.
4. Add a smoke test or build check that fails before the app entrypoint exists.
5. Implement the responsive shell, routing placeholder, typography, colors, dark mode, and accessible focus styles.
6. Run `npm --prefix web run build` and expect success.

### Task 2: Create the strict database schema

**Files:**
- Create: `traildepot/migrations/main/U<timestamp>__create_trailhead.sql`
- Create: `traildepot/migrations/main/U<timestamp>__seed_trailhead.sql`

**Steps:**
1. Write schema assertions that inspect `sqlite_schema`, foreign keys, and constraints and fail before migration.
2. Create `profiles`, `trips`, `trip_members`, `trip_invites`, `itinerary_items`, `checklist_items`, `weather_briefings`, and `activity_events` as `STRICT` tables.
3. Use UUIDv7 keys, `_user` foreign keys, role/status checks, unique membership constraints, file-upload JSON schema constraints, cascades, indexes, and updated-at triggers.
4. Add typed read views for dashboard/member/profile expansion where they reduce client round trips.
5. Seed two verified workshop users only if local TrailBase conventions permit safe idempotent setup; otherwise provide a script using `trail user` commands.
6. Start TrailBase against a clean temporary depot and verify migrations apply.

### Task 3: Configure Record APIs and tenant rules

**Files:**
- Modify: `traildepot/config.textproto`
- Create: `scripts/authorization-smoke.sh`

**Steps:**
1. Write the authorization script first with owner, editor, viewer, and outsider expectations.
2. Configure a named Record API for each client-facing table/view.
3. Enable subscriptions for itinerary, checklist, memberships, weather, and activity APIs.
4. Add authenticated ACLs and SQL access rules based on `_USER_`, `_REQ_`, `_ROW_`, and `trip_members`.
5. Prevent reassignment of tenant/user ownership during updates and prevent users from creating their own memberships.
6. Run the smoke test and verify cross-tenant reads/writes are rejected while role-appropriate actions succeed.

### Task 4: Implement the Rust WASM component

**Files:**
- Create: `extensions/trailhead/Cargo.toml`
- Create: `extensions/trailhead/src/lib.rs`
- Create: `extensions/trailhead/README.md`
- Create: `extensions/trailhead/smoke-test.sh`

**Steps:**
1. Add tests for pure invite expiry/token hashing, role validation, upstream response parsing, and error mapping.
2. Implement shared helpers only where at least two handlers use them.
3. Implement `GET /trailhead/whoami` using `Request::user()`.
4. Implement transactional trip creation with owner membership.
5. Implement owner-authorized invitation creation, authenticated pending-invite listing, and transactional recipient-bound acceptance.
6. Implement membership-authorized Nominatim geocoding and Open-Meteo briefing fetch/persistence.
7. Implement hourly stale-forecast refresh and daily expired-invite cleanup jobs.
8. Use parameterized SQL, bounded inputs, consistent JSON errors, and no secret/provider detail leakage.
9. Run native tests for pure functions where linkable, clippy for `wasm32-wasip2`, release build, install, restart, and HTTP smoke tests.

### Task 5: Add TrailBase client and authentication

**Files:**
- Create: `web/src/lib/trailbase.ts`
- Create: `web/src/lib/api.ts`
- Create: `web/src/types/models.ts`
- Create: `web/src/auth/AuthProvider.tsx`
- Create: `web/src/auth/ProtectedRoute.tsx`
- Create: `web/src/pages/LoginPage.tsx`
- Create: `web/src/pages/RegisterPage.tsx`
- Create: `web/src/pages/AuthCallbackPage.tsx`
- Create: `web/src/pages/SettingsPage.tsx`

**Steps:**
1. Add an auth-state smoke test around protected routing.
2. Initialize one TrailBase client from `VITE_TRAILBASE_URL`.
3. Implement session state, login/logout, registration, Google OAuth redirect, anonymous login, and anonymous promotion using current SDK APIs or TrailBase’s built-in auth UI where it is the supported path.
4. Add password recovery, verification, email/username/password changes, avatar management, and account deletion through supported APIs/UI links.
5. Map auth errors into concise, accessible form messages.
6. Run frontend type-check and build.

### Task 6: Implement profiles, dashboard, and invitations

**Files:**
- Create: `web/src/pages/DashboardPage.tsx`
- Create: `web/src/pages/ProfilePage.tsx`
- Create: `web/src/features/trips/TripCard.tsx`
- Create: `web/src/features/trips/CreateTripDialog.tsx`
- Create: `web/src/features/invites/PendingInvites.tsx`
- Create: `web/src/components/AppShell.tsx`

**Steps:**
1. Add a basic rendering check for empty, loading, and populated dashboard states.
2. Implement profile read/upsert and built-in avatar upload.
3. List authorized trips through the dashboard view.
4. Create trips through the extension and accept/reject pending invitations.
5. Add responsive navigation, user menu, dark mode, errors, skeletons, and empty states.
6. Run type-check and production build.

### Task 7: Implement collaborative trip CRUD and realtime

**Files:**
- Create: `web/src/pages/TripPage.tsx`
- Create: `web/src/features/trips/TripOverview.tsx`
- Create: `web/src/features/itinerary/ItineraryPanel.tsx`
- Create: `web/src/features/checklist/ChecklistPanel.tsx`
- Create: `web/src/features/members/MembersPanel.tsx`
- Create: `web/src/features/activity/ActivityPanel.tsx`
- Create: `web/src/features/weather/WeatherPanel.tsx`
- Create: `web/src/hooks/useRecordSubscription.ts`

**Steps:**
1. Add focused checks for subscription cleanup and query invalidation.
2. Implement trip edit/delete and cover upload.
3. Implement itinerary and checklist create/read/update/delete with role-sensitive controls.
4. Implement owner invitation and membership management UI.
5. Implement activity rendering and weather briefing refresh.
6. Subscribe to trip-scoped APIs, invalidate affected query keys, and clean up streams on route/user changes.
7. Verify two browsers see authorized updates and an outsider receives none.

### Task 8: Add the learning inspector and workshop documentation

**Files:**
- Create: `web/src/components/TrailBaseInspector.tsx`
- Create: `web/src/pages/LearnPage.tsx`
- Create: `README.md`
- Create: `docs/workshop.md`
- Create: `.env.example`

**Steps:**
1. Add inspector metadata for each route/feature: Record API, rule concept, subscription, or extension.
2. Build the inspector drawer with copyable requests and links to local admin/schema endpoints.
3. Document concept mapping from Supabase RLS/functions/storage/realtime and PocketBase rules/hooks/files/realtime.
4. Document Google OAuth setup, local email behavior, anonymous-user caveats, WASM build/install, schema/config locations, and two-user testing.
5. Run link/path checks and frontend build.

### Task 9: Replace the development scripts

**Files:**
- Modify: `dev.sh`
- Modify: `mcp.sh`

**Steps:**
1. Write a shell-level startup/shutdown smoke test or deterministic manual check.
2. Make `dev.sh` validate tools, conditionally build/install stale WASM, detect/start TrailBase, wait for readiness, and detect/start Vite.
3. Track only owned PIDs and trap `INT`, `TERM`, and `EXIT` for graceful cleanup.
4. Keep `mcp.sh` as the stdio command launched by an MCP client; document why it is not a daemon managed by `dev.sh`.
5. Run `shellcheck` when installed and `bash -n dev.sh mcp.sh` always.
6. Start `./dev.sh`, verify both HTTP services, send `SIGINT`, and verify owned processes exit.

### Task 10: Final verification

**Files:**
- Modify only files required by failures.

**Steps:**
1. Run Rust formatting, tests, clippy, and WASM release build.
2. Run frontend lint, type-check, and production build.
3. Run migration/schema assertions against a clean temporary depot.
4. Run extension and authorization smoke tests.
5. Verify avatar and trip-cover upload/download.
6. Complete the documented owner/editor/viewer/outsider and two-browser realtime walkthrough.
7. Run the unified development-script lifecycle check.
8. Record exact results and any residual limitations in `README.md`.
