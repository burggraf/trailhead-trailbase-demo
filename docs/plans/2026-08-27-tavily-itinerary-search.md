# Tavily Itinerary Search Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace paid Gemini Search grounding with one free-tier Tavily Basic Search followed by free-tier Gemini 3.1 Flash-Lite suggestion generation.

**Architecture:** Extend the existing protected AI preference with one Tavily key. The authorized suggestion route searches Tavily with destination/dates only, sanitizes and bounds the results, passes those results to Gemini as untrusted context without Gemini's `googleSearch` tool, and accepts only source URLs returned by Tavily. The frontend and persistence flow stay unchanged.

**Tech Stack:** Rust 2024/WASI (`trailbase-wasm`, `serde_json`, `wstd` HTTP), Tavily Search REST API, Gemini Developer API, existing React/Vitest UI.

---

### Task 1: Protect and validate Tavily configuration

**Files:**
- Modify: `extensions/trailhead/src/lib.rs`
- Test: `extensions/trailhead/src/lib.rs`

**Step 1: Write failing settings tests**

Add tests proving:

- `DEFAULT_AI_MODEL` is exactly `gemini-3.1-flash-lite`.
- `normalize_ai_settings` trims a `tavily_api_key` and retains normalized Gemini keys/model.
- missing Tavily or Gemini keys disables the combined configuration.
- serialized settings never appear in admin GET; its shape is only `configured`, `model`, `key_count`, and `search_configured`.

**Step 2: Run tests to verify RED**

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib normalizes_ai_settings_and_validates_model
```

Expected: compilation/assertion failure because `tavily_api_key` and search metadata do not exist.

**Step 3: Implement the minimal settings change**

Add `tavily_api_key: String` to `AiSettings` and `AiSettingsInput`, with `#[serde(default)]` for old preferences. Trim it, cap it at 512 characters, require both a Tavily key and at least one Gemini key, and keep at most ten Gemini keys. Update admin GET to return only:

```json
{
  "configured": true,
  "model": "gemini-3.1-flash-lite",
  "key_count": 2,
  "search_configured": true
}
```

Do not return either provider's key.

**Step 4: Run tests and Rust checks**

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
```

Expected: all tests/checks pass.

**Step 5: Commit**

```bash
git add extensions/trailhead/src/lib.rs
 git commit -m "feat: protect Tavily search settings"
```

### Task 2: Search Tavily before Gemini generation

**Files:**
- Modify: `extensions/trailhead/src/lib.rs`
- Test: `extensions/trailhead/src/lib.rs`

**Step 1: Write failing pure-helper tests**

Add tests for:

- a bounded query containing destination/start/end but not notes or itinerary;
- Tavily payload uses `search_depth: "basic"`, `topic: "general"`, `max_results: 10`, `include_answer: false`, `include_raw_content: false`, and `include_images: false`;
- parsing keeps at most ten unique HTTPS results and bounds title/content/URL lengths;
- the Gemini prompt serializes Tavily results inside an explicit untrusted-data delimiter;
- suggestion parsing keeps sources only when URL and title match sanitized Tavily sources;
- Gemini request payload has no `tools`/`googleSearch` field.

**Step 2: Run tests to verify RED**

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib tavily
```

Expected: failure because the Tavily helpers do not exist.

**Step 3: Implement bounded Tavily helpers**

Add only the required helpers:

```rust
fn tavily_query(destination: &str, start: &str, end: &str) -> String;
fn tavily_payload(query: &str) -> JsonValue;
fn parse_tavily_results(response: &JsonValue) -> Vec<SearchResult>;
```

A result contains bounded `title`, `url`, and `content`. Derive the source allowlist from those results; do not trust URLs invented by Gemini.

**Step 4: Implement the request sequence**

Add one `request_tavily` POST to `https://api.tavily.com/search` using `Authorization: Bearer <key>`. Cap its response at 256 KiB. On a non-200, malformed, empty, or transport response, return a safe recoverable search error before calling Gemini.

Pass sanitized Tavily results to `suggestion_prompt`. Remove `"tools":[{"googleSearch":{}}]` from the Gemini payload. Keep the existing 512 KiB Gemini response cap, deterministic Gemini-key failover, strict suggestion validation, date/time validation, dedupe, and eight-item cap.

**Step 5: Run focused and complete backend verification**

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
scripts/authorization-smoke.sh
```

Expected: all checks pass; unconfigured planner requests remain `503`, viewers/outsiders remain `403`.

**Step 6: Commit**

```bash
git add extensions/trailhead/src/lib.rs
 git commit -m "feat: ground itinerary ideas with Tavily"
```

### Task 3: Update documentation and perform live verification

**Files:**
- Modify: `README.md`
- Modify: `extensions/trailhead/README.md`
- Modify: `docs/workshop.md`

**Step 1: Update setup/privacy documentation**

Replace Google Search grounding setup claims with Tavily Basic Search plus Gemini generation. Document the admin body:

```json
{
  "api_keys": "Gemini-primary\nGemini-backup",
  "tavily_api_key": "tvly-...",
  "model": "gemini-3.1-flash-lite"
}
```

Document Tavily's 1,000 monthly credits, one Basic Search credit per generation, protected key storage/redaction, destination/date-only search query, Gemini free-tier data-use warning, provider variability, and ephemeral suggestions.

**Step 2: Run complete verification**

```bash
cargo test --manifest-path extensions/trailhead/Cargo.toml --lib
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
npm --prefix web test
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build
python3 scripts/invitation-migration-test.py
git diff --check
```

Restart TrailBase with the built WASM and run `scripts/authorization-smoke.sh`.

**Step 3: Secure live provider test**

Use the one-time localhost secret form; never put a real key in chat, source, logs, command arguments, or shell history. Confirm:

- admin GET reports Gemini and Tavily configured without keys;
- Tavily consumes one Basic Search credit;
- Gemini 3.1 returns 1-8 validated suggestions;
- every rendered source is an HTTPS Tavily result;
- an edited suggestion schedules with itinerary and activity records;
- provider failures remain safe;
- unscheduled results remain ephemeral.

**Step 4: Commit**

```bash
git add README.md extensions/trailhead/README.md docs/workshop.md
 git commit -m "docs: configure Tavily itinerary search"
```
