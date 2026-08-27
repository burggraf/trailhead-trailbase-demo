#![forbid(unsafe_code, clippy::unwrap_used)]

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use trailbase_wasm::db::{Transaction, Value, execute, query};
use trailbase_wasm::fetch;
use trailbase_wasm::http::{HttpError, HttpRoute, Json, Request, StatusCode, routing};
use trailbase_wasm::job::Job;
use trailbase_wasm::{Guest, export, prefs};
use wstd::http::body::IntoBody;

struct Trailhead;

const EMAIL_SETTINGS_KEY: &str = "resend-email-settings";
const DEV_APP_URL: &str = "http://localhost:5173";
const MAILPIT_SEND_URL: &str = "http://localhost:8025/api/v1/send";

impl Guest for Trailhead {
    fn http_handlers() -> Vec<HttpRoute> {
        vec![
            routing::get("/trailhead/whoami", whoami),
            routing::get("/trailhead/admin/email-settings", get_email_settings).require_admin(),
            routing::post("/trailhead/admin/email-settings", set_email_settings).require_admin(),
            routing::post("/trailhead/trips", create_trip),
            routing::post("/trailhead/trips/{id}/invites", create_invite),
            routing::get("/trailhead/trips/{id}/invites", owner_invites),
            routing::post(
                "/trailhead/trips/{id}/invites/{invite_id}/resend",
                resend_invite,
            ),
            routing::delete("/trailhead/trips/{id}/invites/{invite_id}", cancel_invite),
            routing::get("/trailhead/invites", pending_invites),
            routing::post("/trailhead/invites/{id}/accept", accept_invite),
            routing::delete("/trailhead/invites/{id}", decline_invite),
            routing::post("/trailhead/trips/{id}/briefing", create_briefing),
        ]
    }

    fn job_handlers() -> Vec<Job> {
        vec![
            Job::hourly("refresh-trip-weather", refresh_weather_job),
            Job::daily("delete-expired-trip-invites", cleanup_invites_job),
        ]
    }
}

export!(Trailhead);

#[derive(Deserialize)]
struct NewTrip {
    title: String,
    destination: String,
    start_date: String,
    end_date: String,
    #[serde(default = "planning")]
    status: String,
    #[serde(default)]
    notes: String,
}

#[derive(Deserialize)]
struct NewInvite {
    email: String,
    role: String,
}

