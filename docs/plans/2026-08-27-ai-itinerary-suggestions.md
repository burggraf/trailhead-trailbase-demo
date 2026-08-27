# AI Itinerary Suggestions Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Let trip owners and editors generate grounded local activity suggestions with Gemini, temporarily review/dismiss them, and schedule selected suggestions into the existing itinerary.

**Architecture:** Extend the existing Rust WASM component with protected AI settings and one trip-scoped Gemini REST endpoint. Keep suggestions in React state only, reuse the existing itinerary/activity Record API writes, and add no dependency, database table, background job, or streaming protocol.

**Tech Stack:** Rust 2024/WASI (`trailbase-wasm`, `serde_json`, `wstd` HTTP), Gemini Developer API `generateContent` with Google Search grounding, React 19, TanStack Query, TypeScript, Testing Library, Vitest.

---

### Task 1: Add tested Gemini response validation helpers

**Files:**
- Modify: `extensions/trailhead/src/lib.rs:14-18, 50-90, 840-897`

**Step 1: Write failing pure helper tests**

Add tests under the existing `#[cfg(test)]` module for:

```rust
#[test]
fn orders_keys_from_trip_shard_and_wraps() {
    let keys = vec!["a".into(), "b".into(), "c".into()];
    assert_eq!(ordered_keys(&keys, &[0, 0, 0, 1]), vec!["b", "c", "a"]);
}

#[test]
fn validates_deduplicates_and_filters_grounded_suggestions() {
    let response = json!({
        "candidates": [{
            "content": {"parts": [{"text": r#"{"suggestions":[
                {"type":"event","title":"Night Market","description":"Local food stalls.","place":"Main Square","date":"2026-10-02","time":"18:30","sources":[{"title":"City","url":"https://city.example/event"}]},
                {"type":"event","title":"Night Market","description":"Duplicate.","place":"Main Square","date":"2026-10-02","time":"18:30","sources":[]},
                {"type":"attraction","title":"Too Late","description":"Outside trip.","place":"Museum","date":"2026-10-09","time":"","sources":[]}
            ]}"#}]},
            "groundingMetadata": {"groundingChunks": [{"web": {"title":"City","uri":"https://city.example/event"}}]}
        }]
    });
    let suggestions = parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04").expect("valid suggestions");
    assert_eq!(suggestions.len(), 1);
    assert_eq!(suggestions[0].sources.len(), 1);
}
```

Also test fenced JSON removal, invalid times, non-HTTPS/un-grounded sources, text truncation/rejection boundaries, eight-item cap, no usable suggestions, and retry classification for `401`, `403`, `429`, and `5xx` versus non-retryable `400`.

**Step 2: Run tests and verify RED**

Run:

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib
```

Expected: compilation failure because the AI helper types/functions do not exist. If the pinned WASI exports prevent native linking after compilation, retain the compile evidence and use the WASM checks in Step 5, matching the repository's documented limitation.

**Step 3: Implement the minimal pure helpers**

Add:

```rust
#[derive(Clone, Deserialize, Serialize)]
struct SuggestionSource { title: String, url: String }

#[derive(Clone, Deserialize, Serialize)]
struct AiSuggestion {
    #[serde(rename = "type")]
    kind: String,
    title: String,
    description: String,
    place: String,
    date: String,
    #[serde(default)]
    time: String,
    #[serde(default)]
    sources: Vec<SuggestionSource>,
}

