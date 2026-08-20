CREATE TABLE "participation_metric_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer NOT NULL,
	"snapshot_key" text NOT NULL,
	"cycle_key" text NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"source_system" text NOT NULL,
	"source_task_key" text NOT NULL,
	"source_run_id" text NOT NULL,
	"artifact_sha256" text NOT NULL,
	"status" text DEFAULT 'provisional' NOT NULL,
	"member_count" integer NOT NULL,
	"matched_count" integer NOT NULL,
	"unmatched_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participation_metric_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"user_id" uuid,
	"wallet_address" text NOT NULL,
	"display_name" text,
	"engagement_score" integer NOT NULL,
	"stewardship_score" integer NOT NULL,
	"contribution_score" integer NOT NULL,
	"total_score" integer NOT NULL,
	"evidence_refs" text[] DEFAULT '{}' NOT NULL,
	"audit_flags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participation_metric_lines" ADD CONSTRAINT "participation_metric_lines_import_id_participation_metric_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."participation_metric_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_metric_lines" ADD CONSTRAINT "participation_metric_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participation_metric_imports_source_run_unique" ON "participation_metric_imports" USING btree ("source_system","source_run_id");--> statement-breakpoint
CREATE INDEX "participation_metric_imports_snapshot_idx" ON "participation_metric_imports" USING btree ("snapshot_key","generated_at");--> statement-breakpoint
CREATE INDEX "participation_metric_imports_cycle_idx" ON "participation_metric_imports" USING btree ("cycle_key","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_metric_lines_import_wallet_unique" ON "participation_metric_lines" USING btree ("import_id","wallet_address");--> statement-breakpoint
CREATE INDEX "participation_metric_lines_user_idx" ON "participation_metric_lines" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "participation_metric_lines_import_idx" ON "participation_metric_lines" USING btree ("import_id");