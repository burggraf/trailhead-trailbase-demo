#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.create_function("is_uuid_v7", 1, lambda value: 1, deterministic=True)
db.create_function("uuid_v7", 0, lambda: bytes(16))
db.executescript("""
CREATE TABLE _user (id BLOB PRIMARY KEY);
CREATE TABLE trips (id BLOB PRIMARY KEY);
CREATE TABLE trip_invites (
  id BLOB PRIMARY KEY NOT NULL,
  trip_id BLOB NOT NULL REFERENCES trips(id),
  inviter BLOB NOT NULL REFERENCES _user(id),
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires INTEGER NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
) STRICT;
CREATE INDEX trip_invites_email_idx ON trip_invites(email, accepted, expires);
INSERT INTO _user VALUES (x'01');
INSERT INTO trips VALUES (x'02');
INSERT INTO trip_invites VALUES
  (x'10', x'02', x'01', 'Guest@example.com', 'viewer', 'old', UNIXEPOCH() + 1000, 0, 10),
  (x'11', x'02', x'01', 'guest@example.com', 'editor', 'new', UNIXEPOCH() + 1000, 0, 20),
  (x'12', x'02', x'01', 'guest@example.com', 'viewer', 'accepted', UNIXEPOCH() + 1000, 1, 30),
  (x'13', x'02', x'01', 'expired@example.com', 'viewer', 'expired', UNIXEPOCH() - 1, 0, 40);
""")
db.executescript((root / "traildepot/migrations/main/U1787587205__email_trip_invitations.sql").read_text())
db.executescript((root / "traildepot/migrations/main/U1787587206__version_invitation_delivery.sql").read_text())
rows = db.execute("SELECT hex(id), lower(email), role FROM trip_invites ORDER BY email").fetchall()
assert rows == [("11", "guest@example.com", "editor")], rows
columns = {row[1] for row in db.execute("PRAGMA table_info(trip_invites)")}
assert "token_hash" not in columns and "accepted" not in columns
assert "email_attempt" in columns
print("PASS invitation migration keeps only the newest live duplicate")
