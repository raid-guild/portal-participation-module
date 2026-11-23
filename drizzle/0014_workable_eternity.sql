CREATE TABLE "member_contribution_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"portal_issuer" text NOT NULL,
	"portal_user_id" text NOT NULL,
	"wallet_link_id" uuid NOT NULL,
	"membership_run_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"plan_key" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"commerce_checkout_id" text,
	"checkout_url" text,
	"order_id" text,
	"cumulative_refunded_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorization_expires_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_contribution_checkouts_amount_check" CHECK ("member_contribution_checkouts"."amount_minor" between 2000 and 20000 and "member_contribution_checkouts"."amount_minor" % 2000 = 0),
	CONSTRAINT "member_contribution_checkouts_status_check" CHECK ("member_contribution_checkouts"."status" in ('creating','pending','captured','refunded','disputed','needs_review'))
);
--> statement-breakpoint
CREATE TABLE "member_contribution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_event_id" text NOT NULL,
	"checkout_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_contribution_checkouts" ADD CONSTRAINT "member_contribution_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_contribution_checkouts" ADD CONSTRAINT "member_contribution_checkouts_wallet_link_id_wallet_links_id_fk" FOREIGN KEY ("wallet_link_id") REFERENCES "public"."wallet_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_contribution_checkouts" ADD CONSTRAINT "member_contribution_checkouts_membership_run_id_dao_membership_runs_id_fk" FOREIGN KEY ("membership_run_id") REFERENCES "public"."dao_membership_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_contribution_events" ADD CONSTRAINT "member_contribution_events_checkout_id_member_contribution_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."member_contribution_checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_contribution_checkouts_user_period_unique" ON "member_contribution_checkouts" USING btree ("user_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "member_contribution_checkouts_commerce_unique" ON "member_contribution_checkouts" USING btree ("commerce_checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_contribution_events_source_unique" ON "member_contribution_events" USING btree ("source_event_id");
--> statement-breakpoint
CREATE TRIGGER member_contribution_events_immutable BEFORE UPDATE OR DELETE ON member_contribution_events FOR EACH ROW EXECUTE FUNCTION participation_reject_immutable_review_change();
