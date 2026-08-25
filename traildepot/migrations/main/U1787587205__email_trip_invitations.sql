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
SELECT legacy.id, legacy.trip_id, legacy.inviter, legacy.email, legacy.role, legacy.expires, legacy.created
FROM trip_invites_legacy AS legacy
WHERE legacy.accepted = 0
  AND legacy.expires > UNIXEPOCH()
  AND legacy.id = (
    SELECT candidate.id
    FROM trip_invites_legacy AS candidate
    WHERE candidate.trip_id = legacy.trip_id
      AND candidate.email = legacy.email
      AND candidate.accepted = 0
      AND candidate.expires > UNIXEPOCH()
    ORDER BY candidate.created DESC, candidate.id DESC
    LIMIT 1
  );

DROP TABLE trip_invites_legacy;
CREATE INDEX trip_invites_email_idx ON trip_invites(email, expires);
