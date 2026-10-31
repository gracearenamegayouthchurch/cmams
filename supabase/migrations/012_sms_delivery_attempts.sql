-- Track final delivery outcomes and every paid send attempt without changing the welcome body.
ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS delivery_state text NOT NULL DEFAULT 'PENDING'
  CHECK (delivery_state IN ('PENDING','DELIVERED','FAILED'));
ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS delivery_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS sms_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES sms_outbox(id) ON DELETE RESTRICT,
  attempted_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  recipient text NOT NULL,
  body text NOT NULL,
  provider_id text,
  outcome text NOT NULL CHECK (outcome IN ('SENT','FAILED','UNCERTAIN')),
  failure_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_attempts_outbox ON sms_attempts(outbox_id, attempted_at DESC);
ALTER TABLE sms_attempts ENABLE ROW LEVEL SECURITY;