#[derive(Deserialize)]
struct SuggestionEnvelope { suggestions: Vec<AiSuggestion> }
```

Implement only the required helpers:

- `ordered_keys(keys, trip_id)` starts at the final trip byte modulo key count and wraps once.
- `suggestion_prompt(...)` delimits untrusted trip fields, asks for 6–8 diverse event/attraction objects, requires dates inside the trip, and asks for compact JSON only.
- `candidate_text(response)` concatenates text parts from the first candidate.
- `grounding_sources(response)` collects HTTPS `groundingChunks[].web.uri/title` pairs.
- `parse_gemini_suggestions(response, start, end)` strips optional Markdown fences, parses `SuggestionEnvelope`, enforces type/date/time/length requirements, removes duplicate `(title, place, date)` values, caps at eight, and keeps only source URLs present in grounding metadata.
- `retryable_provider_status(status)` returns true only for `401`, `403`, `429`, and `5xx`.

Do not add a generalized provider trait or validation framework.

**Step 4: Run helper checks and verify GREEN**

Run:

```bash
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
```

Expected: all commands exit 0.

**Step 5: Commit**

```bash
git add extensions/trailhead/src/lib.rs
git commit -m "test: define AI suggestion validation"
```

### Task 2: Add protected AI settings, authorization, and Gemini failover

**Files:**
- Modify: `extensions/trailhead/src/lib.rs:14-40, 50-140, 380-530`
- Modify: `scripts/authorization-smoke.sh:40-75, 170-210`

**Step 1: Write the failing HTTP authorization checks**

After Bob and Carol accept their invitations, add checks against `POST /trailhead/trips/$TRIP/suggestions`:

```bash
OWNER_AI_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $ALICE" "$BASE/trailhead/trips/$TRIP/suggestions")"
EDITOR_AI_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $BOB" "$BASE/trailhead/trips/$TRIP/suggestions")"
VIEWER_AI_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $CAROL" "$BASE/trailhead/trips/$TRIP/suggestions")"
OUTSIDER_AI_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $EVE" "$BASE/trailhead/trips/$TRIP/suggestions")"
[[ "$OWNER_AI_STATUS" == 503 && "$EDITOR_AI_STATUS" == 503 ]] || { echo "Expected unconfigured AI 503 for planners" >&2; exit 1; }
[[ "$VIEWER_AI_STATUS" == 403 && "$OUTSIDER_AI_STATUS" == 403 ]] || { echo "Expected AI suggestion authorization denial" >&2; exit 1; }
```

Add a non-admin check for `/trailhead/admin/ai-settings` expecting `403`.

**Step 2: Run smoke test and verify RED**

Run against the current local app:

```bash
scripts/authorization-smoke.sh
```

Expected: failure because the suggestion/settings routes return `404`.

**Step 3: Implement protected settings routes**

Add `AI_SETTINGS_KEY`, `AiSettings`, and `AiSettingsInput`. Register:

```rust
routing::get("/trailhead/admin/ai-settings", get_ai_settings).require_admin(),
routing::post("/trailhead/admin/ai-settings", set_ai_settings).require_admin(),
routing::post("/trailhead/trips/{id}/suggestions", create_suggestions),
```

`POST /admin/ai-settings` accepts `{ "api_keys": "key1\nkey2", "model": "gemini-2.5-flash-lite" }`, trims/deduplicates at most ten keys, validates a `gemini-` model containing only ASCII letters, numbers, `.`, `_`, and `-`, and stores serialized settings with `prefs::set_prefs`. Empty keys delete the preference. `GET` returns only `{ configured, model, key_count }`.

**Step 4: Implement the trip-scoped provider call**

`create_suggestions` must:

1. Authenticate and decode trip/user IDs.
2. Query trip title, destination, start/end dates, notes, and role in one authorized query requiring `owner` or `editor`.
3. Query current itinerary titles, places, dates, and times for prompt context.
4. Return `503` with “AI suggestions haven’t been configured.” if settings are absent.
5. Build the prompt and Gemini request:

```json
{
  "contents": [{"parts": [{"text": "..."}]}],
  "tools": [{"googleSearch": {}}],
  "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096}
}
```

6. POST to `https://generativelanguage.googleapis.com/v1beta/models/{validated-model}:generateContent` with `content-type: application/json` and `x-goog-api-key`.
7. Try keys in `ordered_keys` order. Rotate only for retryable statuses or transport failure; stop on non-retryable provider rejection.
8. Parse and validate the first success with Task 1 helpers.
9. Return `{ "suggestions": [...] }`, or generic `502/503` errors without provider body/key/prompt logging.

Do not log headers, keys, full prompts, or raw provider bodies.

**Step 5: Rebuild, install, restart, and verify GREEN**

Run:

```bash
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
cp extensions/trailhead/target/wasm32-wasip2/release/trailhead.wasm traildepot/wasm/
```

Restart TrailBase, then run:

```bash
scripts/authorization-smoke.sh
```

Expected: PASS, including planner/viewer/outsider suggestion authorization and non-admin settings denial.

**Step 6: Commit**

```bash
git add extensions/trailhead/src/lib.rs scripts/authorization-smoke.sh traildepot/wasm/trailhead.wasm
git commit -m "feat: generate grounded itinerary suggestions"
```

### Task 3: Make extension API errors reject React Query mutations

**Files:**
- Modify: `web/src/lib/trailbase.test.ts`
- Modify: `web/src/lib/trailbase.ts:55-58`

**Step 1: Write the failing test**

Extend the mocked client with `fetch`. Add:

```typescript
it('throws the extension response message for failed requests', async () => {
  mocks.client.fetch.mockResolvedValue(new Response(JSON.stringify({ message: 'Suggestions are temporarily unavailable.' }), { status: 503, headers: { 'content-type': 'application/json' } }))
  const { extension } = await import('./trailbase')
  await expect(extension('/trips/1/suggestions', { method: 'POST' })).rejects.toThrow('Suggestions are temporarily unavailable.')
})
```

Also cover a non-JSON error body falling back to `Request failed (503)`.

**Step 2: Run test and verify RED**

```bash
npm --prefix web test -- src/lib/trailbase.test.ts
```

Expected: rejection assertion fails because `extension` currently parses every response as success.

**Step 3: Implement the minimal shared fix**

Update `extension` to parse successful JSON, but on `!response.ok` read JSON/text safely and throw `Error` with the server message or status fallback. This shared boundary fixes errors for all existing extension mutations without changing call sites.

