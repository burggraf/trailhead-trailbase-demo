ALTER TABLE profiles
ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric'
CHECK(unit_system IN ('metric', 'imperial'));

UPDATE profiles
SET unit_system = CASE temperature_unit WHEN 'F' THEN 'imperial' ELSE 'metric' END;

ALTER TABLE profiles DROP COLUMN temperature_unit;
