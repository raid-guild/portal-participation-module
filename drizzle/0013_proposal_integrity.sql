-- Custom SQL migration file, put your code below! --
CREATE TRIGGER issuance_proposal_artifacts_immutable BEFORE UPDATE OR DELETE ON issuance_proposal_artifacts FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER issuance_proposal_decisions_immutable BEFORE UPDATE OR DELETE ON issuance_proposal_decisions FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE FUNCTION participation_validate_proposal_artifact_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  frozen RECORD;
BEGIN
  SELECT period_key, revision, payload_sha256, payload INTO frozen
    FROM issuance_review_snapshots WHERE id = NEW.snapshot_id;
  IF NOT FOUND OR NEW.snapshot_sha256 IS DISTINCT FROM frozen.payload_sha256 THEN
    RAISE EXCEPTION 'Proposal artifact is not bound to the frozen issuance snapshot';
  END IF;
  IF NEW.artifact->>'snapshotSha256' IS DISTINCT FROM frozen.payload_sha256
    OR NEW.artifact->>'snapshotId' IS DISTINCT FROM NEW.snapshot_id::text
    OR NEW.artifact->>'artifactSha256' IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal artifact payload does not match its frozen source';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(frozen.period_key), 91843);
  IF EXISTS (
    SELECT 1 FROM issuance_review_snapshots
    WHERE period_key = frozen.period_key AND revision > frozen.revision
  ) THEN
    RAISE EXCEPTION 'Superseded issuance revision cannot produce a proposal artifact';
  END IF;
  IF jsonb_array_length(frozen.payload->'blockers') > 0 OR NOT EXISTS (
    SELECT 1 FROM issuance_review_decisions
    WHERE snapshot_id = NEW.snapshot_id AND decision = 'approved'
      AND payload_sha256 = frozen.payload_sha256
  ) THEN
    RAISE EXCEPTION 'Proposal artifact requires independently approved unblocked issuance evidence';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app_role_assignments
    WHERE user_id = NEW.builder_user_id AND role = 'app_admin'
  ) THEN
    RAISE EXCEPTION 'Current app-admin role required to build proposal artifact';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issuance_proposal_artifacts_validate_insert BEFORE INSERT ON issuance_proposal_artifacts FOR EACH ROW EXECUTE FUNCTION participation_validate_proposal_artifact_insert();
