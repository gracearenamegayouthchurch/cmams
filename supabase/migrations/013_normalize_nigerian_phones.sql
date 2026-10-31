-- Repair Nigerian numbers saved with the local trunk zero after +234.
-- Example: +23408031234567 (14 digits) becomes +2348031234567 (13 digits).
UPDATE people
SET phone_e164 = '+234' || substring(phone_e164 from 6)
WHERE phone_e164 ~ '^\+2340[0-9]{10}$';

UPDATE sms_outbox
SET recipient = '234' || substring(recipient from 5)
WHERE recipient ~ '^2340[0-9]{10}$';
