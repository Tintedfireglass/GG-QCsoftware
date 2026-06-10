CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"visitor_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"name" varchar,
	"path" varchar,
	"referrer" text,
	"metadata" jsonb,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "analytics_events_type_check" CHECK ((type)::text = ANY ((ARRAY['pageview'::character varying, 'event'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "app_releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" varchar NOT NULL,
	"channel" varchar DEFAULT 'stable' NOT NULL,
	"version" varchar NOT NULL,
	"notes" text,
	"mandatory" boolean DEFAULT false NOT NULL,
	"store_url" varchar,
	"file_name" varchar,
	"file_path" varchar,
	"file_size" bigint,
	"content_type" varchar,
	"sha256" varchar,
	"is_published" boolean DEFAULT false NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"company_name" varchar,
	"phone" varchar,
	"email" varchar NOT NULL,
	"service" varchar DEFAULT 'PRAMAAN',
	"description" text,
	"source" varchar DEFAULT 'store-website',
	"status" varchar DEFAULT 'new' NOT NULL,
	"ip_hash" varchar,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contact_submissions_status_check" CHECK ((status)::text = ANY ((ARRAY['new'::character varying, 'read'::character varying, 'archived'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"customer_user_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "coupon_redemptions_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar NOT NULL,
	"description" text,
	"discount_type" varchar NOT NULL,
	"discount_value" integer NOT NULL,
	"max_discount_cents" integer,
	"currency" varchar,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"max_redemptions" integer,
	"times_redeemed" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer DEFAULT 1,
	"applicable_plan_ids" integer[],
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_discount_type_check" CHECK ((discount_type)::text = ANY ((ARRAY['percent'::character varying, 'fixed'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "email_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"key" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "mobile_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_user_id" integer NOT NULL,
	"device_id" varchar NOT NULL,
	"product_type" varchar DEFAULT 'android' NOT NULL,
	"model" varchar,
	"manufacturer" varchar,
	"brand" varchar,
	"os" varchar,
	"android_version" varchar,
	"api_level" integer,
	"processor" varchar,
	"serial_number" varchar,
	"ram" varchar,
	"storage" varchar,
	"info_json" jsonb,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" varchar NOT NULL,
	"customer_user_id" integer NOT NULL,
	"device_id" varchar NOT NULL,
	"product_type" varchar DEFAULT 'android' NOT NULL,
	"report_type" varchar NOT NULL,
	"test_type" varchar,
	"result" varchar,
	"score" integer,
	"grade" varchar,
	"passed_count" integer,
	"failed_count" integer,
	"tested_at" timestamp with time zone,
	"payload_json" jsonb NOT NULL,
	"device_snapshot_json" jsonb,
	"submission_ip" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_stress_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile_report_id" integer NOT NULL,
	"elapsed_sec" integer NOT NULL,
	"gips" numeric,
	"phase" varchar
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar NOT NULL,
	"code_hash" varchar NOT NULL,
	"purpose" varchar DEFAULT 'login' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_gateways" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"event_type" varchar,
	"received_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"billing_type" varchar NOT NULL,
	"interval" varchar,
	"price_cents" integer NOT NULL,
	"currency" varchar DEFAULT 'INR' NOT NULL,
	"product_scope" text[] NOT NULL,
	"platform_caps" jsonb NOT NULL,
	"duration_days" integer,
	"features" jsonb DEFAULT '[]'::jsonb,
	"allow_auto_renew" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "plans_billing_type_check" CHECK ((billing_type)::text = ANY ((ARRAY['one_time'::character varying, 'recurring'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "sms_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"visitor_id" varchar NOT NULL,
	"ip_hash" varchar,
	"country" varchar,
	"referrer" text,
	"referrer_domain" varchar,
	"utm_source" varchar,
	"utm_medium" varchar,
	"utm_campaign" varchar,
	"device_type" varchar,
	"browser" varchar,
	"os" varchar,
	"landing_path" varchar,
	"user_agent" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"customer_user_id" integer,
	"pageview_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "visitor_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "customer_users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "qc_results" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_monthly_keys" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_quarterly_keys" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_6month_keys" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_yearly_keys" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_perpetual_keys" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "product_scope" text[] DEFAULT ARRAY['windows']::text[];--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "platform_caps" jsonb;--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "auto_renew" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "renewal_plan_id" integer;--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "gateway_customer_ref" varchar;--> statement-breakpoint
ALTER TABLE "license_keys" ADD COLUMN "gateway_token_ref" varchar;--> statement-breakpoint
ALTER TABLE "license_key_activations" ADD COLUMN "platform" varchar DEFAULT 'windows';--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "company" varchar;--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "phone" varchar;--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "first_name" varchar;--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "last_name" varchar;--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "customer_users" ADD COLUMN "country_code" varchar;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "plan_id" integer;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "auto_renew" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "is_renewal" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "subtotal_cents" integer;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "coupon_id" integer;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD COLUMN "pending_password" varchar;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_created" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_session" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_type" ON "analytics_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_path" ON "analytics_events" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_app_releases_platform_channel_version" ON "app_releases" USING btree ("platform","channel","version");--> statement-breakpoint
CREATE INDEX "idx_app_releases_lookup" ON "app_releases" USING btree ("platform","channel","is_published");--> statement-breakpoint
CREATE INDEX "idx_contact_submissions_created" ON "contact_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contact_submissions_status" ON "contact_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_coupon_redemptions_coupon" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "idx_coupon_redemptions_customer" ON "coupon_redemptions" USING btree ("coupon_id","customer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_providers_provider" ON "email_providers" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mobile_devices_user_device" ON "mobile_devices" USING btree ("customer_user_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mobile_reports_report_id" ON "mobile_reports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_mobile_reports_user_time" ON "mobile_reports" USING btree ("customer_user_id","tested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_mobile_reports_device" ON "mobile_reports" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_mobile_reports_type" ON "mobile_reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "idx_mobile_stress_samples_report" ON "mobile_stress_samples" USING btree ("mobile_report_id");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_phone" ON "otp_codes" USING btree ("phone","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_gateways_provider" ON "payment_gateways" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_webhook_events_provider_event" ON "payment_webhook_events" USING btree ("provider" text_ops,"event_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sms_providers_provider" ON "sms_providers" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE INDEX "idx_visitor_sessions_started" ON "visitor_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_visitor_sessions_visitor" ON "visitor_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "idx_visitor_sessions_bot" ON "visitor_sessions" USING btree ("is_bot");--> statement-breakpoint
CREATE INDEX "idx_customer_users_phone" ON "customer_users" USING btree ("phone");