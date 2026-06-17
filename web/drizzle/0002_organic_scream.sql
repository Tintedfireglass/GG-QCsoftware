CREATE TABLE "support_ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender" varchar NOT NULL,
	"sender_admin_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "support_ticket_messages_sender_check" CHECK ((sender)::text = ANY ((ARRAY['admin'::character varying, 'customer'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" varchar NOT NULL,
	"customer_user_id" integer NOT NULL,
	"subject" varchar NOT NULL,
	"category" varchar,
	"message" text NOT NULL,
	"device_id" varchar,
	"app_version" varchar,
	"status" varchar DEFAULT 'open' NOT NULL,
	"priority" varchar DEFAULT 'normal' NOT NULL,
	"admin_note" text,
	"submission_ip" varchar,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "support_tickets_status_check" CHECK ((status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[])),
	CONSTRAINT "support_tickets_priority_check" CHECK ((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying])::text[]))
);
--> statement-breakpoint
CREATE INDEX "idx_support_ticket_messages_ticket" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_tickets_ticket_id" ON "support_tickets" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_created" ON "support_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_customer" ON "support_tickets" USING btree ("customer_user_id","created_at");