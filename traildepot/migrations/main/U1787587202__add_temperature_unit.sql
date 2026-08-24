ALTER TABLE profiles
ADD COLUMN temperature_unit TEXT NOT NULL DEFAULT 'C'
CHECK(temperature_unit IN ('C', 'F'));