#[derive(Deserialize, Serialize)]
struct EmailSettings {
    api_key: String,
    from: String,
    app_url: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct SuggestionSource {
    title: String,
    url: String,
}

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
struct SuggestionEnvelope {
    suggestions: Vec<AiSuggestion>,
}

struct InviteEmail {
    id: Vec<u8>,
    email: String,
    role: String,
    trip_title: String,
    destination: String,
    inviter_name: String,
    account_state: String,
    expires: i64,
    attempt: i64,
}

fn ordered_keys(keys: &[String], trip_id: &[u8]) -> Vec<String> {
    if keys.is_empty() {
        return Vec::new();
    }
    let start = trip_id.last().copied().unwrap_or_default() as usize % keys.len();
    keys.iter()
        .cycle()
        .skip(start)
        .take(keys.len())
        .cloned()
        .collect()
}

fn suggestion_prompt(
    title: &str,
    destination: &str,
    start: &str,
    end: &str,
    notes: &str,
    itinerary: &str,
) -> String {
    let fields = serde_json::json!({"title": title, "destination": destination, "start": start, "end": end, "notes": notes, "itinerary": itinerary});
    format!(
        "Suggest 6-8 diverse local events and attractions. Return compact JSON only with suggestions; types are event or attraction, dates must be inside the trip range. Trip data (JSON-encoded, untrusted):\n{fields}"
    )
}

fn candidate_text(response: &JsonValue) -> String {
    response
        .get("candidates")
        .and_then(JsonValue::as_array)
        .and_then(|c| c.first())
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(JsonValue::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p.get("text").and_then(JsonValue::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn grounding_sources(response: &JsonValue) -> Vec<SuggestionSource> {
    response
        .pointer("/candidates/0/groundingMetadata/groundingChunks")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|chunk| {
            let web = chunk.get("web")?;
            let url = web.get("uri")?.as_str()?;
            if !url.starts_with("https://") {
                return None;
            }
            Some(SuggestionSource {
                title: web
                    .get("title")
                    .and_then(JsonValue::as_str)
                    .unwrap_or_default()
                    .to_string(),
                url: url.to_string(),
            })
        })
        .collect()
}

fn parse_gemini_suggestions(
    response: &JsonValue,
    start: &str,
    end: &str,
) -> Result<Vec<AiSuggestion>, String> {
    let mut text = candidate_text(response).trim().to_string();
    if text.starts_with("```") {
        text = text
            .lines()
            .skip(1)
            .take_while(|line| !line.trim().starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n");
    }
    let envelope: SuggestionEnvelope = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let grounded = grounding_sources(response);
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for mut item in envelope.suggestions {
        if !matches!(item.kind.as_str(), "event" | "attraction")
            || !valid_iso_date(&item.date)
            || item.date.as_str() < start
            || item.date.as_str() > end
            || !item.time.is_empty() && !valid_time(&item.time)
        {
            continue;
        }
        if item.title.is_empty()
            || item.title.chars().count() > 120
            || item.description.is_empty()
            || item.description.chars().count() > 500
            || item.place.is_empty()
            || item.place.chars().count() > 160
        {
            continue;
        }
        let key = (
            item.title.to_lowercase(),
            item.place.to_lowercase(),
            item.date.clone(),
        );
        if !seen.insert(key) {
            continue;
        }
        item.sources.retain(|source| {
            source.url.starts_with("https://") && grounded.iter().any(|g| g.url == source.url)
        });
        out.push(item);
        if out.len() == 8 {
            break;
        }
    }
    if out.is_empty() {
        return Err("no usable suggestions".to_string());
    }
    Ok(out)
}

fn valid_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 5
        && bytes[2] == b':'
        && bytes[..2].iter().all(u8::is_ascii_digit)
        && bytes[3..].iter().all(u8::is_ascii_digit)
        && bytes[..2].iter().fold(0, |n, b| n * 10 + (b - b'0')) <= 23
        && bytes[3..].iter().fold(0, |n, b| n * 10 + (b - b'0')) <= 59
}

fn valid_iso_date(value: &str) -> bool {
    if value.len() != 10 || value.as_bytes()[4] != b'-' || value.as_bytes()[7] != b'-' {
        return false;
    }
    let digits = [0..4, 5..7, 8..10];
    if digits
        .iter()
        .any(|range| !value[range.clone()].bytes().all(|b| b.is_ascii_digit()))
    {
        return false;
    }
    let year = value[..4].parse::<u32>().unwrap_or(0);
    let month = value[5..7].parse::<u8>().unwrap_or(0);
    let day = value[8..10].parse::<u8>().unwrap_or(0);
    if !(1..=12).contains(&month) || day == 0 {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    day <= max_day
}

fn retryable_provider_status(status: u16) -> bool {
    status == 401 || status == 403 || status == 429 || (500..600).contains(&status)
}

async fn whoami(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user = authenticated(&req)?;
    Ok(Json(json!({
      "id": user.id,
      "email": user.email,
      "username": user.username,
    })))
}

async fn get_email_settings(_req: Request) -> Result<Json<JsonValue>, HttpError> {
    let settings = read_email_settings().await?;
    Ok(Json(match settings {
        Some(settings) => json!({
            "configured": true,
            "from": settings.from,
            "app_url": settings.app_url,
        }),
        None => json!({
            "configured": false,
            "from": "Trailhead <noreply@trailhead.test>",
            "app_url": "http://localhost:5173",
        }),
    }))
}

async fn set_email_settings(mut req: Request) -> Result<Json<JsonValue>, HttpError> {
    let settings: EmailSettings = req.body().json().await.map_err(bad_request)?;
    if settings.api_key.trim().is_empty() {
        prefs::set_prefs(EMAIL_SETTINGS_KEY, None::<String>)
            .await
            .map_err(internal)?;
        return Ok(Json(json!({"configured": false})));
    }
    if !settings.from.contains('@')
        || !settings.app_url.starts_with("https://")
        || settings.app_url.ends_with('/')
    {
        return Err(bad_request(
            "from must contain an email and app_url must be an HTTPS origin without a trailing slash",
        ));
    }
    prefs::set_prefs(
        EMAIL_SETTINGS_KEY,
        Some(serde_json::to_string(&settings).map_err(internal)?),
    )
    .await
    .map_err(internal)?;
    Ok(Json(json!({"configured": true})))
}

async fn create_trip(mut req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let body: NewTrip = req.body().json().await.map_err(bad_request)?;
    if body.title.trim().len() < 2 || body.destination.trim().len() < 2 {
        return Err(bad_request("title and destination are required"));
    }

    let mut tx = Transaction::begin().map_err(internal)?;
    let trip_id = generated_uuid(&mut tx)?;
    tx.execute(
    "INSERT INTO trips (id, owner, title, destination, start_date, end_date, status, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    &[
      Value::Blob(trip_id.clone()),
      Value::Blob(user_id.clone()),
      Value::Text(body.title.trim().to_string()),
      Value::Text(body.destination.trim().to_string()),
      Value::Text(body.start_date),
      Value::Text(body.end_date),
      Value::Text(body.status),
      Value::Text(body.notes),
    ],
  ).map_err(internal)?;
    tx.execute(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES (?1, ?2, 'owner')",
        &[Value::Blob(trip_id.clone()), Value::Blob(user_id.clone())],
    )
    .map_err(internal)?;
    tx.execute(
    "INSERT INTO activity_events (trip_id, actor, kind, summary) VALUES (?1, ?2, 'trip_created', 'Created the trip')",
    &[Value::Blob(trip_id.clone()), Value::Blob(user_id)],
  ).map_err(internal)?;
    tx.commit().map_err(internal)?;

    Ok(Json(json!({"id": encode_id(&trip_id)})))
}

async fn create_invite(mut req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let trip_id = path_blob(&req, "id")?;
    let body: NewInvite = req.body().json().await.map_err(bad_request)?;
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') || !matches!(body.role.as_str(), "editor" | "viewer") {
        return Err(bad_request("valid email and role are required"));
    }

    let mut tx = Transaction::begin().map_err(internal)?;
    require_role(&mut tx, &trip_id, &user_id, "owner")?;
    if !tx
        .query(
            "SELECT 1 FROM trip_members m JOIN _user u ON u.id = m.user_id WHERE m.trip_id = ?1 AND lower(u.email) = lower(?2) LIMIT 1",
            &[Value::Blob(trip_id.clone()), Value::Text(email.clone())],
        )
        .map_err(internal)?
        .is_empty()
    {
        return Err(HttpError::message(
            StatusCode::CONFLICT,
            "this person is already a trip member",
        ));
    }
    tx.execute(
        "INSERT INTO trip_invites (trip_id, inviter, email, role, expires, email_attempt) VALUES (?1, ?2, ?3, ?4, UNIXEPOCH() + 604800, 1) ON CONFLICT(trip_id, email) DO UPDATE SET inviter = excluded.inviter, role = excluded.role, expires = excluded.expires, email_status = 'pending', last_sent = NULL, email_attempt = trip_invites.email_attempt + 1",
        &[
            Value::Blob(trip_id.clone()),
            Value::Blob(user_id),
            Value::Text(email.clone()),
            Value::Text(body.role),
        ],
    )
    .map_err(internal)?;
    let rows = tx
        .query(
            "SELECT i.id, i.email, i.role, t.title, t.destination, CAST(COALESCE(p.display_name, u.username, u.email, 'A traveler') AS TEXT), CASE WHEN EXISTS(SELECT 1 FROM _user account WHERE account.email = i.email) THEN 'verified' WHEN EXISTS(SELECT 1 FROM _user account WHERE account.unverified_email = i.email) THEN 'unverified' ELSE 'new' END, i.expires, i.email_attempt FROM trip_invites i JOIN trips t ON t.id = i.trip_id JOIN _user u ON u.id = i.inviter LEFT JOIN profiles p ON p.user = i.inviter WHERE i.trip_id = ?1 AND i.email = ?2",
            &[Value::Blob(trip_id), Value::Text(email)],
        )
        .map_err(internal)?;
    let invite = invite_email(rows.first().ok_or_else(|| internal("missing invitation"))?)?;
    tx.commit().map_err(internal)?;
    let delivery = deliver_and_record(&invite).await;
    Ok(Json(
        json!({"id": encode_id(&invite.id), "delivery": delivery}),
    ))
}

async fn pending_invites(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let email = account_email(&req)?;
    let rows = query(
        "SELECT i.id, i.trip_id, t.title, t.destination, i.role, i.expires, CAST(COALESCE(p.display_name, u.username, u.email, 'A traveler') AS TEXT) FROM trip_invites i JOIN trips t ON t.id = i.trip_id JOIN _user u ON u.id = i.inviter LEFT JOIN profiles p ON p.user = i.inviter WHERE i.email = ?1 AND i.expires > UNIXEPOCH() ORDER BY i.created DESC",
        [Value::Text(email.to_string())],
    )
    .await
    .map_err(internal)?;
    let mut records = Vec::with_capacity(rows.len());
    for row in &rows {
        records.push(json!({
            "id": encode_id(&blob(row.first().ok_or_else(|| internal("invalid invite row"))?)?),
            "trip_id": encode_id(&blob(row.get(1).ok_or_else(|| internal("invalid invite row"))?)?),
            "trip_title": text(row.get(2).ok_or_else(|| internal("invalid invite row"))?)?,
            "destination": text(row.get(3).ok_or_else(|| internal("invalid invite row"))?)?,
            "role": text(row.get(4).ok_or_else(|| internal("invalid invite row"))?)?,
            "expires": integer(row.get(5).ok_or_else(|| internal("invalid invite row"))?)?,
            "inviter_name": text(row.get(6).ok_or_else(|| internal("invalid invite row"))?)?,
        }));
    }
    Ok(Json(json!({"records": records})))
}

async fn owner_invites(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let trip_id = path_blob(&req, "id")?;
    let mut tx = Transaction::begin().map_err(internal)?;
    require_role(&mut tx, &trip_id, &user_id, "owner")?;
    let rows = tx
        .query(
            "SELECT id, email, role, expires, email_status, last_sent FROM trip_invites WHERE trip_id = ?1 AND expires > UNIXEPOCH() ORDER BY created DESC",
            &[Value::Blob(trip_id)],
        )
        .map_err(internal)?;
    let mut records = Vec::with_capacity(rows.len());
    for row in &rows {
        records.push(json!({
            "id": encode_id(&blob(row.first().ok_or_else(|| internal("invalid invite row"))?)?),
            "email": text(row.get(1).ok_or_else(|| internal("invalid invite row"))?)?,
            "role": text(row.get(2).ok_or_else(|| internal("invalid invite row"))?)?,
            "expires": integer(row.get(3).ok_or_else(|| internal("invalid invite row"))?)?,
            "email_status": text(row.get(4).ok_or_else(|| internal("invalid invite row"))?)?,
            "last_sent": optional_integer(row.get(5).ok_or_else(|| internal("invalid invite row"))?)?,
        }));
    }
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"records": records})))
}

