# Email Trip Invitations Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace manually shared invitation tokens with formatted Mailpit/Resend emails, explicit accept/decline UI, owner invitation controls, and a once-per-session pending-invitation redirect.

**Architecture:** Keep pending invitations as email-bound database rows and identify them internally by UUID. The Rust WASM extension owns all invitation authorization, transactions, account-state-aware email rendering, Mailpit/Resend delivery, and protected provider settings. React adds one invitation page and reuses the existing query/auth shell without adding dependencies or a generalized mail abstraction.

**Tech Stack:** SQLite migrations, Rust 2024/WASI (`trailbase-wasm`), Mailpit HTTP API, Resend HTTP API, React 19, React Router, TanStack Query, TypeScript, Vitest.

---

### Task 1: Replace token invitation persistence and APIs

**Files:**
- Create: `traildepot/migrations/main/U1787587205__email_trip_invitations.sql`
- Modify: `scripts/authorization-smoke.sh`
- Modify: `extensions/trailhead/src/lib.rs`

**Steps:**
1. Change the authorization smoke script to consume invitation IDs, accept by ID, list owner invitations, cancel an invitation, and prove a cancelled invitation cannot be accepted.
2. Run `scripts/authorization-smoke.sh` against the current extension and verify it fails because create-invite does not return an ID.
3. Add a migration that rebuilds `trip_invites` as pending-only rows with unique `(trip_id, email)`, delivery status, expiry, and last-send timestamp; preserve only live unaccepted legacy invitations.
4. Replace token generation/acceptance with email-bound create-or-renew, list, accept, decline, owner-list, resend, and cancel handlers. Keep acceptance transactional and verify email, expiry, and owner authorization at the shared route boundary.
5. Build and restart the local component, then run the smoke script and verify the new authorization lifecycle passes.
6. Commit the backend lifecycle.

### Task 2: Add formatted Mailpit and Resend delivery

**Files:**
- Modify: `extensions/trailhead/src/lib.rs`
- Modify: `extensions/trailhead/README.md`

**Steps:**
1. Extend the smoke check to verify Mailpit receives an invitation with the app invitation URL and no manually shared token.
2. Run the check and verify it fails before delivery exists.
3. Add minimal HTML escaping and account-state-aware subject/body rendering.
4. Send through Mailpit `POST /api/v1/send` when no protected Resend settings exist; otherwise send through `POST https://api.resend.com/emails` with authorization, user-agent, and idempotency headers.
5. Add admin-only GET/POST email-settings routes backed by component preferences; never return the API key.
6. Record `sent` or `failed` delivery state without rolling back the invitation.
7. Rebuild/restart and verify the Mailpit delivery check passes.
8. Document local Mailpit testing and later Resend setup, then commit.

### Task 3: Add recipient invitation page and session redirect

**Files:**
- Create: `web/src/pages/InvitationsPage.tsx`
- Create: `web/src/pages/InvitationsPage.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/auth.tsx`
- Modify: `web/src/pages/LoginPage.tsx`
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/components/AppShell.tsx`
- Modify: `web/src/types.ts`

**Steps:**
1. Write failing Vitest cases for signed-out account/sign-in choices, signed-in accept/decline actions, and the persistent pending count.
2. Run the targeted test and verify it fails because the page does not exist.
3. Add the public `/invitations` route: signed-out visitors get account/sign-in actions; signed-in visitors get invitation cards and explicit Accept/Decline actions.
4. Preserve `/invitations` through protected-route and password-login redirects.
5. Remove the dashboard token form.
6. Query pending invitations in `AppShell`, redirect once per user/session, and show an all-breakpoint Invitations link with count badge.
7. Run targeted tests, then all frontend tests, typecheck, and lint.
8. Commit the recipient experience.

### Task 4: Add owner invitation management

**Files:**
- Create: `web/src/pages/TripPage.test.tsx`
- Modify: `web/src/pages/TripPage.tsx`
- Modify: `web/src/types.ts`

**Steps:**
1. Write a failing focused UI test proving owners can see pending invitation delivery/expiry and invoke resend/cancel.
2. Run it and verify it fails against the token UI.
3. Replace token display/copy with sent/failed feedback and pending invitation cards.
4. Wire resend, cancel, role change through reinvitation, and query invalidation.
5. Run targeted and complete frontend checks.
6. Commit owner management.

### Task 5: Final verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/workshop.md`

**Steps:**
1. Update project/workshop documentation to describe email invitations, Mailpit testing, explicit consent, and production Resend configuration.
2. Run Rust format, clippy, and WASM release build.
3. Run frontend tests, lint, typecheck, and production build.
4. Restart TrailBase with the built WASM and run `scripts/authorization-smoke.sh`.
5. Inspect `git diff --check` and `git status --short`.
6. Commit final documentation and verification fixes.
