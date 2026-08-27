# AI Itinerary Suggestions Design

## Goal

Add an owner/editor-only **Suggest things to do** workflow to the Itinerary tab. Gemini uses current trip information and Google Search grounding to find time-sensitive local events, falling back to regular attractions. Suggestions remain temporary until a user schedules one into the shared itinerary.

## Architecture

Add an authenticated `POST /trailhead/trips/{id}/suggestions` route to the existing TrailBase Rust WASM extension. The route verifies owner/editor membership, reads the trip destination, dates, notes, and current itinerary, calls the Gemini REST API with Google Search grounding, validates the response, and returns six to eight suggestions.

Use Gemini 2.5 Flash-Lite initially because its free tier currently includes up to 500 grounded requests per day, shared with Flash. The model name remains admin-configurable because model availability and pricing change. Gemini 2.5 cannot reliably combine Search grounding with strict structured output, so the prompt requests compact JSON and the extension strictly parses and validates it. Malformed output produces a recoverable error rather than partially trusted results.

Calling Gemini from the browser is rejected because client-side API keys are extractable. A separate serverless AI broker would provide stronger isolation and observability but adds unnecessary deployment and authentication machinery for this workshop/demo.

## UI and interaction

The Itinerary heading gets a **Suggest things to do** button visible only to owners and editors. Clicking it starts one request, disables duplicate clicks, and immediately displays a status card with a spinner and honest copy such as “Searching for events and local attractions…”; the UI does not invent percentages or provider stages.

Successful results appear above the itinerary as dismissible cards. Each card contains:

- Event or attraction type
- Title, place, and concise description
- Suggested date and optional time
- Grounded source links opening in a new tab
- **Schedule** and **Dismiss** actions

**Schedule** expands an inline form prefilled from the suggestion. Native date and time inputs let the user adjust scheduling; the date is constrained to the trip range. The user may edit the title and place before adding. Submission reuses the existing itinerary record creation and activity logging flow. A successfully scheduled suggestion disappears and the itinerary query refreshes.

**Dismiss** and **Clear suggestions** change only browser state. **Search again** replaces the current set after confirmation when unscheduled cards remain. Suggestions intentionally disappear on refresh and are not shared with collaborators.

A failed request replaces the working card with a concise recoverable message. Missing configuration, exhausted/unavailable keys, invalid model output, and empty results have distinct user-facing states. Raw provider responses, key identifiers, and internal errors are not shown. Manual itinerary entry remains available throughout.

## Security and key management

An admin-only settings endpoint stores an admin-selected model and newline-separated API-key pool in TrailBase protected component preferences. `GET` returns only whether AI is configured, the model name, and key count. `POST` replaces the complete pool; an empty pool disables the feature.

Keys are never committed, returned to React, logged, or placed in URLs. Gemini receives the selected key through the `x-goog-api-key` request header. Google recommends server-side key use and API restrictions; each key should be restricted to the Gemini API. New AI Studio keys should use Google's authorization-key format as it replaces standard keys.

Each suggestion request authenticates the caller and verifies owner/editor membership before reading settings or trip data. The prompt includes only the trip destination, dates, notes, and existing itinerary titles/places. It excludes member profiles, email addresses, and authentication data. User-controlled fields are delimited and explicitly treated as untrusted data, not instructions. The admin setup documentation discloses that Google may use free-tier prompt and response data to improve its products.

The starting key is derived from the trip ID, distributing trips across the configured pool without mutable round-robin state. Remaining keys are tried once in deterministic order. Failover occurs for invalid/revoked credentials, quota responses, and temporary upstream failures. Malformed requests, safety refusals, and validation failures do not consume every key. Multiple keys in one Google project do not increase quota because Gemini limits are project-scoped.

For this low-traffic demo, provider project quotas are the abuse ceiling. No custom request-history or rate-limit table is added.

## Prompt and response validation

The prompt asks Gemini to prefer verified events occurring within the trip dates and destination. If insufficient current events are found, it fills remaining slots with established local attractions. It asks for no more than eight concise, diverse suggestions and avoids items already present in the itinerary.

The extension accepts only:

- Required title, description, place, type, and date
- Dates within the trip range
- Optional valid `HH:MM` time
- Capped text lengths
- HTTPS sources found in Gemini grounding metadata
- At most eight unique suggestions

Unknown fields are discarded. Duplicate suggestions are removed. Suggested source URLs not present in grounding metadata are discarded rather than trusted.

## Error handling

Provider responses are classified into stable application errors:

- `not_configured`: no usable AI settings
- `temporarily_unavailable`: all keys failed authentication, quota, or temporary upstream checks
- `invalid_response`: provider output could not be safely parsed or validated
- `no_suggestions`: valid response contained no usable suggestions

The endpoint returns generic messages and appropriate HTTP status codes. Logs contain status categories only, never request headers, keys, complete prompts, or raw provider bodies.

## Testing and completion criteria

Frontend tests cover permission visibility, loading state, duplicate-click prevention, successful card rendering, dismiss/clear behavior, inline scheduling, trip-bounded inputs, itinerary/activity creation, refresh behavior, and recoverable error/empty states.

Pure Rust helper tests cover prompt construction, trip-date and time validation, text limits, duplicate removal, grounding-source filtering, provider error classification, and deterministic key ordering. The pinned TrailBase WASM SDK cannot link all exported WASI symbols in native tests, so route behavior follows the existing verification pattern: WASM-target formatting, clippy, release build, and authenticated HTTP smoke checks.

The authorization smoke script verifies that owners/editors may request suggestions while viewers and outsiders may not. Manual checks cover configured success, malformed output, one-key failure with failover, and all-keys failure. Existing web tests, lint, typecheck, and production build must remain clean.

Completion means a configured editor can generate grounded suggestions, inspect sources, adjust a suggestion's schedule, add it to the shared itinerary, dismiss unused results, and recover from provider failure without any API key reaching the browser or logs.

## Deliberate omissions

There is no suggestion table, background job, streaming protocol, custom rate limiter, provider abstraction, or separate AI service. Add persistence only if collaborators need to revisit the same generated set; add application rate limiting and paid-tier privacy controls before production deployment.

## References

- [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API key security](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
