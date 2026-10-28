-- Cells are regional Saturday groups. Link each cell to one of the four
-- compound regions so cells and compounds share the same regional view.

ALTER TABLE cells ADD COLUMN region text;

UPDATE cells SET region = CASE
  WHEN name ILIKE 'Ndar%' THEN 'NDAR'
  WHEN name ILIKE 'Across%' THEN 'ACROSS'
  WHEN name ILIKE 'Chikam%' THEN 'CHIKAM'
  WHEN name ILIKE 'Hostel%' THEN 'HOSTEL'
  ELSE NULL
END;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cells WHERE region IS NULL) THEN
    RAISE EXCEPTION 'Existing cells need a region (ACROSS, NDAR, CHIKAM, HOSTEL) before migrating';
  END IF;
END $$;

ALTER TABLE cells ALTER COLUMN region SET NOT NULL;
ALTER TABLE cells ADD CONSTRAINT cells_region_check
  CHECK (region IN ('ACROSS','NDAR','CHIKAM','HOSTEL'));
CREATE INDEX cells_region_lookup ON cells(region);
