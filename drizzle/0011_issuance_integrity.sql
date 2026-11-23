-- Custom SQL migration file, put your code below! --
CREATE FUNCTION participation_validate_issuance_source_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  frozen_payload jsonb;
  creation_xid text;
  listed boolean;
BEGIN
  SELECT payload, xmin::text INTO frozen_payload, creation_xid
  FROM issuance_review_snapshots WHERE id = NEW.snapshot_id;
  IF frozen_payload IS NULL THEN
    RAISE EXCEPTION 'Frozen issuance snapshot does not exist';
  END IF;
  IF creation_xid IS DISTINCT FROM (pg_current_xact_id()::xid)::text THEN
    RAISE EXCEPTION 'Issuance source manifest is closed after snapshot creation';
  END IF;
  IF NEW.included THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(frozen_payload->'included') AS line,
        jsonb_array_elements_text(line->'paymentIds') AS payment_id
      WHERE payment_id = NEW.payment_id::text
    ) INTO listed;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(frozen_payload->'excluded') AS line
      WHERE line->>'paymentId' = NEW.payment_id::text
    ) INTO listed;
  END IF;
  IF NOT listed THEN
    RAISE EXCEPTION 'Issuance source does not exactly match the frozen payload';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issuance_review_sources_validate_insert BEFORE INSERT ON issuance_review_sources FOR EACH ROW EXECUTE FUNCTION participation_validate_issuance_source_insert();
--> statement-breakpoint
CREATE FUNCTION participation_validate_issuance_manifest_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_count integer;
  actual_count integer;
BEGIN
  IF jsonb_typeof(NEW.payload->'included') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.payload->'excluded') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.payload->'blockers') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Frozen issuance payload is missing canonical review arrays';
  END IF;
  SELECT
    (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'included') AS line,
      jsonb_array_elements_text(line->'paymentIds') AS payment_id)
    + (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'excluded') AS line)
  INTO expected_count;
  SELECT count(*) INTO actual_count FROM issuance_review_sources WHERE snapshot_id = NEW.id;
  IF expected_count IS NULL OR actual_count IS DISTINCT FROM expected_count THEN
    RAISE EXCEPTION 'Frozen issuance source manifest is incomplete';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER issuance_review_manifest_complete
AFTER INSERT ON issuance_review_snapshots DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION participation_validate_issuance_manifest_complete();
--> statement-breakpoint
CREATE FUNCTION participation_validate_issuance_decision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  frozen RECORD;
BEGIN
  SELECT period_key, revision, created_by_user_id, payload_sha256, payload
    INTO frozen FROM issuance_review_snapshots WHERE id = NEW.snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Frozen issuance snapshot does not exist';
  END IF;
  IF NEW.payload_sha256 IS DISTINCT FROM frozen.payload_sha256 THEN
    RAISE EXCEPTION 'Review decision hash does not match frozen issuance payload';
  END IF;
  IF NEW.reviewer_user_id = frozen.created_by_user_id THEN
    RAISE EXCEPTION 'Snapshot creator cannot review their own issuance payload';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app_role_assignments
    WHERE user_id = NEW.reviewer_user_id AND role = 'app_admin'
  ) THEN
    RAISE EXCEPTION 'Current app-admin role required for issuance decision';
  END IF;
  IF EXISTS (
    SELECT 1 FROM issuance_review_snapshots
    WHERE period_key = frozen.period_key AND revision > frozen.revision
  ) THEN
    RAISE EXCEPTION 'Superseded issuance revision cannot receive a decision';
  END IF;
  IF NEW.decision = 'approved' AND jsonb_array_length(frozen.payload->'blockers') > 0 THEN
    RAISE EXCEPTION 'Blocked issuance payload cannot be approved';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issuance_review_decisions_validate_insert BEFORE INSERT ON issuance_review_decisions FOR EACH ROW EXECUTE FUNCTION participation_validate_issuance_decision_insert();
