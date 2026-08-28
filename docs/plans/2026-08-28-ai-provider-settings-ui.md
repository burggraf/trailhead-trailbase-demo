# AI Provider Settings UI Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add an authenticated, admin-only UI for configuring Gemini and Tavily in development and production.

**Architecture:** Extend `SettingsPage` with a metadata query and write-only credential form backed by the existing admin WASM endpoint. Keep secrets out of React Query mutation state and retain backend authorization as the security boundary.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest/Testing Library, TrailBase authenticated client.

---

### Task 1: Admin settings behavior

**Files:**
- Create: `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/pages/SettingsPage.tsx`

1. Write failing tests for non-admin visibility, redacted admin metadata, credential save/reset, and confirmed removal.
2. Run `npm --prefix web test -- SettingsPage.test.tsx` and verify the tests fail because the card is absent.
3. Add the admin-only query and form using `extension`; keep credential values in `FormData`, not mutation/query state.
4. Run the focused tests and verify they pass.
5. Commit the UI and tests.

### Task 2: Setup documentation

**Files:**
- Modify: `README.md`
- Modify: `extensions/trailhead/README.md`
- Modify: `docs/workshop.md`

1. Make the Account settings card the preferred local and production setup path.
2. Retain the HTTP endpoint instructions for automation and explain that credentials are write-only and must be configured separately per deployment.
3. Run `git diff --check`.
4. Commit documentation.

### Task 3: Verification

1. Run `npm --prefix web test`.
2. Run `npm --prefix web run lint`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
3. Run the Rust test, fmt, WASM Clippy, and release build gates to confirm the existing protected endpoint remains healthy.
4. Request final code review and resolve substantive findings.
