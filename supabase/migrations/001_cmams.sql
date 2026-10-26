-- CMAMS V1: single-church, server-only access. Apply once on an empty Supabase project.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE person_stage AS ENUM ('FIRST_TIMER','RETURNING_VISITOR','REGULAR_ATTENDEE','MEMBER','INACTIVE','ARCHIVED');
CREATE TYPE staff_role AS ENUM ('USHER_SCANNER','REGISTRATION_DESK','SERVICE_SUPERVISOR','ADMIN','PASTOR_VIEWER');
CREATE TYPE card_status AS ENUM ('ACTIVE','REVOKED_LOST','REVOKED_DAMAGED','REVOKED_SECURITY','EXPIRED');
CREATE TYPE service_status AS ENUM ('SCHEDULED','CHECKIN_OPEN','CHECKIN_CLOSED','CANCELLED');
CREATE TYPE service_category AS ENUM ('SUNDAY_SERVICE','MIDWEEK_SERVICE','DEPARTMENT_MEETING','SPECIAL_EVENT','LEADERSHIP_MEETING');
CREATE TYPE checkin_method AS ENUM ('QR_SCAN','SHORTCODE_ENTRY','MANUAL_SEARCH','VISITOR_DESK_REGISTRATION');

CREATE TABLE compounds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, zone_name text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE courses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, faculty text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_name text NOT NULL, primary_phone_e164 text, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, full_name text NOT NULL,
  password_hash text NOT NULL, role staff_role NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE UNIQUE INDEX staff_users_email_lower_key ON staff_users (lower(email));
CREATE SEQUENCE member_code_seq START 1001;
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid REFERENCES households(id) ON DELETE SET NULL,
  member_code text NOT NULL UNIQUE DEFAULT ('CM-' || nextval('member_code_seq')::text),
  first_name text NOT NULL, middle_name text, last_name text NOT NULL,
  full_name_normalized text GENERATED ALWAYS AS
    (lower(regexp_replace(trim(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name), '\s+', ' ', 'g'))) STORED,
  phone_e164 text, phone_missing_reason text,
  birth_month smallint CHECK (birth_month BETWEEN 1 AND 12), birth_day smallint CHECK (birth_day BETWEEN 1 AND 31),
  compound_id uuid REFERENCES compounds(id) ON DELETE SET NULL,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  lifecycle_stage person_stage NOT NULL DEFAULT 'FIRST_TIMER',
  avatar_thumb_path text, privacy_consent_at timestamptz NOT NULL,
  registered_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX people_name_trgm ON people USING gin (full_name_normalized gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX people_phone ON people (phone_e164) WHERE deleted_at IS NULL AND phone_e164 IS NOT NULL;

CREATE TABLE person_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  previous_stage person_stage, new_stage person_stage NOT NULL,
  changed_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  reason text, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE person_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  role_title text NOT NULL DEFAULT 'Member', valid_from timestamptz NOT NULL DEFAULT now(), valid_to timestamptz,
  assigned_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT valid_department_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX one_current_department ON person_departments(person_id, department_id) WHERE valid_to IS NULL;

CREATE TABLE qr_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE, short_code varchar(10) NOT NULL UNIQUE,
  status card_status NOT NULL DEFAULT 'ACTIVE', issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  revoked_at timestamptz, revoked_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_active_card ON qr_cards (person_id) WHERE status = 'ACTIVE';

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category service_category NOT NULL DEFAULT 'SUNDAY_SERVICE',
  target_department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
  scheduled_start_at timestamptz NOT NULL, checkin_opens_at timestamptz NOT NULL, checkin_closes_at timestamptz NOT NULL,
  status service_status NOT NULL DEFAULT 'SCHEDULED', locked_eligible_member_count integer,
  created_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT checkin_window CHECK (checkin_closes_at > checkin_opens_at)
);
CREATE INDEX service_window ON services(status, checkin_opens_at, checkin_closes_at);

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  qr_card_id uuid REFERENCES qr_cards(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE, checkin_method checkin_method NOT NULL,
  manual_reason text, checked_in_at timestamptz NOT NULL DEFAULT now(),
  scanned_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  snapshot_stage person_stage NOT NULL, snapshot_compound_id uuid REFERENCES compounds(id) ON DELETE SET NULL,
  snapshot_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT one_person_per_service UNIQUE (service_id, person_id),
  CONSTRAINT manual_reason_required CHECK (checkin_method != 'MANUAL_SEARCH' OR length(trim(coalesce(manual_reason, ''))) >= 3)
);
CREATE INDEX attendance_service_time ON attendance_records(service_id, checked_in_at DESC);
CREATE INDEX attendance_person_time ON attendance_records(person_id, checked_in_at DESC);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  action_type text NOT NULL, target_entity text NOT NULL, target_id uuid NOT NULL,
  previous_state jsonb, new_state jsonb
);
CREATE FUNCTION reject_audit_changes() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_changes();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_changes();

