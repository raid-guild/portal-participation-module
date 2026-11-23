CREATE TABLE "issuance_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"payload_sha256" text NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuance_review_decisions_decision_check" CHECK ("issuance_review_decisions"."decision" in ('approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "issuance_review_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" text NOT NULL,
	"revision" integer NOT NULL,
	"supersedes_id" uuid,
	"cutoff_at" timestamp with time zone NOT NULL,
	"membership_run_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"payment_basis" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuance_review_snapshots_basis_check" CHECK ("issuance_review_snapshots"."payment_basis" in ('gross', 'net', 'unresolved'))
);
--> statement-breakpoint
CREATE TABLE "issuance_review_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"included" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participation_metric_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"content_sha256" text NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participation_metric_imports" ADD COLUMN "content_sha256" text;--> statement-breakpoint
ALTER TABLE "issuance_review_decisions" ADD CONSTRAINT "issuance_review_decisions_snapshot_id_issuance_review_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."issuance_review_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_review_decisions" ADD CONSTRAINT "issuance_review_decisions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_review_snapshots" ADD CONSTRAINT "issuance_review_snapshots_membership_run_id_dao_membership_runs_id_fk" FOREIGN KEY ("membership_run_id") REFERENCES "public"."dao_membership_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_review_snapshots" ADD CONSTRAINT "issuance_review_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_review_sources" ADD CONSTRAINT "issuance_review_sources_snapshot_id_issuance_review_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."issuance_review_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_review_sources" ADD CONSTRAINT "issuance_review_sources_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_metric_approvals" ADD CONSTRAINT "participation_metric_approvals_import_id_participation_metric_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."participation_metric_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_metric_approvals" ADD CONSTRAINT "participation_metric_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_review_decisions_snapshot_reviewer_unique" ON "issuance_review_decisions" USING btree ("snapshot_id","reviewer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_review_snapshots_period_revision_unique" ON "issuance_review_snapshots" USING btree ("period_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_review_snapshots_payload_hash_unique" ON "issuance_review_snapshots" USING btree ("payload_sha256");--> statement-breakpoint
CREATE INDEX "issuance_review_snapshots_period_idx" ON "issuance_review_snapshots" USING btree ("period_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_review_sources_snapshot_payment_unique" ON "issuance_review_sources" USING btree ("snapshot_id","payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_metric_approvals_import_unique" ON "participation_metric_approvals" USING btree ("import_id");
--> statement-breakpoint
CREATE FUNCTION participation_reject_immutable_review_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable review evidence cannot be updated or deleted';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issuance_review_snapshots_immutable BEFORE UPDATE OR DELETE ON issuance_review_snapshots FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER issuance_review_sources_immutable BEFORE UPDATE OR DELETE ON issuance_review_sources FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER issuance_review_decisions_immutable BEFORE UPDATE OR DELETE ON issuance_review_decisions FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER participation_metric_approvals_immutable BEFORE UPDATE OR DELETE ON participation_metric_approvals FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER participation_metric_imports_immutable BEFORE UPDATE OR DELETE ON participation_metric_imports FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
--> statement-breakpoint
CREATE TRIGGER participation_metric_lines_immutable BEFORE UPDATE OR DELETE ON participation_metric_lines FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
