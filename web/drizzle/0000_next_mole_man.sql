-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" varchar NOT NULL,
	"serial_number" varchar,
	"mac_address" varchar,
	"manufacturer" varchar,
	"model" varchar,
	"last_seen" timestamp,
	"location" varchar,
	"created_at" timestamp DEFAULT now(),
	"hardware_fingerprint" varchar,
	"computer_name" varchar,
	"asset_tag" varchar,
	"owner_user_id" integer,
	"group_id" integer,
	"custom_name" varchar
);
--> statement-breakpoint
CREATE TABLE "qc_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" varchar NOT NULL,
	"machine_id" integer,
	"timestamp" timestamp NOT NULL,
	"refurbish_id" varchar,
	"technician_notes" text,
	"overall_pass" boolean NOT NULL,
	"system_manufacturer" varchar,
	"system_model" varchar,
	"system_serial" varchar,
	"mac_address" varchar,
	"cpu_model" varchar,
	"ram_total" bigint,
	"system_info_json" jsonb,
	"cpu_details_json" jsonb,
	"ram_details_json" jsonb,
	"storage_details_json" jsonb,
	"battery_details_json" jsonb,
	"device_details_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"technician_id" integer,
	"overall_score" integer DEFAULT 0,
	"overall_grade" varchar DEFAULT '',
	"pramaan_score" integer,
	"pramaan_grade" varchar,
	"pramaan_category_scores" jsonb,
	"pramaan_risk_flags" jsonb,
	"pramaan_algorithm_version" varchar,
	"health_id" uuid,
	"pramaan_hash" varchar,
	"app_version" varchar,
	"submission_ip" varchar,
	"is_demo" boolean DEFAULT false,
	"demo_license_key_id" integer
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"qc_result_id" integer,
	"test_type" varchar NOT NULL,
	"tested" boolean NOT NULL,
	"passed" boolean NOT NULL,
	"message" varchar,
	"details_json" jsonb,
	"timestamp" timestamp,
	"score" integer DEFAULT 0,
	"grade" varchar DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"role" varchar DEFAULT 'Viewer',
	"email" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer,
	"display_name" varchar,
	"license_credits" integer DEFAULT 0,
	"company_name" varchar,
	CONSTRAINT "users_role_check" CHECK ((role)::text = ANY ((ARRAY['SuperAdmin'::character varying, 'Employee'::character varying, 'Refurbisher'::character varying, 'Reseller'::character varying, 'Technician'::character varying, 'Enterprise'::character varying, 'OEM'::character varying, 'Insurer'::character varying, 'Client'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "machine_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"enterprise_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "pramaan_scoring_versions" (
	"version_id" varchar NOT NULL,
	"weights" jsonb NOT NULL,
	"grade_bands" jsonb NOT NULL,
	"risk_thresholds" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "license_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar NOT NULL,
	"type" varchar NOT NULL,
	"max_uses" integer NOT NULL,
	"current_uses" integer DEFAULT 0,
	"created_by" integer,
	"is_active" boolean DEFAULT true,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"customer_user_id" integer,
	"demo_customer_name" varchar,
	"demo_runs_used" integer DEFAULT 0,
	"demo_max_runs" integer DEFAULT 1,
	CONSTRAINT "license_keys_type_check" CHECK ((type)::text = ANY ((ARRAY['single_use'::character varying, 'bulk'::character varying, 'demo'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "license_key_activations" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_key_id" integer NOT NULL,
	"machine_serial" varchar NOT NULL,
	"activated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "license_key_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_key_id" integer NOT NULL,
	"action" varchar NOT NULL,
	"previous_is_active" boolean NOT NULL,
	"new_is_active" boolean NOT NULL,
	"performed_by" integer,
	"performed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "machine_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"source" varchar NOT NULL,
	"component_grades" jsonb NOT NULL,
	"created_by" integer,
	"app_version" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_lifecycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"event_type" varchar NOT NULL,
	"notes" text,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "customer_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"full_name" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "customer_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_user_id" integer NOT NULL,
	"plan" varchar NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar DEFAULT 'INR' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"payment_reference" varchar,
	"gateway_reference" varchar,
	"checkout_state" varchar NOT NULL,
	"generated_license_key_id" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "free_trials" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"machine_fingerprint" varchar NOT NULL,
	"machine_serial" varchar NOT NULL,
	"mac_address" varchar,
	"computer_name" varchar,
	"machine_id" integer,
	"trial_start_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_end_utc" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trial_email_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"trial_id" integer NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_machines_machine_id" ON "machines" USING btree ("machine_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_qc_results_machine" ON "qc_results" USING btree ("machine_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_qc_results_report_id" ON "qc_results" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_qc_results_timestamp" ON "qc_results" USING btree ("timestamp" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_test_results_qc" ON "test_results" USING btree ("qc_result_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_username" ON "users" USING btree ("username" text_ops);
*/