CREATE TYPE "public"."billing_status" AS ENUM('active', 'past_due', 'canceled', 'not_started');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."issuance_status" AS ENUM('draft', 'review', 'proposed', 'executed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."participation_credential" AS ENUM('raidguild_member', 'cohort_grad', 'cohort_participant');--> statement-breakpoint
CREATE TYPE "public"."payment_rail" AS ENUM('fiat_recurring', 'stablecoin_direct');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'observed', 'confirmed', 'expired', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "app_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target" text NOT NULL,
	"snapshot_version" integer NOT NULL,
	"capabilities" text[] NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuance_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuance_period_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"recipient_address" text NOT NULL,
	"eligible_amount_minor_units" integer NOT NULL,
	"share_price_minor_units" integer NOT NULL,
	"share_amount" numeric(78, 18) NOT NULL,
	"status" "issuance_status" DEFAULT 'draft' NOT NULL,
	"exclusion_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuance_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"status" "issuance_status" DEFAULT 'draft' NOT NULL,
	"proposal_id" text,
	"transaction_hash" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_reference" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_link_id" uuid,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"rail" "payment_rail" NOT NULL,
	"plan_key" text NOT NULL,
	"period_key" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor_units" integer NOT NULL,
	"amount_atomic" numeric(78, 0),
	"chain_id" integer,
	"expected_sender" text,
	"recipient" text,
	"token_address" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_reference" text NOT NULL,
	"rail" "payment_rail" NOT NULL,
	"plan_key" text NOT NULL,
	"period_key" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor_units" integer NOT NULL,
	"amount_atomic" numeric(78, 0),
	"chain_id" integer,
	"transaction_hash" text,
	"block_number" bigint,
	"payer_wallet_address" text,
	"status" "payment_status" NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"rail" "payment_rail" NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_reference" text,
	"provider_subscription_reference" text,
	"status" "billing_status" DEFAULT 'not_started' NOT NULL,
	"current_period_starts_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_user_id" text NOT NULL,
	"portal_profile_id" text,
	"email" text,
	"display_name" text,
	"credentials" "participation_credential"[] DEFAULT '{}' NOT NULL,
	"credential_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"address" text NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_role_assignments" ADD CONSTRAINT "app_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_deliveries" ADD CONSTRAINT "entitlement_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_lines" ADD CONSTRAINT "issuance_lines_issuance_period_id_issuance_periods_id_fk" FOREIGN KEY ("issuance_period_id") REFERENCES "public"."issuance_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_lines" ADD CONSTRAINT "issuance_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuance_lines" ADD CONSTRAINT "issuance_lines_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_wallet_link_id_wallet_links_id_fk" FOREIGN KEY ("wallet_link_id") REFERENCES "public"."wallet_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_role_assignments_user_role_unique" ON "app_role_assignments" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_type","actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_deliveries_idempotency_key_unique" ON "entitlement_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "entitlement_deliveries_pending_idx" ON "entitlement_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_lines_period_user_unique" ON "issuance_lines" USING btree ("issuance_period_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_lines_payment_unique" ON "issuance_lines" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issuance_periods_period_key_unique" ON "issuance_periods" USING btree ("period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_reference_unique" ON "payment_events" USING btree ("provider","event_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_reference_unique" ON "payment_intents" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payment_intents_user_period_idx" ON "payment_intents" USING btree ("user_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_unique" ON "payments" USING btree ("provider","provider_payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_transaction_hash_unique" ON "payments" USING btree ("chain_id","transaction_hash");--> statement-breakpoint
CREATE INDEX "payments_user_period_idx" ON "payments" USING btree ("user_id","period_key");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_reference_unique" ON "subscriptions" USING btree ("provider","provider_subscription_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "users_portal_user_id_unique" ON "users" USING btree ("portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_links_chain_address_unique" ON "wallet_links" USING btree ("chain_id","address");--> statement-breakpoint
CREATE INDEX "wallet_links_user_id_idx" ON "wallet_links" USING btree ("user_id");--> statement-breakpoint
CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
