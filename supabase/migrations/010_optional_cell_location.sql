-- Cell groups may be created before a meeting place is chosen.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cells
    WHERE (name = 'Across Region 9' AND region <> 'ACROSS')
       OR (name = 'Ndar Region 8' AND region <> 'NDAR')
  ) THEN
    RAISE EXCEPTION 'An existing named cell belongs to a different region; review it before seeding';
  END IF;
END $$;

ALTER TABLE cells ALTER COLUMN meeting_location DROP NOT NULL;

INSERT INTO cells(name,meeting_location,region)
VALUES ('Across Region 9',NULL,'ACROSS'), ('Ndar Region 8',NULL,'NDAR')
ON CONFLICT (name) DO NOTHING;
