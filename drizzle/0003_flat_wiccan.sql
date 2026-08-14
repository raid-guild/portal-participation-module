CREATE TYPE "public"."dao_membership_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "dao_membership_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"dao_address" text NOT NULL,
	"shares_token_address" text NOT NULL,
	"cutoff_block_number" bigint,
	"cutoff_block_hash" text,
	"threshold_raw" numeric(78, 0) NOT NULL,
	"token_decimals" integer,
	"status" "dao_membership_run_status" DEFAULT 'running' NOT NULL,
	"initiated_by" text NOT NULL,
	"wallet_count" integer DEFAULT 0 NOT NULL,
	"eligible_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dao_membership_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_link_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"share_balance_raw" numeric(78, 0) NOT NULL,
	"eligible" boolean NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dao_membership_snapshots" ADD CONSTRAINT "dao_membership_snapshots_run_id_dao_membership_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."dao_membership_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dao_membership_snapshots" ADD CONSTRAINT "dao_membership_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dao_membership_snapshots" ADD CONSTRAINT "dao_membership_snapshots_wallet_link_id_wallet_links_id_fk" FOREIGN KEY ("wallet_link_id") REFERENCES "public"."wallet_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dao_membership_runs_status_created_idx" ON "dao_membership_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dao_membership_snapshots_run_wallet_unique" ON "dao_membership_snapshots" USING btree ("run_id","wallet_link_id");--> statement-breakpoint
CREATE INDEX "dao_membership_snapshots_run_idx" ON "dao_membership_snapshots" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "dao_membership_snapshots_user_idx" ON "dao_membership_snapshots" USING btree ("user_id");