**Step 4: Run test and verify GREEN**

```bash
npm --prefix web test -- src/lib/trailbase.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add web/src/lib/trailbase.ts web/src/lib/trailbase.test.ts
git commit -m "fix: surface extension request failures"
```

### Task 4: Add the temporary suggestion and scheduling UI

**Files:**
- Modify: `web/src/types.ts:40-52`
- Modify: `web/src/pages/TripPage.test.tsx`
- Modify: `web/src/pages/TripPage.tsx:1-12, 73, 104-113`

**Step 1: Write failing Itinerary component tests**

Export `Itinerary` for focused rendering. Extend the TrailBase mock with `create` and make `records(name)` return the matching methods. Add tests that prove:

- A viewer does not see **Suggest things to do**.
- An editor click immediately shows “Searching for events and local attractions…” and disables the button.
- A successful response renders an event card and grounded source.
- **Dismiss** removes only that card; **Clear suggestions** removes all.
- **Schedule** reveals prefilled title/place/date/time inputs with date `min/max` equal to trip dates.
- Submitting creates the itinerary row and activity event, calls `invalidate`, and removes the scheduled suggestion.
- An extension rejection renders its recoverable message and **Try again**.

Use one representative response:

```typescript
const suggestion = {
  type: 'event' as const,
  title: 'Night Market',
  description: 'Local food and music.',
  place: 'Main Square',
  date: '2026-10-02',
  time: '18:30',
  sources: [{ title: 'City events', url: 'https://city.example/event' }],
}
```

**Step 2: Run tests and verify RED**

```bash
npm --prefix web test -- src/pages/TripPage.test.tsx
```

Expected: failure because `Itinerary` is not exported and the AI controls do not exist.

**Step 3: Add response types**

In `web/src/types.ts` add:

```typescript
export interface SuggestionSource { title: string; url: string }
export interface AiSuggestion {
  type: 'event' | 'attraction'
  title: string
  description: string
  place: string
  date: string
  time: string
  sources: SuggestionSource[]
}
```

**Step 4: Implement the minimal UI**

Pass the full `trip` into `Itinerary`. Keep generated suggestions and the expanded scheduling card in local state. Add a `useMutation` calling:

```typescript
extension<{ suggestions: AiSuggestion[] }>(`/trips/${trip.id}/suggestions`, { method: 'POST' })
```

Render:

- Planner-only heading button using `Sparkles`.
- One accessible `role="status"` loading card with `LoaderCircle animate-spin`.
- A recoverable `role="alert"` error card with **Try again**.
- Suggestion cards with badge, description, proposed schedule, safe external links (`target="_blank" rel="noreferrer"`), **Schedule**, and **Dismiss**.
- A native inline scheduling form using `min={trip.start_date}`, `max={trip.end_date}`, existing `Input`, and the existing `add` mutation.
- **Clear suggestions** and guarded **Search again** controls.

Reuse the existing itinerary and activity writes. Do not create a modal, global suggestion store, persistence layer, or new component abstraction. Also constrain the existing manual date input to the trip range.

**Step 5: Run targeted and complete frontend checks**

```bash
npm --prefix web test -- src/pages/TripPage.test.tsx
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Expected: all commands exit 0 without warnings/errors.

**Step 6: Commit**

```bash
git add web/src/types.ts web/src/pages/TripPage.tsx web/src/pages/TripPage.test.tsx
git commit -m "feat: schedule AI itinerary suggestions"
```

### Task 5: Document setup and perform end-to-end verification

**Files:**
- Modify: `extensions/trailhead/README.md`
- Modify: `README.md`
- Modify: `docs/workshop.md`

**Step 1: Document admin configuration and privacy**

Add an admin-only example:

```json
{
  "api_keys": "AIza...primary\nAIza...backup",
  "model": "gemini-2.5-flash-lite"
}
```

Document:

- POST/GET `/trailhead/admin/ai-settings` with the existing admin token + CSRF requirements.
- Keys remain in protected component preferences and GET exposes only count/model.
- Restrict keys to the Gemini API; prefer current AI Studio authorization keys.
- Quotas apply per Google project, not per key.
- Free-tier prompts/responses may be used by Google to improve products.
- Suggestions are ephemeral and grounded availability/pricing may change.

**Step 2: Run full verification**

```bash
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
npm --prefix web test
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build
python3 scripts/invitation-migration-test.py
git diff --check
git status --short
```

Restart with the newly built WASM and run:

```bash
scripts/authorization-smoke.sh
```

With a configured disposable demo key, manually verify one real trip generation, source links, dismissal, edited scheduling, itinerary creation, one-key failover, and all-keys failure. Never paste a real key into committed files or command history; configure through an interactive/admin-secret-safe request.

**Step 3: Commit documentation and final fixes**

```bash
git add README.md extensions/trailhead/README.md docs/workshop.md
git commit -m "docs: configure AI itinerary suggestions"
```
