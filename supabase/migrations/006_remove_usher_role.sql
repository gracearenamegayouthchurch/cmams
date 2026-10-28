-- The Registration Desk handles scanning and check-in, so retire the Usher role.
-- The staff_role enum value remains for historical compatibility, but the
-- constraint below prevents any staff account from using it.

INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,previous_state,new_state)
SELECT NULL,'STAFF_ROLE_MIGRATED','staff_user',id,
  jsonb_build_object('role','USHER_SCANNER'),
  jsonb_build_object('role','REGISTRATION_DESK')
FROM staff_users WHERE role='USHER_SCANNER';

UPDATE staff_users
SET role='REGISTRATION_DESK',session_version=session_version+1
WHERE role='USHER_SCANNER';

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_not_usher;
ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_not_usher
  CHECK (role <> 'USHER_SCANNER');

CREATE OR REPLACE FUNCTION rpc_process_card_checkin(
  p_service_id uuid, p_token_hash char(64), p_short_code varchar(10),
  p_idempotency_key uuid, p_method checkin_method, p_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s services%ROWTYPE; c qr_cards%ROWTYPE; p people%ROWTYPE; a attendance_records%ROWTYPE;
BEGIN
  -- The API authenticates and authorizes staff; the function checks again at the data boundary.
  IF NOT EXISTS (SELECT 1 FROM staff_users WHERE id=p_staff_id AND is_active AND role IN ('REGISTRATION_DESK','SERVICE_SUPERVISOR','ADMIN')) THEN
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
