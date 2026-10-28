-- A first-timer becomes a member after attending two distinct services.
-- Attendance is counted across all services, so the two check-ins do not
-- need to be consecutive.

CREATE FUNCTION promote_first_timer_after_two_attendances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  previous_stage person_stage;
  attended_services integer;
BEGIN
  -- Lock the person first so two concurrent second check-ins cannot both
  -- read FIRST_TIMER and race the promotion.
  SELECT lifecycle_stage INTO previous_stage
  FROM people
  WHERE id = NEW.person_id
  FOR UPDATE;

  IF previous_stage IS DISTINCT FROM 'FIRST_TIMER'::person_stage THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO attended_services
  FROM attendance_records
  WHERE person_id = NEW.person_id;

  IF attended_services < 2 THEN
    RETURN NEW;
  END IF;

  UPDATE people
  SET lifecycle_stage = 'MEMBER', updated_at = now()
  WHERE id = NEW.person_id;

  INSERT INTO person_stage_history(
    person_id, previous_stage, new_stage, changed_by_staff_id, reason
  )
  VALUES (
    NEW.person_id, previous_stage, 'MEMBER', NEW.scanned_by_staff_id,
    'Attended two services'
  );

  INSERT INTO audit_logs(
    actor_staff_id, action_type, target_entity, target_id,
    previous_state, new_state
  )
  VALUES (
    NEW.scanned_by_staff_id, 'PERSON_STAGE_CHANGED', 'person', NEW.person_id,
    jsonb_build_object('lifecycle_stage', previous_stage),
    jsonb_build_object(
      'lifecycle_stage', 'MEMBER',
      'reason', 'Attended two services'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER promote_first_timer_after_two_attendances
AFTER INSERT ON attendance_records
FOR EACH ROW EXECUTE FUNCTION promote_first_timer_after_two_attendances();

-- Backfill anyone who already attended at least two services while still
-- recorded as a first-timer.
WITH eligible AS (
  SELECT p.id
  FROM people p
  WHERE p.lifecycle_stage = 'FIRST_TIMER'
    AND p.deleted_at IS NULL
    AND (
      SELECT count(*) FROM attendance_records a WHERE a.person_id = p.id
    ) >= 2
), promoted AS (
  UPDATE people p
  SET lifecycle_stage = 'MEMBER', updated_at = now()
  FROM eligible e
  WHERE p.id = e.id
  RETURNING p.id
), history AS (
  INSERT INTO person_stage_history(
    person_id, previous_stage, new_stage, changed_by_staff_id, reason
  )
  SELECT id, 'FIRST_TIMER', 'MEMBER', NULL,
    'Backfilled: attended two services'
  FROM promoted
  RETURNING person_id
)
INSERT INTO audit_logs(
  actor_staff_id, action_type, target_entity, target_id,
  previous_state, new_state
)
SELECT
  NULL, 'PERSON_STAGE_CHANGED', 'person', person_id,
  jsonb_build_object('lifecycle_stage', 'FIRST_TIMER'),
  jsonb_build_object(
    'lifecycle_stage', 'MEMBER',
    'reason', 'Backfilled: attended two services'
  )
FROM history;
