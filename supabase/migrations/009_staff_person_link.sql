-- Migration 009: Link staff user accounts to church member profiles and track academic level
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS academic_level text;

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS must_complete_profile boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS staff_users_person_id_idx ON staff_users(person_id);

-- Auto-link any staff accounts whose email already matches a member in the church directory
UPDATE staff_users s
SET person_id = p.id,
    must_complete_profile = false
FROM people p
WHERE lower(s.email) = lower(p.email)
  AND s.person_id IS NULL
  AND p.deleted_at IS NULL;
