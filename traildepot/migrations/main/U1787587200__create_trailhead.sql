CREATE TABLE profiles (
  user          BLOB PRIMARY KEY NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 60),
  bio           TEXT NOT NULL DEFAULT '' CHECK(length(bio) <= 280),
  home_location TEXT NOT NULL DEFAULT '' CHECK(length(home_location) <= 120),
  created       INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  updated       INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE trips (
  id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  owner       BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 100),
  destination TEXT NOT NULL CHECK(length(trim(destination)) BETWEEN 2 AND 160),
  start_date  TEXT NOT NULL CHECK(date(start_date) IS start_date),
  end_date    TEXT NOT NULL CHECK(date(end_date) IS end_date AND end_date >= start_date),
  status      TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning', 'booked', 'completed', 'cancelled')),
  notes       TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 5000),
  latitude    REAL,
  longitude   REAL,
  cover       TEXT CHECK(jsonschema('std.FileUpload', cover, 'image/png, image/jpeg, image/webp')),
  created     INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  updated     INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE trip_members (
  id      BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  joined  INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  UNIQUE(trip_id, user_id)
) STRICT;

CREATE TABLE trip_invites (
  id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id     BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  inviter     BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE CHECK(instr(email, '@') > 1),
  role        TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
  token_hash  TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  expires     INTEGER NOT NULL,
  accepted    INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0, 1)),
  created     INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE itinerary_items (
  id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id     BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by  BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  day         TEXT NOT NULL CHECK(date(day) IS day),
  start_time  TEXT NOT NULL DEFAULT '' CHECK(start_time = '' OR time(start_time) IS start_time),
  title       TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 140),
  place       TEXT NOT NULL DEFAULT '' CHECK(length(place) <= 180),
  notes       TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 2000),
  cost_cents  INTEGER CHECK(cost_cents IS NULL OR cost_cents >= 0),
  position    INTEGER NOT NULL DEFAULT 0,
  created     INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  updated     INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE checklist_items (
  id           BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id      BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by   BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  assigned_to  BLOB REFERENCES _user(id) ON DELETE SET NULL,
  text         TEXT NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 200),
  completed    INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  position     INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  updated      INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE weather_briefings (
  id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id     BLOB NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL CHECK(length(summary) <= 1000),
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  fetched_by  BLOB REFERENCES _user(id) ON DELETE SET NULL,
  fetched     INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE activity_events (
  id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id     BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor       BLOB REFERENCES _user(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK(kind IN ('trip_created', 'trip_updated', 'itinerary_added', 'checklist_added', 'checklist_completed', 'member_joined', 'weather_refreshed')),
  summary     TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 240),
  created     INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE INDEX trips_owner_idx ON trips(owner);
CREATE INDEX trip_members_user_idx ON trip_members(user_id, trip_id);
CREATE INDEX trip_members_trip_idx ON trip_members(trip_id, role);
CREATE INDEX trip_invites_email_idx ON trip_invites(email, accepted, expires);
CREATE INDEX itinerary_trip_day_idx ON itinerary_items(trip_id, day, position);
CREATE INDEX checklist_trip_idx ON checklist_items(trip_id, completed, position);
CREATE INDEX activity_trip_created_idx ON activity_events(trip_id, created DESC);

CREATE TRIGGER profiles_updated AFTER UPDATE ON profiles FOR EACH ROW
BEGIN
  UPDATE profiles SET updated = UNIXEPOCH() WHERE user = OLD.user;
END;

CREATE TRIGGER trips_updated AFTER UPDATE ON trips FOR EACH ROW
BEGIN
  UPDATE trips SET updated = UNIXEPOCH() WHERE id = OLD.id;
END;

CREATE TRIGGER itinerary_updated AFTER UPDATE ON itinerary_items FOR EACH ROW
BEGIN
  UPDATE itinerary_items SET updated = UNIXEPOCH() WHERE id = OLD.id;
END;

CREATE TRIGGER checklist_updated AFTER UPDATE ON checklist_items FOR EACH ROW
BEGIN
  UPDATE checklist_items SET updated = UNIXEPOCH() WHERE id = OLD.id;
END;

CREATE VIEW trip_members_view AS
SELECT
  m.id,
  m.trip_id,
  m.user_id,
  m.role,
  m.joined,
  CAST(COALESCE(p.display_name, u.username, u.email, 'Traveler') AS TEXT) AS display_name,
  CAST(CASE WHEN a.file IS NOT NULL THEN CONCAT('/api/auth/avatar/', uuid_text(m.user_id)) ELSE NULL END AS TEXT) AS avatar_url
FROM trip_members AS m
JOIN _user AS u ON u.id = m.user_id
LEFT JOIN profiles AS p ON p.user = m.user_id
LEFT JOIN _user_avatar AS a ON a.user = m.user_id;
