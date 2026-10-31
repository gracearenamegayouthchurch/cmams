-- SMS infrastructure: deliberately disabled and manual until the church configures delivery.
CREATE TABLE sms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  welcome_mode text NOT NULL DEFAULT 'MANUAL' CHECK (welcome_mode IN ('MANUAL','IMMEDIATE','DAILY')),
  daily_time text NOT NULL DEFAULT '18:00' CHECK (daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  welcome_template text NOT NULL DEFAULT 'Hello {firstName}, welcome to our church! We are glad you joined us.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT welcome_template_length CHECK (length(welcome_template) BETWEEN 1 AND 1400)
);
INSERT INTO sms_settings(id) VALUES(true);

CREATE TABLE sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('WELCOME','EVENT','CHECKIN_CODE')),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  recipient text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1530),
  status text NOT NULL CHECK (status IN ('HELD','PENDING','PROCESSING','SENT','FAILED','UNCERTAIN')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  provider_id text,
  failure_reason text,
  created_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT due_if_pending CHECK (status <> 'PENDING' OR due_at IS NOT NULL)
);
CREATE UNIQUE INDEX one_welcome_per_person ON sms_outbox(person_id) WHERE kind='WELCOME';
CREATE INDEX sms_outbox_due ON sms_outbox(due_at) WHERE status='PENDING';
ALTER TABLE sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_outbox ENABLE ROW LEVEL SECURITY;
-- Only the server's privileged connection can read or write settings, recipient and body.
