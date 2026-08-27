# Tavily-backed itinerary search design

## Context and decision

Gemini 3.1 Flash-Lite generation works with the workshop keys, but its built-in Google Search grounding returns `429` because grounding is unavailable on the free tier. Gemini 2.5 Flash and Flash-Lite return `404` for this project and are approaching shutdown. The feature still needs current events, real source links, no billing requirement, and server-side secrets.

Use one Tavily Basic Search request followed by one ungrounded Gemini 3.1 Flash-Lite generation request. Tavily provides 1,000 free credits per month without a credit card; Basic Search costs one credit. This preserves current web results and citations while retaining Gemini for compact validated suggestion generation.

Rejected alternatives:

- Ungrounded Gemini alone cannot reliably find current events or provide verified sources.
- Gemini 2.5 is unavailable to this project and is not a durable default.
- Exa also has a useful free allowance but adds no workshop advantage over Tavily's simpler recurring credit model.
- Groq Compound's free web-search billing is unclear.

## Settings and request flow

Extend the existing protected AI preference with one `tavily_api_key`. `POST /trailhead/admin/ai-settings` accepts it alongside newline-separated Gemini keys and the model. `GET` adds only `search_configured`; neither Gemini nor Tavily keys are returned. Empty required settings leave suggestions unconfigured. No new endpoint, table, dependency, service, or frontend setting screen is added.

For an authorized trip owner/editor:

1. Read the bounded trip and itinerary context as today.
2. Send Tavily one bounded query containing only destination and trip dates, asking for events during the date range plus established attractions. Use `search_depth: "basic"`, `topic: "general"`, at most ten results, and disable generated answers, raw page content, and images.
3. Bound Tavily's response body. Retain only HTTPS result URLs and bounded title/content snippets.
4. Add the sanitized search results as clearly delimited untrusted data to the existing Gemini prompt.
5. Call Gemini without the `googleSearch` tool. Keep deterministic Gemini-key failover, strict response parsing, date/time validation, deduplication, and the eight-result cap.
6. Attach only source URLs that exactly match retained Tavily results. Gemini-provided URLs are not trusted.

The React UI and ephemeral scheduling workflow remain unchanged.

## Errors, privacy, and verification

Tavily credentials stay in protected component preferences and the `Authorization` header. Keys, headers, full prompts, raw provider bodies, and trip notes are never logged. Tavily receives only a concise destination/date search query; Gemini receives bounded trip context plus Tavily snippets. Free-tier Gemini data-use warnings continue to apply, and Tavily's own data terms must be reviewed for non-demo use.

A missing Tavily key returns the existing not-configured response. Tavily authentication, quota, transport, malformed-response, or empty-result failures return a safe recoverable search-unavailable error and do not spend Gemini quota. Gemini failures retain the current safe error behavior.

Tests cover settings redaction/normalization, bounded Tavily query and response parsing, HTTPS filtering, exact source allowlisting, Gemini payload without `googleSearch`, provider failure mapping, and the existing authorization/UI suites. Final live verification uses the secure localhost key form, confirms Tavily reports one Basic Search credit, validates real HTTPS sources, schedules one edited suggestion, and leaves unscheduled results ephemeral.
