-- Apply before deploying the registration-details API. Existing people remain valid.
ALTER TABLE people
  ADD COLUMN email text,
  ADD COLUMN room text,
  ADD COLUMN birth_year smallint CHECK (birth_year BETWEEN 1900 AND 2100);

-- Inspect existing current associations before enforcing one department per person.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM person_departments WHERE valid_to IS NULL
    GROUP BY person_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple active departments found: resolve them before migrating';
  END IF;
END $$;

CREATE UNIQUE INDEX one_current_department_per_person
  ON person_departments(person_id) WHERE valid_to IS NULL;
