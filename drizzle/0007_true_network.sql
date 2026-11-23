CREATE TABLE "payment_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"transaction_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"block_number" bigint,
	"block_hash" text,
	"mined_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_observations_status_check" CHECK ("payment_observations"."status" in ('pending', 'confirming', 'confirmed', 'rejected', 'needs_review'))
);
--> statement-breakpoint
ALTER TABLE "payment_observations" ADD CONSTRAINT "payment_observations_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_observations_chain_hash_unique" ON "payment_observations" USING btree ("chain_id","transaction_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_observations_intent_unique" ON "payment_observations" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "payment_observations_due_idx" ON "payment_observations" USING btree ("status","next_attempt_at");