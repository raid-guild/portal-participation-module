CREATE TABLE "issuance_proposal_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"artifact_sha256" text NOT NULL,
	"builder_user_id" uuid NOT NULL,
	"submitter_address" text NOT NULL,
	"artifact" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuance_proposal_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_sha256" text NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuance_proposal_decisions_decision_check" CHECK ("issuance_proposal_decisions"."decision" in ('approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "issuance_proposal_artifacts" ADD CONSTRAINT "issuance_proposal_artifacts_snapshot_id_issuance_review_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."issuance_review_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_proposal_artifacts" ADD CONSTRAINT "issuance_proposal_artifacts_builder_user_id_users_id_fk" FOREIGN KEY ("builder_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_proposal_decisions" ADD CONSTRAINT "issuance_proposal_decisions_artifact_id_issuance_proposal_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."issuance_proposal_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_proposal_decisions" ADD CONSTRAINT "issuance_proposal_decisions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_proposal_artifacts_hash_unique" ON "issuance_proposal_artifacts" USING btree ("artifact_sha256");--> statement-breakpoint
CREATE INDEX "issuance_proposal_artifacts_snapshot_idx" ON "issuance_proposal_artifacts" USING btree ("snapshot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_proposal_decisions_artifact_unique" ON "issuance_proposal_decisions" USING btree ("artifact_id");