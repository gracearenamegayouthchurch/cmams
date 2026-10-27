-- Apply after 001_cmams.sql, before deploying staff-management API code.
-- Existing accounts remain usable; newly issued temporary passwords require rotation.
ALTER TABLE staff_users
  ADD COLUMN session_version integer NOT NULL DEFAULT 0,
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