async fn accept_invite(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user = authenticated(&req)?;
    let user_id = decode_id(&user.id)?;
    let email = user
        .email
        .as_deref()
        .ok_or_else(|| bad_request("account has no verified email"))?;
    let invite_id = path_blob(&req, "id")?;
    let mut tx = Transaction::begin().map_err(internal)?;
    let rows = tx
        .query(
            "SELECT trip_id, role FROM trip_invites WHERE id = ?1 AND email = ?2 AND expires > UNIXEPOCH() LIMIT 1",
            &[Value::Blob(invite_id.clone()), Value::Text(email.to_string())],
        )
        .map_err(internal)?;
    let row = rows
        .first()
        .ok_or_else(|| HttpError::message(StatusCode::NOT_FOUND, "invite not found or expired"))?;
    let trip_id = blob(row.first().ok_or_else(|| internal("invalid invite"))?)?;
    let role = text(row.get(1).ok_or_else(|| internal("invalid invite"))?)?.to_string();
    tx.execute(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES (?1, ?2, ?3) ON CONFLICT(trip_id, user_id) DO NOTHING",
        &[
            Value::Blob(trip_id.clone()),
            Value::Blob(user_id.clone()),
            Value::Text(role),
        ],
    )
    .map_err(internal)?;
    tx.execute(
        "DELETE FROM trip_invites WHERE id = ?1",
        &[Value::Blob(invite_id)],
    )
    .map_err(internal)?;
    tx.execute(
        "INSERT INTO activity_events (trip_id, actor, kind, summary) VALUES (?1, ?2, 'member_joined', 'Joined the trip')",
        &[Value::Blob(trip_id.clone()), Value::Blob(user_id)],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"trip_id": encode_id(&trip_id)})))
}

