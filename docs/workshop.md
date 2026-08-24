# Trailhead TrailBase workshop

## 1. Start and inspect

Run `./dev.sh`, sign in as Alice, and keep the TrailBase admin UI open. Compare the SQL in `traildepot/migrations/main/U1787587200__create_trailhead.sql` with the APIs in `traildepot/config.textproto`.

TrailBase requires Record API tables/views to be strictly typed and to use integer, UUIDv4, or UUIDv7 primary keys. This project uses UUIDv7 BLOB keys so records sort efficiently without exposing sequential IDs.

## 2. Authentication

The branded login calls `client.login()`. Registration, recovery, OTP, MFA, email/username/password changes, and OAuth use TrailBase’s first-party auth UI rather than reimplementing security-sensitive flows.

Try **Try anonymously**, then Settings → promote the account. Do not log out before promotion: anonymous accounts cannot authenticate a second time.

Profiles are application data linked to `_user`. Avatar bytes use TrailBase’s dedicated auth avatar API.

## 3. Tenant creation

Create a trip as Alice. The browser calls:

```http
POST /trailhead/trips
Authorization: Bearer <Alice JWT>
```

The Rust handler reads `req.user()`, opens a transaction, creates the trip, inserts Alice’s owner membership, appends activity, and commits. Direct Record API creation of trips and memberships is disabled, preventing self-granted tenancy.

## 4. SQL access rules

A representative read rule is:

```sql
EXISTS (
  SELECT 1 FROM trip_members
  WHERE trip_id = _ROW_.trip_id
    AND user_id = _USER_.id
)
```

Create rules use `_REQ_`; read/delete rules use `_ROW_`; update rules use both plus `_REQ_FIELDS_` to prevent changing tenant and creator columns. ACLs run first, then rules narrow access.

Invite Bob as editor and Carol as viewer. The local demo returns a raw one-time token; only its SHA-256 hash is stored. Acceptance also requires the authenticated account email to match the invitation email. Eve cannot list or read the trip.

Run `scripts/authorization-smoke.sh` to exercise all four roles.

## 5. CRUD and views

Itinerary and checklist screens call the official JavaScript client directly:

```ts
client.records('checklist_items').create(record)
client.records('checklist_items').update(id, patch)
client.records('checklist_items').delete(id)
```

`trip_members_view` joins profiles and auth avatars into a read-only endpoint. TrailBase needs top-level `CAST` expressions for computed view fields so it can infer their JSON schema types.

## 6. Realtime

Open Alice and Bob in separate browsers on the same trip. Add or complete a checklist item. `subscribeAll()` streams authorized changes; the hook invalidates only that trip’s TanStack Query cache.

Subscriptions run through the same Record API authorization. Eve receives no tenant data simply because the UI never has access to it.

## 7. Files

Upload a trip cover. The `cover` column is:

```sql
TEXT CHECK(jsonschema('std.FileUpload', cover, 'image/png, image/jpeg, image/webp'))
```

SQLite stores metadata while TrailBase stores bytes under `traildepot/uploads/` (or S3 when configured). Downloads use the dedicated record-file endpoint. User avatars use `/api/auth/v1/avatar`.

## 8. WASM extension

`extensions/trailhead/src/lib.rs` registers:

| Handler | Demonstrates |
|---|---|
| `GET /trailhead/whoami` | request user/security context |
| `POST /trailhead/trips` | atomic multi-table transaction |
| `POST /trailhead/trips/{id}/invites` | role check and secure token |
| `GET /trailhead/invites` | email-bound user query |
| `POST /trailhead/invites/{token}/accept` | recipient-bound transaction |
| `POST /trailhead/trips/{id}/briefing` | membership, outbound HTTP, DB upsert |
| hourly weather job | system context and bounded batch work |
| daily invite cleanup | scheduled maintenance |

The component calls Nominatim with an identifying User-Agent, then Open-Meteo. Provider failures leave the previous briefing intact. Jobs have no request user, so their SQL is deliberately narrow.

Rebuild manually with:

```bash
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
cp extensions/trailhead/target/wasm32-wasip2/release/trailhead.wasm traildepot/wasm/
```

Restart TrailBase afterward. `./dev.sh` performs this when source files are newer than the installed component.

## 9. Concept map

| Supabase | PocketBase | TrailBase |
|---|---|---|
| Postgres + migrations | embedded SQLite collections | SQLite STRICT tables + migrations |
| RLS policies | collection rules | API ACLs + SQL access rules |
| generated REST | collection REST | typed Record APIs |
| Realtime | subscriptions | Record API subscriptions |
| Storage buckets | file fields | `std.FileUpload` object-store fields |
| Edge Functions | JS hooks/routes | Rust/TS WASM components |
| Cron/pg_cron | scheduled hooks | WASM job handlers |
| Auth server | built-in auth | built-in auth with JWT + revocable refresh tokens |

## 10. Next experiments

- Generate and inspect schemas with `trail schema trips --mode select`.
- Export OpenAPI with `trail openapi`.
- Add an S3 object-store configuration.
- Add a read-only public trip view as a separate Record API rather than weakening private rules.
- Replace local invitation-token handoff with an email API in the extension.
- Validate TrailBase JWTs from a second service using the public key.
