-- Keep the provider's raw delivery report so staff can see why a message is pending.
ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS provider_status text;