async fn decline_invite(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let email = account_email(&req)?;
    let invite_id = path_blob(&req, "id")?;
    let affected = execute(
        "DELETE FROM trip_invites WHERE id = ?1 AND email = ?2 AND expires > UNIXEPOCH()",
        [Value::Blob(invite_id), Value::Text(email.to_string())],
    )
    .await
    .map_err(internal)?;
    if affected == 0 {
        return Err(HttpError::message(
            StatusCode::NOT_FOUND,
            "invite not found or expired",
        ));
    }
    Ok(Json(json!({"declined": true})))
}

async fn resend_invite(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let trip_id = path_blob(&req, "id")?;
    let invite_id = path_blob(&req, "invite_id")?;
    let mut tx = Transaction::begin().map_err(internal)?;
    require_role(&mut tx, &trip_id, &user_id, "owner")?;
    let affected = tx
        .execute(
            "UPDATE trip_invites SET expires = UNIXEPOCH() + 604800, email_status = 'pending', last_sent = NULL, email_attempt = email_attempt + 1 WHERE id = ?1 AND trip_id = ?2",
            &[Value::Blob(invite_id.clone()), Value::Blob(trip_id)],
        )
        .map_err(internal)?;
    if affected == 0 {
        return Err(HttpError::message(
            StatusCode::NOT_FOUND,
            "invite not found",
        ));
    }
    let rows = tx
        .query(
            "SELECT i.id, i.email, i.role, t.title, t.destination, CAST(COALESCE(p.display_name, u.username, u.email, 'A traveler') AS TEXT), CASE WHEN EXISTS(SELECT 1 FROM _user account WHERE account.email = i.email) THEN 'verified' WHEN EXISTS(SELECT 1 FROM _user account WHERE account.unverified_email = i.email) THEN 'unverified' ELSE 'new' END, i.expires, i.email_attempt FROM trip_invites i JOIN trips t ON t.id = i.trip_id JOIN _user u ON u.id = i.inviter LEFT JOIN profiles p ON p.user = i.inviter WHERE i.id = ?1",
            &[Value::Blob(invite_id)],
        )
        .map_err(internal)?;
    let invite = invite_email(rows.first().ok_or_else(|| internal("missing invitation"))?)?;
    tx.commit().map_err(internal)?;
    let delivery = deliver_and_record(&invite).await;
    Ok(Json(
        json!({"id": encode_id(&invite.id), "delivery": delivery}),
    ))
}

async fn cancel_invite(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let trip_id = path_blob(&req, "id")?;
    let invite_id = path_blob(&req, "invite_id")?;
    let mut tx = Transaction::begin().map_err(internal)?;
    require_role(&mut tx, &trip_id, &user_id, "owner")?;
    let affected = tx
        .execute(
            "DELETE FROM trip_invites WHERE id = ?1 AND trip_id = ?2",
            &[Value::Blob(invite_id), Value::Blob(trip_id)],
        )
        .map_err(internal)?;
    if affected == 0 {
        return Err(HttpError::message(
            StatusCode::NOT_FOUND,
            "invite not found",
        ));
    }
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"cancelled": true})))
}

async fn create_briefing(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user_id = user_blob(&req)?;
    let trip_id = path_blob(&req, "id")?;
    let rows = query(
    "SELECT destination FROM trips WHERE id = ?1 AND EXISTS(SELECT 1 FROM trip_members WHERE trip_id = trips.id AND user_id = ?2)",
    [Value::Blob(trip_id.clone()), Value::Blob(user_id.clone())],
  ).await.map_err(internal)?;
    let destination = rows
        .first()
        .and_then(|row| row.first())
        .and_then(|v| text(v).ok())
        .ok_or_else(|| HttpError::message(StatusCode::FORBIDDEN, "trip membership required"))?;
    let briefing = fetch_briefing(destination).await?;
    store_briefing(&trip_id, Some(user_id.clone()), &briefing).await?;
    execute(
        "INSERT INTO activity_events (trip_id, actor, kind, summary) VALUES (?1, ?2, 'weather_refreshed', 'Refreshed the weather briefing')",
        [Value::Blob(trip_id), Value::Blob(user_id)],
    )
    .await
    .map_err(internal)?;
    Ok(Json(briefing))
}

