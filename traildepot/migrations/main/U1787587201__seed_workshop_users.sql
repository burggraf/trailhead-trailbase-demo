-- Local workshop accounts. Do not copy fixed credentials into production.
INSERT INTO _user (email, password_hash)
VALUES
  ('alice@example.com', hash_password('secret123')),
  ('bob@example.com', hash_password('secret123')),
  ('carol@example.com', hash_password('secret123')),
  ('eve@example.com', hash_password('secret123'))
ON CONFLICT(email) DO NOTHING;

INSERT INTO profiles (user, display_name, bio, home_location)
SELECT id,
  CASE email
    WHEN 'alice@example.com' THEN 'Alice Owner'
    WHEN 'bob@example.com' THEN 'Bob Editor'
    WHEN 'carol@example.com' THEN 'Carol Viewer'
    ELSE 'Eve Outsider'
  END,
  'Trailhead workshop account',
  'Localhost'
FROM _user
WHERE email IN ('alice@example.com', 'bob@example.com', 'carol@example.com', 'eve@example.com')
ON CONFLICT(user) DO NOTHING;
