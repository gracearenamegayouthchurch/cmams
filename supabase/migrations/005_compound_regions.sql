-- Compounds are created at registration, grouped by one of four regions.
-- Names are unique ignoring case and repeated whitespace.
ALTER TABLE compounds RENAME COLUMN zone_name TO region;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM compounds
    WHERE region IS NULL OR region NOT IN ('ACROSS','NDAR','CHIKAM','HOSTEL')
  ) THEN
    RAISE EXCEPTION 'Existing compounds need a valid region (ACROSS, NDAR, CHIKAM, HOSTEL) before migrating';
  END IF;
END $$;

ALTER TABLE compounds ALTER COLUMN region SET NOT NULL;
ALTER TABLE compounds ADD CONSTRAINT compounds_region_check
  CHECK (region IN ('ACROSS','NDAR','CHIKAM','HOSTEL'));
ALTER TABLE compounds ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE compounds ADD COLUMN normalized_name text GENERATED ALWAYS AS
  (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM compounds GROUP BY normalized_name HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate compound names found: merge them before migrating';
  END IF;
END $$;

CREATE UNIQUE INDEX compounds_normalized_name_key ON compounds (normalized_name);