ALTER TABLE compounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION rpc_process_card_checkin(
  p_service_id uuid, p_token_hash char(64), p_short_code varchar(10),
  p_idempotency_key uuid, p_method checkin_method, p_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s services%ROWTYPE; c qr_cards%ROWTYPE; p people%ROWTYPE; a attendance_records%ROWTYPE;
BEGIN
  -- The API authenticates and authorizes staff; the function checks again at the data boundary.
  IF NOT EXISTS (SELECT 1 FROM staff_users WHERE id=p_staff_id AND is_active AND role IN ('USHER_SCANNER','REGISTRATION_DESK','SERVICE_SUPERVISOR','ADMIN')) THEN
    RETURN jsonb_build_object('outcome','FORBIDDEN');
  END IF;
  IF p_method NOT IN ('QR_SCAN','SHORTCODE_ENTRY') OR (p_token_hash IS NULL) = (p_short_code IS NULL) THEN
    RETURN jsonb_build_object('outcome','INVALID_CREDENTIAL');
  END IF;
  SELECT * INTO s FROM services WHERE id=p_service_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','INVALID_SERVICE'); END IF;
  SELECT * INTO c FROM qr_cards WHERE (p_token_hash IS NOT NULL AND token_hash=p_token_hash)
    OR (p_short_code IS NOT NULL AND short_code=p_short_code) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','CARD_NOT_RECOGNIZED'); END IF;
  SELECT * INTO a FROM attendance_records WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF a.service_id <> p_service_id OR a.person_id <> c.person_id OR a.qr_card_id IS DISTINCT FROM c.id OR a.checkin_method <> p_method THEN
      RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT');
    END IF;
    RETURN jsonb_build_object('outcome','ALREADY_CHECKED_IN','checked_in_at',a.checked_in_at);
  END IF;
  IF s.status <> 'CHECKIN_OPEN' OR now() NOT BETWEEN s.checkin_opens_at AND s.checkin_closes_at THEN
    RETURN jsonb_build_object('outcome','SERVICE_CLOSED');
  END IF;
  IF c.status <> 'ACTIVE' THEN RETURN jsonb_build_object('outcome','CARD_REVOKED'); END IF;
  SELECT * INTO p FROM people WHERE id=c.person_id AND deleted_at IS NULL AND lifecycle_stage NOT IN ('ARCHIVED','INACTIVE');
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','PERSON_INACTIVE'); END IF;
  BEGIN
    INSERT INTO attendance_records(service_id,person_id,qr_card_id,idempotency_key,checkin_method,scanned_by_staff_id,
      snapshot_stage,snapshot_compound_id,snapshot_course_id)
    VALUES (p_service_id,p.id,c.id,p_idempotency_key,p_method,p_staff_id,p.lifecycle_stage,p.compound_id,p.course_id)
    ON CONFLICT (service_id, person_id) DO NOTHING RETURNING * INTO a;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry with the same event key can lose the insert race. Re-read
    -- the committed row so the replay returns the stable ALREADY_CHECKED_IN outcome.
    SELECT * INTO a FROM attendance_records WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN
      IF a.service_id <> p_service_id OR a.person_id <> c.person_id OR a.qr_card_id IS DISTINCT FROM c.id OR a.checkin_method <> p_method THEN
        RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT');
      END IF;
      RETURN jsonb_build_object('outcome','ALREADY_CHECKED_IN','checked_in_at',a.checked_in_at,
        'person',jsonb_build_object('member_code',p.member_code,'full_name',p.first_name || ' ' || p.last_name));
    END IF;
    RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT');
  END;
  IF a.id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','CHECKED_IN','checked_in_at',a.checked_in_at,
      'person',jsonb_build_object('member_code',p.member_code,'full_name',p.first_name || ' ' || p.last_name));
  END IF;
  SELECT * INTO a FROM attendance_records WHERE service_id=p_service_id AND person_id=p.id;
  RETURN jsonb_build_object('outcome','ALREADY_CHECKED_IN','checked_in_at',a.checked_in_at,
    'person',jsonb_build_object('member_code',p.member_code,'full_name',p.first_name || ' ' || p.last_name));
END;
$$;
REVOKE ALL ON FUNCTION rpc_process_card_checkin(uuid,char(64),varchar(10),uuid,checkin_method,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_process_card_checkin(uuid,char(64),varchar(10),uuid,checkin_method,uuid) TO service_role;