async fn refresh_weather_job() -> Result<(), HttpError> {
    let rows = query(
    "SELECT id, destination FROM trips WHERE end_date >= date('now') AND (latitude IS NULL OR NOT EXISTS(SELECT 1 FROM weather_briefings w WHERE w.trip_id = trips.id AND w.fetched > UNIXEPOCH() - 21600)) ORDER BY start_date LIMIT 10",
    [],
  ).await.map_err(internal)?;
    for row in rows {
        let (Some(id_value), Some(destination_value)) = (row.first(), row.get(1)) else {
            continue;
        };
        let (Ok(trip_id), Ok(destination)) = (blob(id_value), text(destination_value)) else {
            continue;
        };
        match fetch_briefing(destination).await {
            Ok(briefing) => {
                if let Err(err) = store_briefing(&trip_id, None, &briefing).await {
                    eprintln!("weather job store failed: {err:?}");
                }
            }
            Err(err) => eprintln!("weather job fetch failed: {err:?}"),
        }
    }
    Ok(())
}

async fn cleanup_invites_job() -> Result<(), HttpError> {
    execute("DELETE FROM trip_invites WHERE expires <= UNIXEPOCH()", [])
        .await
        .map_err(internal)?;
    Ok(())
}

async fn fetch_briefing(destination: &str) -> Result<JsonValue, HttpError> {
    let geocode_url = format!(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={}",
        url::form_urlencoded::byte_serialize(destination.as_bytes()).collect::<String>()
    );
    let request = fetch::Request::builder()
        .uri(geocode_url)
        .header("User-Agent", "Trailhead-TrailBase-Demo/0.1")
        .body(Vec::<u8>::new().into_body())
        .map_err(internal)?;
    let geocode_bytes = fetch::fetch(request).await.map_err(upstream)?;
    let locations: JsonValue = serde_json::from_slice(&geocode_bytes).map_err(upstream)?;
    let location = locations
        .as_array()
        .and_then(|items| items.first())
        .ok_or_else(|| HttpError::message(StatusCode::BAD_GATEWAY, "destination was not found"))?;
    let latitude = json_number(location.get("lat"))?;
    let longitude = json_number(location.get("lon"))?;
    let display_name = location
        .get("display_name")
        .and_then(JsonValue::as_str)
        .unwrap_or(destination);

    let weather_url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&forecast_days=7&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto"
    );
    let weather_uri = weather_url.parse::<http::Uri>().map_err(upstream)?;
    let weather_bytes = fetch::get(weather_uri).await.map_err(upstream)?;
    let weather: JsonValue = serde_json::from_slice(&weather_bytes).map_err(upstream)?;
    if weather.get("error").and_then(JsonValue::as_bool) == Some(true) {
        return Err(upstream("weather provider rejected the request"));
    }
    let current = weather.get("current").cloned().unwrap_or_else(|| json!({}));
    let daily = weather.get("daily").cloned().unwrap_or_else(|| json!({}));
    let temperature = current.get("temperature_2m").and_then(JsonValue::as_f64);
    let summary = temperature.map_or_else(
        || format!("Forecast available for {display_name}"),
        |value| format!("Currently {value:.0}°C in {display_name}"),
    );
    Ok(json!({
      "summary": summary,
      "latitude": latitude,
      "longitude": longitude,
      "location": display_name,
      "current": current,
      "daily": daily,
      "provider": "Open-Meteo / OpenStreetMap Nominatim"
    }))
}

async fn store_briefing(
    trip_id: &[u8],
    fetched_by: Option<Vec<u8>>,
    briefing: &JsonValue,
) -> Result<(), HttpError> {
    let summary = briefing
        .get("summary")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| internal("missing summary"))?;
    let latitude = briefing
        .get("latitude")
        .and_then(JsonValue::as_f64)
        .ok_or_else(|| internal("missing latitude"))?;
    let longitude = briefing
        .get("longitude")
        .and_then(JsonValue::as_f64)
        .ok_or_else(|| internal("missing longitude"))?;
    execute(
        "UPDATE trips SET latitude = ?1, longitude = ?2 WHERE id = ?3",
        [
            Value::Real(latitude),
            Value::Real(longitude),
            Value::Blob(trip_id.to_vec()),
        ],
    )
    .await
    .map_err(internal)?;
    execute(
    "INSERT INTO weather_briefings (trip_id, summary, source_json, fetched_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(trip_id) DO UPDATE SET summary = excluded.summary, source_json = excluded.source_json, fetched_by = excluded.fetched_by, fetched = UNIXEPOCH()",
    [
      Value::Blob(trip_id.to_vec()),
      Value::Text(summary.to_string()),
      Value::Text(briefing.to_string()),
      fetched_by.map_or(Value::Null, Value::Blob),
    ],
  ).await.map_err(internal)?;
    Ok(())
}

async fn read_email_settings() -> Result<Option<EmailSettings>, HttpError> {
    prefs::get_prefs(EMAIL_SETTINGS_KEY)
        .await
        .map_err(internal)?
        .map(|value| serde_json::from_str(&value).map_err(internal))
        .transpose()
}

