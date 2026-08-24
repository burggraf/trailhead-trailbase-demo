DROP VIEW trip_members_view;

CREATE VIEW trip_members_view AS
SELECT
  m.id,
  m.trip_id,
  m.user_id,
  m.role,
  m.joined,
  CAST(COALESCE(p.display_name, u.username, u.email, 'Traveler') AS TEXT) AS display_name,
  CAST(CASE WHEN a.file IS NOT NULL THEN CONCAT('/api/auth/v1/avatar/', base64_url_safe(m.user_id)) ELSE NULL END AS TEXT) AS avatar_url
FROM trip_members AS m
JOIN _user AS u ON u.id = m.user_id
LEFT JOIN profiles AS p ON p.user = m.user_id
LEFT JOIN _user_avatar AS a ON a.user = m.user_id;
