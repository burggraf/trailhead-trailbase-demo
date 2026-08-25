ALTER TABLE trip_invites RENAME TO trip_invites_legacy;
DROP INDEX trip_invites_email_idx;

CREATE TABLE trip_invites (
  id           BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  trip_id      BLOB NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  inviter      BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
  email        TEXT NOT NULL COLLATE NOCASE CHECK(instr(email, '@') > 1),
  role         TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
  expires      INTEGER NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending', 'sent', 'failed')),
  last_sent    INTEGER,
  created      INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
  UNIQUE(trip_id, email)
) STRICT;

INSERT INTO trip_invites (id, trip_id, inviter, email, role, expires, created)
SELECT id, trip_id, inviter, email, role, expires, created
FROM trip_invites_legacy
WHERE accepted = 0 AND expires > UNIXEPOCH();

DROP TABLE trip_invites_legacy;
CREATE INDEX trip_invites_email_idx ON trip_invites(email, expires);
