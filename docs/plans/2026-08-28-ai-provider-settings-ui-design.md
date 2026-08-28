# AI Provider Settings UI Design

## Goal

Give TrailBase administrators a safe, simple interface for configuring the Gemini and Tavily credentials used by **Suggest things to do**, with the same workflow in local development and production.

## Interface

Add an **AI provider settings** card to the existing Account settings page. Render and query it only when the authenticated TrailBase user has `admin === true`; the existing admin-only WASM routes remain the security boundary.

The card shows safe metadata from `GET /trailhead/admin/ai-settings`: configured state, model, Gemini key count, and Tavily status. Existing secrets are never loaded into the browser. The form accepts a required primary Gemini key, optional backup Gemini key, required Tavily key, and model. Because credentials are write-only, saving replaces the complete configuration and the form explains that all keys must be re-entered.

Saving uses the existing authenticated TrailBase client and `POST /trailhead/admin/ai-settings`, so bearer and CSRF handling work identically on localhost and the deployed origin. Secret values are read from uncontrolled form fields, are not placed in React Query state, and the form is reset immediately after success. A confirmed **Remove configuration** action posts empty keys.

## Feedback and safety

The card displays loading, success, and error states; disables actions while saving; and labels configured versus missing providers. Frontend hiding is convenience only—the backend continues to reject non-admin requests. No keys are persisted in local storage, query caches, source files, environment variables, or logs.

## Testing

Add SettingsPage tests proving non-admin users neither see nor query the card, admins see redacted metadata, saving sends the expected combined key payload and clears fields, and removal requires confirmation. Run the full frontend test, lint, typecheck, build, Rust, and diff gates.
