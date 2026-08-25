# Trailhead Email Branding Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Brand every TrailBase authentication email and align the application logo with the new elevated-explorer identity.

**Architecture:** Keep TrailBase's native MiniJinja templates in `traildepot/config.textproto`. Use self-contained, table-based email HTML with inline styles; share the visual language rather than adding a template build system. Add one static SVG logo for the React UI, while email uses a matching HTML-rendered mark so it does not depend on an unknown production asset origin.

**Tech Stack:** TrailBase textproto configuration, MiniJinja variables, HTML email, SVG, React, TypeScript.

---

### Task 1: Add the Trailhead logo

**Files:**
- Create: `web/public/trailhead-logo.svg`
- Modify: `web/src/components/AppShell.tsx`
- Modify: `web/src/pages/LoginPage.tsx`

1. Create a compact mountain, trail, and compass SVG using the existing forest and amber palette.
2. Replace the generic Compass icon in Trailhead brand lockups with the SVG.
3. Run `npm --prefix web run typecheck` and expect exit code 0.

### Task 2: Brand all TrailBase authentication emails

**Files:**
- Modify: `traildepot/config.textproto`

1. Add templates for user verification, change email, password reset, and OTP.
2. Use email-safe tables, inline CSS, descriptive preheaders, visible fallback URLs/codes, and only template variables supported by each TrailBase email type.
3. Keep verification/change-email actions on `{{ VERIFICATION_URL }}` and password reset on `{{ SITE_URL }}/_/auth/reset_password/update/{{ TOKEN }}`.

### Task 3: Verify

**Files:**
- Verify: `traildepot/config.textproto`
- Verify: `web/public/trailhead-logo.svg`

1. Parse the SVG as XML and inspect templates for all required fields, variables, and accessible links.
2. Run frontend tests, lint, typecheck, and production build.
3. Start an isolated TrailBase instance with a temporary depot copy to prove the textproto parses.
4. Trigger representative auth messages and inspect them in Mailpit when the local services are available.