--> statement-breakpoint
CREATE FUNCTION participation_validate_proposal_decision_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  proposal RECORD;
BEGIN
  SELECT a.artifact_sha256, a.builder_user_id, a.expires_at, a.artifact,
    s.id AS snapshot_id, s.period_key, s.revision, s.payload, s.cutoff_at,
    s.membership_run_id, s.payload_sha256
    INTO proposal FROM issuance_proposal_artifacts a
    JOIN issuance_review_snapshots s ON s.id = a.snapshot_id
    WHERE a.id = NEW.artifact_id;
  IF NOT FOUND OR NEW.artifact_sha256 IS DISTINCT FROM proposal.artifact_sha256 THEN
    RAISE EXCEPTION 'Proposal decision hash does not match the exact simulated artifact';
  END IF;
  -- This is the same period lock taken before freezing a new revision and by
  -- the application decision path. Direct SQL inserts cannot race a freeze.
  PERFORM pg_advisory_xact_lock(hashtext(proposal.period_key), 91843);
  IF EXISTS (
    SELECT 1 FROM issuance_review_snapshots
    WHERE period_key = proposal.period_key AND revision > proposal.revision
  ) OR NOT EXISTS (
    SELECT 1 FROM issuance_review_decisions
    WHERE snapshot_id = proposal.snapshot_id AND decision = 'approved'
      AND payload_sha256 = proposal.payload_sha256
  ) OR jsonb_array_length(proposal.payload->'blockers') > 0
    OR jsonb_array_length(proposal.payload->'excluded') > 0 THEN
    RAISE EXCEPTION 'Proposal decision source issuance revision is superseded, unapproved, or blocked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payments p
    WHERE p.period_key = proposal.period_key AND p.plan_key LIKE 'member_share_%'
      AND NOT EXISTS (
        SELECT 1 FROM issuance_review_sources src
        WHERE src.snapshot_id = proposal.snapshot_id AND src.payment_id = p.id AND src.included
      )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(proposal.payload->'included') AS line,
      jsonb_array_elements_text(line->'paymentIds') AS payment_id
    WHERE NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id::text = payment_id AND p.user_id::text = line->>'userId'
        AND p.period_key = proposal.period_key AND p.status = 'confirmed'
        AND p.rail = 'stablecoin_direct' AND p.provider = 'gnosis-wxdai-direct'
        AND p.chain_id = 100 AND p.currency = 'USD' AND p.transaction_hash IS NOT NULL
        AND p.block_number IS NOT NULL AND p.confirmed_at < proposal.cutoff_at
        AND p.amount_minor_units = substring(p.plan_key FROM 14)::integer * 100
        AND p.plan_key ~ '^member_share_(20|40|60|80|100|120|140|160|180|200)$'
        AND NOT EXISTS (
          SELECT 1 FROM payment_observations o
          WHERE o.intent_id = p.intent_id AND o.status = 'needs_review'
        )
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(proposal.payload->'included') AS line
    WHERE (SELECT coalesce(sum(p.amount_minor_units), 0) FROM payments p
      WHERE p.id::text IN (SELECT jsonb_array_elements_text(line->'paymentIds')))
      IS DISTINCT FROM (line->>'amountMinorUnits')::integer
  ) THEN
    RAISE EXCEPTION 'Proposal decision payment evidence changed after freeze';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(proposal.payload->'included') AS line
    WHERE NOT EXISTS (
      SELECT 1 FROM wallet_links w
      JOIN dao_membership_snapshots ms ON ms.wallet_link_id = w.id
      JOIN dao_membership_runs mr ON mr.id = ms.run_id
      WHERE w.user_id::text = line->>'userId' AND w.chain_id = 100
        AND lower(w.address) = lower(line->>'recipientAddress')
        AND w.verified_at IS NOT NULL AND w.revoked_at IS NULL
        AND ms.run_id = proposal.membership_run_id AND ms.user_id = w.user_id
        AND lower(ms.wallet_address) = lower(w.address) AND ms.eligible
        AND ms.share_balance_raw >= 100000000000000000000::numeric
        AND ms.share_balance_raw >= mr.threshold_raw
        AND mr.status = 'succeeded' AND mr.chain_id = 100
        AND mr.cutoff_block_hash = proposal.payload #>> '{membership,cutoffBlockHash}'
        AND mr.cutoff_block_number::text = proposal.payload #>> '{membership,cutoffBlockNumber}'
        AND lower(mr.dao_address) = lower(proposal.payload #>> '{membership,daoAddress}')
        AND lower(mr.shares_token_address) = lower(proposal.payload #>> '{membership,sharesTokenAddress}')
        AND (SELECT count(DISTINCT lower(w2.address))
          FROM dao_membership_snapshots ms2 JOIN wallet_links w2 ON w2.id = ms2.wallet_link_id
          WHERE ms2.run_id = proposal.membership_run_id AND ms2.user_id = w.user_id
            AND ms2.eligible AND ms2.share_balance_raw >= mr.threshold_raw
            AND w2.chain_id = 100 AND w2.verified_at IS NOT NULL AND w2.revoked_at IS NULL) = 1
    )
  ) THEN
    RAISE EXCEPTION 'Proposal decision wallet or DAO membership evidence changed after freeze';
  END IF;
  IF NEW.reviewer_user_id = proposal.builder_user_id THEN
    RAISE EXCEPTION 'Proposal builder cannot approve their own simulation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app_role_assignments
    WHERE user_id = NEW.reviewer_user_id AND role = 'app_admin'
  ) THEN
    RAISE EXCEPTION 'Current app-admin role required for proposal decision';
  END IF;
  IF NEW.decision = 'approved' AND (
    proposal.expires_at <= now()
    OR proposal.artifact #>> '{simulation,actionSuccess}' IS DISTINCT FROM 'true'
    OR proposal.artifact #>> '{simulation,submissionSuccess}' IS DISTINCT FROM 'true'
  ) THEN
    RAISE EXCEPTION 'Expired or failed proposal simulation cannot be approved';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issuance_proposal_decisions_validate_insert BEFORE INSERT ON issuance_proposal_decisions FOR EACH ROW EXECUTE FUNCTION participation_validate_proposal_decision_insert();
