#![forbid(unsafe_code, clippy::unwrap_used)]

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use trailbase_wasm::db::{Transaction, Value, execute, query};
use trailbase_wasm::fetch;
use trailbase_wasm::http::{HttpError, HttpRoute, Json, Request, StatusCode, routing};
use trailbase_wasm::job::Job;
use trailbase_wasm::{Guest, export};
use wstd::http::body::IntoBody;

struct Trailhead;

impl Guest for Trailhead {
    fn http_handlers() -> Vec<HttpRoute> {
        vec![
            routing::get("/trailhead/whoami", whoami),
            routing::post("/trailhead/trips", create_trip),
            routing::post("/trailhead/trips/{id}/invites", create_invite),
            routing::get("/trailhead/invites", pending_invites),
            routing::post("/trailhead/invites/{token}/accept", accept_invite),
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

async fn whoami(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user = authenticated(&req)?;
    Ok(Json(json!({
      "id": user.id,
      "email": user.email,
      "username": user.username,
    })))
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
    let token = random_token(&mut tx)?;
    let token_hash = hash_token(&token);
    tx.execute(
    "INSERT INTO trip_invites (trip_id, inviter, email, role, token_hash, expires) VALUES (?1, ?2, ?3, ?4, ?5, UNIXEPOCH() + 604800)",
    &[
      Value::Blob(trip_id),
      Value::Blob(user_id),
      Value::Text(email),
      Value::Text(body.role),
      Value::Text(token_hash),
    ],
  ).map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"token": token, "expires_in": 604800})))
}

async fn pending_invites(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user = authenticated(&req)?;
    let email = user
        .email
        .as_deref()
        .ok_or_else(|| bad_request("account has no email"))?;
    let rows = query(
    "SELECT i.id, i.trip_id, t.title, t.destination, i.role, i.expires FROM trip_invites i JOIN trips t ON t.id = i.trip_id WHERE lower(i.email) = lower(?1) AND i.accepted = 0 AND i.expires > UNIXEPOCH() ORDER BY i.created DESC",
    [Value::Text(email.to_string())],
  ).await.map_err(internal)?;
    let mut records = Vec::with_capacity(rows.len());
    for row in &rows {
        records.push(json!({
          "id": encode_id(&blob(row.first().ok_or_else(|| internal("invalid invite row"))?)?),
          "trip_id": encode_id(&blob(row.get(1).ok_or_else(|| internal("invalid invite row"))?)?),
          "trip_title": text(row.get(2).ok_or_else(|| internal("invalid invite row"))?)?,
          "destination": text(row.get(3).ok_or_else(|| internal("invalid invite row"))?)?,
          "role": text(row.get(4).ok_or_else(|| internal("invalid invite row"))?)?,
          "expires": integer(row.get(5).ok_or_else(|| internal("invalid invite row"))?)?,
        }));
    }
    Ok(Json(json!({"records": records})))
}

async fn accept_invite(req: Request) -> Result<Json<JsonValue>, HttpError> {
    let user = authenticated(&req)?;
    let user_id = decode_id(&user.id)?;
    let email = user
        .email
        .as_deref()
        .ok_or_else(|| bad_request("account has no email"))?;
    let token = req
        .path_param("token")
        .ok_or_else(|| bad_request("missing token"))?;
    let mut tx = Transaction::begin().map_err(internal)?;
    let rows = tx.query(
    "SELECT id, trip_id, role FROM trip_invites WHERE token_hash = ?1 AND lower(email) = lower(?2) AND accepted = 0 AND expires > UNIXEPOCH() LIMIT 1",
    &[Value::Text(hash_token(token)), Value::Text(email.to_string())],
  ).map_err(internal)?;
    let row = rows
        .first()
        .ok_or_else(|| HttpError::message(StatusCode::NOT_FOUND, "invite not found or expired"))?;
    let invite_id = blob(row.first().ok_or_else(|| internal("invalid invite"))?)?;
    let trip_id = blob(row.get(1).ok_or_else(|| internal("invalid invite"))?)?;
    let role = text(row.get(2).ok_or_else(|| internal("invalid invite"))?)?.to_string();
    tx.execute(
    "INSERT INTO trip_members (trip_id, user_id, role) VALUES (?1, ?2, ?3) ON CONFLICT(trip_id, user_id) DO NOTHING",
    &[Value::Blob(trip_id.clone()), Value::Blob(user_id.clone()), Value::Text(role)],
  ).map_err(internal)?;
    tx.execute(
        "UPDATE trip_invites SET accepted = 1 WHERE id = ?1",
        &[Value::Blob(invite_id)],
    )
    .map_err(internal)?;
    tx.execute(
    "INSERT INTO activity_events (trip_id, actor, kind, summary) VALUES (?1, ?2, 'member_joined', 'Joined the trip')",
    &[Value::Blob(trip_id.clone()), Value::Blob(user_id)],
  ).map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"trip_id": encode_id(&trip_id)})))
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
    execute(
        "DELETE FROM trip_invites WHERE accepted = 0 AND expires <= UNIXEPOCH()",
        [],
    )
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
        "https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto"
    );
    let weather_uri = weather_url.parse::<http::Uri>().map_err(upstream)?;
    let weather_bytes = fetch::get(weather_uri).await.map_err(upstream)?;
    let weather: JsonValue = serde_json::from_slice(&weather_bytes).map_err(upstream)?;
    if weather.get("error").and_then(JsonValue::as_bool) == Some(true) {
        return Err(upstream("weather provider rejected the request"));
    }
    let current = weather.get("current").cloned().unwrap_or_else(|| json!({}));
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

fn authenticated(req: &Request) -> Result<&trailbase_wasm::http::User, HttpError> {
    req.user()
        .ok_or_else(|| HttpError::status(StatusCode::UNAUTHORIZED))
}

fn user_blob(req: &Request) -> Result<Vec<u8>, HttpError> {
    decode_id(&authenticated(req)?.id)
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

fn random_token(tx: &mut Transaction) -> Result<String, HttpError> {
    let rows = tx
        .query("SELECT lower(hex(randomblob(32)))", &[])
        .map_err(internal)?;
    Ok(text(
        rows.first()
            .and_then(|row| row.first())
            .ok_or_else(|| internal("token generation failed"))?,
    )?
    .to_string())
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

fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
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
    fn token_hash_is_stable_and_not_plaintext() {
        let hash = hash_token("invite-token");
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, "invite-token");
        assert_eq!(hash, hash_token("invite-token"));
    }

    #[test]
    fn ids_round_trip() {
        let id = [7_u8; 16];
        assert_eq!(decode_id(&encode_id(&id)).expect("valid id"), id);
    }
}
