-- Apply after 003_registration_details.sql and before enabling cell endpoints.
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'CELL_LEADER';

CREATE TABLE cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  meeting_location text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cell_leader_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id uuid NOT NULL REFERENCES cells(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  assigned_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  CONSTRAINT cell_leader_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX one_current_leader_per_cell ON cell_leader_assignments(cell_id) WHERE valid_to IS NULL;
CREATE UNIQUE INDEX one_current_cell_per_leader ON cell_leader_assignments(staff_id) WHERE valid_to IS NULL;

CREATE TABLE cell_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id uuid NOT NULL REFERENCES cells(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  assigned_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  CONSTRAINT cell_member_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX one_current_cell_per_person ON cell_memberships(person_id) WHERE valid_to IS NULL;
CREATE INDEX cell_membership_lookup ON cell_memberships(cell_id, person_id) WHERE valid_to IS NULL;

CREATE TABLE cell_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id uuid NOT NULL REFERENCES cells(id) ON DELETE RESTRICT,
  scheduled_start_at timestamptz NOT NULL,
  checkin_opens_at timestamptz NOT NULL,
  checkin_closes_at timestamptz NOT NULL,
  status service_status NOT NULL DEFAULT 'SCHEDULED',
  created_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cell_meeting_window CHECK (checkin_closes_at > checkin_opens_at)
);
CREATE INDEX cell_meeting_schedule ON cell_meetings(cell_id, scheduled_start_at DESC);

CREATE TABLE cell_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES cell_meetings(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  qr_card_id uuid REFERENCES qr_cards(id) ON DELETE RESTRICT,
  checked_in_by_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL UNIQUE,
  checkin_method checkin_method NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, person_id)
);
CREATE INDEX cell_attendance_by_meeting ON cell_attendance(meeting_id, checked_in_at DESC);

ALTER TABLE cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_leader_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_attendance ENABLE ROW LEVEL SECURITY;