fn invite_email(row: &[Value]) -> Result<InviteEmail, HttpError> {
    Ok(InviteEmail {
        id: blob(
            row.first()
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?,
        email: text(
            row.get(1)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        role: text(
            row.get(2)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        trip_title: text(
            row.get(3)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        destination: text(
            row.get(4)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        inviter_name: text(
            row.get(5)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        account_state: text(
            row.get(6)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?
        .to_string(),
        expires: integer(
            row.get(7)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?,
        attempt: integer(
            row.get(8)
                .ok_or_else(|| internal("invalid invitation email"))?,
        )?,
    })
}

async fn deliver_and_record(invite: &InviteEmail) -> &'static str {
    let status = match deliver_invitation(invite).await {
        Ok(()) => "sent",
        Err(err) => {
            eprintln!("invitation email delivery failed: {err}");
            "failed"
        }
    };
    if let Err(err) = execute(
        "UPDATE trip_invites SET email_status = ?1, last_sent = UNIXEPOCH() WHERE id = ?2 AND email_attempt = ?3",
        [
            Value::Text(status.to_string()),
            Value::Blob(invite.id.clone()),
            Value::Integer(invite.attempt),
        ],
    )
    .await
    {
        eprintln!("failed to record invitation delivery: {err}");
    }
    status
}

async fn deliver_invitation(invite: &InviteEmail) -> Result<(), String> {
    let settings = read_email_settings()
        .await
        .map_err(|_| "failed to read email settings".to_string())?;
    let app_url = settings
        .as_ref()
        .map_or(DEV_APP_URL, |settings| settings.app_url.as_str());
    let (subject, html, text_body) = invitation_message(invite, app_url);

    if let Some(settings) = settings {
        let payload = json!({
            "from": settings.from,
            "to": [invite.email],
            "subject": subject,
            "html": html,
            "text": text_body,
        });
        return post_json(
            "https://api.resend.com/emails",
            &[
                ("authorization", format!("Bearer {}", settings.api_key)),
                ("user-agent", "Trailhead/1.0".to_string()),
                (
                    "idempotency-key",
                    invitation_idempotency_key(&invite.id, invite.attempt),
                ),
            ],
            &payload,
        )
        .await;
    }

    let payload = json!({
        "From": {"Email": "noreply@trailhead.test", "Name": "Trailhead"},
        "To": [{"Email": invite.email}],
        "Subject": subject,
        "HTML": html,
        "Text": text_body,
    });
    post_json(MAILPIT_SEND_URL, &[], &payload).await
}

async fn post_json(
    url: &str,
    headers: &[(&str, String)],
    payload: &JsonValue,
) -> Result<(), String> {
    let body = serde_json::to_vec(payload).map_err(|err| err.to_string())?;
    let mut builder = wstd::http::Request::builder()
        .method("POST")
        .uri(url)
        .header("content-type", "application/json");
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    let request = builder
        .body(body.into_body())
        .map_err(|err| err.to_string())?;
    let response = wstd::http::Client::new()
        .send(request)
        .await
        .map_err(|err| err.to_string())?;
    let status = response.status();
    let response_body = response
        .into_body()
        .bytes()
        .await
        .map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "email provider returned {status}: {}",
            String::from_utf8_lossy(&response_body)
        ));
    }
    Ok(())
}

fn invitation_idempotency_key(id: &[u8], attempt: i64) -> String {
    format!("trip-invite-{}-{attempt}", encode_id(id))
}

fn invitation_message(invite: &InviteEmail, app_url: &str) -> (String, String, String) {
    let trip = escape_html(&invite.trip_title);
    let destination = escape_html(&invite.destination);
    let inviter = escape_html(&invite.inviter_name);
    let role = escape_html(&invite.role);
    let link = format!("{}/invitations", app_url.trim_end_matches('/'));
    let (action, detail) = match invite.account_state.as_str() {
        "verified" => (
            "Sign in to review the invitation.",
            "Your account is ready. Sign in, then accept or decline the invitation.",
        ),
        "unverified" => (
            "Verify your account to continue.",
            "Finish confirming your email address, then sign in to accept or decline.",
        ),
        _ => (
            "Create an account to continue.",
            "Create and verify your Trailhead account, then accept or decline the invitation.",
        ),
    };
    let subject = format!(
        "{} invited you to {}",
        invite.inviter_name, invite.trip_title
    );
    let html = format!(
        "<!doctype html><html lang='en'><body style='margin:0;background:#f7f5ef;color:#18211c;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif'><table role='presentation' width='100%' cellspacing='0' cellpadding='0' bgcolor='#f7f5ef'><tr><td align='center' style='padding:36px 16px'><table role='presentation' width='600' cellspacing='0' cellpadding='0' style='width:100%;max-width:600px;background:#fffefb;border:1px solid #dedbd0;border-radius:20px;overflow:hidden'><tr><td bgcolor='#173b2d' style='padding:30px 40px;color:#fff'><div style='color:#f5c77b;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase'>Trip invitation</div><h1 style='margin:10px 0 0;font-size:34px;line-height:40px'>{trip}</h1></td></tr><tr><td style='padding:36px 40px'><p style='margin:0 0 18px;font-size:16px;line-height:26px'><strong>{inviter}</strong> invited you to plan a trip to <strong>{destination}</strong> as a <strong>{role}</strong>.</p><p style='margin:0 0 26px;color:#4e5c54;font-size:16px;line-height:26px'>{detail}</p><table role='presentation' cellspacing='0' cellpadding='0'><tr><td bgcolor='#f1b85b' style='border-radius:12px'><a href='{link}' style='display:inline-block;padding:15px 24px;color:#173b2d;font-weight:800;text-decoration:none'>Review invitation &rarr;</a></td></tr></table><p style='margin:26px 0 0;color:#68716b;font-size:13px;line-height:21px'>{action} This invitation expires in 7 days. Joining is always your choice.</p></td></tr><tr><td align='center' bgcolor='#173b2d' style='padding:22px;color:#9fb2a7;font-size:12px'>Sent by Trailhead &middot; Plan together. Go farther.</td></tr></table></td></tr></table></body></html>"
    );
    let text = format!(
        "{} invited you to {} in {} as a {}.\n\n{detail}\n\nReview invitation: {link}\n\nThis invitation expires in 7 days. Joining is always your choice.",
        invite.inviter_name, invite.trip_title, invite.destination, invite.role
    );
    (subject, html, text)
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn authenticated(req: &Request) -> Result<&trailbase_wasm::http::User, HttpError> {
    req.user()
        .ok_or_else(|| HttpError::status(StatusCode::UNAUTHORIZED))
}

fn user_blob(req: &Request) -> Result<Vec<u8>, HttpError> {
    decode_id(&authenticated(req)?.id)
}

fn account_email(req: &Request) -> Result<&str, HttpError> {
    authenticated(req)?
        .email
        .as_deref()
        .ok_or_else(|| bad_request("account has no verified email"))
}

fn path_blob(req: &Request, name: &str) -> Result<Vec<u8>, HttpError> {
    let value = req
        .path_param(name)
        .ok_or_else(|| bad_request(format!("missing {name}")))?;
    decode_id(value)
}

fn decode_id(value: &str) -> Result<Vec<u8>, HttpError> {
    let bytes = URL_SAFE.decode(value).map_err(bad_request)?;
    if bytes.len() != 16 {
        return Err(bad_request("invalid id"));
    }
    Ok(bytes)
}

fn encode_id(value: &[u8]) -> String {
    URL_SAFE.encode(value)
}

fn generated_uuid(tx: &mut Transaction) -> Result<Vec<u8>, HttpError> {
    let rows = tx.query("SELECT uuid_v7()", &[]).map_err(internal)?;
    blob(
        rows.first()
            .and_then(|row| row.first())
            .ok_or_else(|| internal("uuid generation failed"))?,
    )
}

fn require_role(
    tx: &mut Transaction,
    trip_id: &[u8],
    user_id: &[u8],
    role: &str,
) -> Result<(), HttpError> {
    let rows = tx
        .query(
            "SELECT 1 FROM trip_members WHERE trip_id = ?1 AND user_id = ?2 AND role = ?3 LIMIT 1",
            &[
                Value::Blob(trip_id.to_vec()),
                Value::Blob(user_id.to_vec()),
                Value::Text(role.to_string()),
            ],
        )
        .map_err(internal)?;
    if rows.is_empty() {
        return Err(HttpError::message(
            StatusCode::FORBIDDEN,
            "insufficient trip role",
        ));
    }
    Ok(())
}

fn blob(value: &Value) -> Result<Vec<u8>, HttpError> {
    match value {
        Value::Blob(value) => Ok(value.clone()),
        _ => Err(internal("expected blob")),
    }
}

fn text(value: &Value) -> Result<&str, HttpError> {
    match value {
        Value::Text(value) => Ok(value),
        _ => Err(internal("expected text")),
    }
}

fn integer(value: &Value) -> Result<i64, HttpError> {
    match value {
        Value::Integer(value) => Ok(*value),
        _ => Err(internal("expected integer")),
    }
}

fn optional_integer(value: &Value) -> Result<Option<i64>, HttpError> {
    match value {
        Value::Integer(value) => Ok(Some(*value)),
        Value::Null => Ok(None),
        _ => Err(internal("expected optional integer")),
    }
}

fn json_number(value: Option<&JsonValue>) -> Result<f64, HttpError> {
    match value {
        Some(JsonValue::Number(value)) => value.as_f64().ok_or_else(|| upstream("invalid number")),
        Some(JsonValue::String(value)) => value.parse().map_err(upstream),
        _ => Err(HttpError::message(
            StatusCode::BAD_GATEWAY,
            "invalid geocoding response",
        )),
    }
}

fn planning() -> String {
    "planning".to_string()
}

fn bad_request(err: impl std::string::ToString) -> HttpError {
    HttpError::message(StatusCode::BAD_REQUEST, err)
}

fn upstream(err: impl std::string::ToString) -> HttpError {
    eprintln!("upstream error: {}", err.to_string());
    HttpError::message(StatusCode::BAD_GATEWAY, "destination service unavailable")
}

fn internal(err: impl std::string::ToString) -> HttpError {
    eprintln!("internal error: {}", err.to_string());
    HttpError::message(StatusCode::INTERNAL_SERVER_ERROR, "internal error")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invitation_html_escapes_trip_content() {
        let invite = InviteEmail {
            id: vec![7; 16],
            email: "guest@example.com".to_string(),
            role: "viewer".to_string(),
            trip_title: "Alps <script>".to_string(),
            destination: "A&B".to_string(),
            inviter_name: "Alice".to_string(),
            account_state: "new".to_string(),
            expires: 1,
            attempt: 1,
        };
        let (_, html, text) = invitation_message(&invite, DEV_APP_URL);
        assert!(html.contains("Alps &lt;script&gt;"));
        assert!(html.contains("A&amp;B"));
        assert!(!html.contains("Alps <script>"));
        assert!(text.contains("Create and verify"));
    }

    #[test]
    fn each_email_attempt_has_a_distinct_idempotency_key() {
        let id = [7_u8; 16];
        assert_ne!(
            invitation_idempotency_key(&id, 1),
            invitation_idempotency_key(&id, 2)
        );
    }

    #[test]
    fn ids_round_trip() {
        let id = [7_u8; 16];
        assert_eq!(decode_id(&encode_id(&id)).expect("valid id"), id);
    }

    #[test]
    fn orders_keys_from_trip_shard_and_wraps() {
        let keys = vec!["a".into(), "b".into(), "c".into()];
        assert_eq!(ordered_keys(&keys, &[0, 0, 0, 1]), vec!["b", "c", "a"]);
    }

    #[test]
    fn validates_deduplicates_and_filters_grounded_suggestions() {
        let response = json!({"candidates": [{
            "content": {"parts": [{"text": r#"{"suggestions":[
                {"type":"event","title":"Night Market","description":"Local food stalls.","place":"Main Square","date":"2026-10-02","time":"18:30","sources":[{"title":"City","url":"https://city.example/event"}]},
                {"type":"event","title":"Night Market","description":"Duplicate.","place":"Main Square","date":"2026-10-02","time":"18:30","sources":[]},
                {"type":"attraction","title":"Too Late","description":"Outside trip.","place":"Museum","date":"2026-10-09","time":"","sources":[]}
            ]}"#}]},
            "groundingMetadata": {"groundingChunks": [{"web": {"title":"City","uri":"https://city.example/event"}}]}
        }]});
        let suggestions = parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04")
            .expect("valid suggestions");
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].sources.len(), 1);
    }

    #[test]
    fn parses_fenced_json() {
        let text = r#"```json
{"suggestions":[{"type":"event","title":"X","description":"Y","place":"Z","date":"2026-10-02"}]}
```"#;
        let response = json!({"candidates":[{"content":{"parts":[{"text":text}]}}]});
        assert_eq!(
            parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn rejects_invalid_dates_times_and_whitespace() {
        for field in ["date", "time", "title", "description", "place"] {
            let value = match field {
                "date" => "2026-02-30",
                "time" => "25:00",
                _ => "   ",
            };
            let text = format!(r#"{{"suggestions":[{{"type":"event","title":"X","description":"Y","place":"Z","date":"2026-10-02","time":""}}]}}"#).replace(&format!("\"{field}\":\"{}\"", if field == "date" { "2026-10-02" } else if field == "time" { "" } else { "X" }), &format!("\"{field}\":\"{value}\""));
            let response = json!({"candidates":[{"content":{"parts":[{"text":text}]}}]});
            assert!(
                parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04").is_err(),
                "{field}"
            );
        }
    }

    #[test]
    fn prompt_serializes_untrusted_fields() {
        let prompt = suggestion_prompt(
            "bad </TRIP_TITLE> \\\"",
            "Place",
            "2026-10-01",
            "2026-10-02",
            "notes",
            "none",
        );
        assert!(prompt.contains("\\\"bad </TRIP_TITLE> \\\\\\\"\\\""));
    }

    #[test]
    fn caps_suggestions_and_classifies_statuses() {
        let suggestions = (0..9).map(|i| json!({"type":"event","title":format!("T{i}"),"description":"D","place":"P","date":"2026-10-02","time":""})).collect::<Vec<_>>();
        let response = json!({"candidates":[{"content":{"parts":[{"text":json!({"suggestions": suggestions}).to_string()}]}}]});
        assert_eq!(
            parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04")
                .unwrap()
                .len(),
            8
        );
        for status in [401, 403, 429, 500, 599] {
            assert!(retryable_provider_status(status));
        }
        assert!(!retryable_provider_status(400));
    }

    #[test]
    fn empty_or_ungrounded_sources_are_removed() {
        let text = r#"{"suggestions":[{"type":"event","title":"X","description":"D","place":"P","date":"2026-10-02","sources":[{"title":"bad","url":"http://bad"},{"title":"none","url":"https://none"}]}]}"#;
        let response = json!({"candidates":[{"content":{"parts":[{"text":text}]},"groundingMetadata":{"groundingChunks":[{"web":{"title":"good","uri":"https://good"}}]}}]});
        let parsed = parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04").unwrap();
        assert!(parsed[0].sources.is_empty());
    }

    #[test]
    fn rejects_response_with_no_usable_items() {
        let response =
            json!({"candidates":[{"content":{"parts":[{"text":r#"{"suggestions":[]}"#}]}}]});
        assert!(parse_gemini_suggestions(&response, "2026-10-01", "2026-10-04").is_err());
    }
}
