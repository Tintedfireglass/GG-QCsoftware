import { pgTable, index, serial, varchar, timestamp, integer, uniqueIndex, text, boolean, bigint, jsonb, uuid, check, date, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const machines = pgTable("machines", {
	id: serial().primaryKey().notNull(),
	machineId: varchar("machine_id").notNull(),
	serialNumber: varchar("serial_number"),
	macAddress: varchar("mac_address"),
	manufacturer: varchar(),
	model: varchar(),
	lastSeen: timestamp("last_seen", { mode: 'string' }),
	location: varchar(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	hardwareFingerprint: varchar("hardware_fingerprint"),
	computerName: varchar("computer_name"),
	assetTag: varchar("asset_tag"),
	ownerUserId: integer("owner_user_id"),
	groupId: integer("group_id"),
	customName: varchar("custom_name"),
}, (table) => [
	index("idx_machines_machine_id").using("btree", table.machineId.asc().nullsLast().op("text_ops")),
]);

export const qcResults = pgTable("qc_results", {
	id: serial().primaryKey().notNull(),
	reportId: varchar("report_id").notNull(),
	machineId: integer("machine_id"),
	timestamp: timestamp({ mode: 'string' }).notNull(),
	refurbishId: varchar("refurbish_id"),
	technicianNotes: text("technician_notes"),
	technicianLabel: text("technician_label"),
	overallPass: boolean("overall_pass").notNull(),
	systemManufacturer: varchar("system_manufacturer"),
	systemModel: varchar("system_model"),
	systemSerial: varchar("system_serial"),
	macAddress: varchar("mac_address"),
	cpuModel: varchar("cpu_model"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ramTotal: bigint("ram_total", { mode: "number" }),
	systemInfoJson: jsonb("system_info_json"),
	cpuDetailsJson: jsonb("cpu_details_json"),
	ramDetailsJson: jsonb("ram_details_json"),
	storageDetailsJson: jsonb("storage_details_json"),
	batteryDetailsJson: jsonb("battery_details_json"),
	deviceDetailsJson: jsonb("device_details_json"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	technicianId: integer("technician_id"),
	overallScore: integer("overall_score").default(0),
	overallGrade: varchar("overall_grade").default(""),
	healthScore: integer("health_score"),
	healthGrade: varchar("health_grade"),
	categoryScores: jsonb("category_scores"),
	riskFlags: jsonb("risk_flags"),
	scoringAlgorithmVersion: varchar("scoring_algorithm_version"),
	healthId: uuid("health_id"),
	healthHash: varchar("health_hash"),
	appVersion: varchar("app_version"),
	submissionIp: varchar("submission_ip"),
	isDemo: boolean("is_demo").default(false),
	demoLicenseKeyId: integer("demo_license_key_id"),
	isHidden: boolean("is_hidden").default(false).notNull(),
	physicalCondition: varchar("physical_condition"),
	scratchesAndDents: varchar("scratches_and_dents"),
}, (table) => [
	index("idx_qc_results_machine").using("btree", table.machineId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("idx_qc_results_report_id").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
	index("idx_qc_results_timestamp").using("btree", table.timestamp.desc().nullsFirst().op("timestamp_ops")),
]);

export const testResults = pgTable("test_results", {
	id: serial().primaryKey().notNull(),
	qcResultId: integer("qc_result_id"),
	testType: varchar("test_type").notNull(),
	tested: boolean().notNull(),
	passed: boolean().notNull(),
	message: varchar(),
	detailsJson: jsonb("details_json"),
	timestamp: timestamp({ mode: 'string' }),
	score: integer().default(0),
	grade: varchar().default(""),
}, (table) => [
	index("idx_test_results_qc").using("btree", table.qcResultId.asc().nullsLast().op("int4_ops")),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: varchar().notNull(),
	passwordHash: varchar("password_hash").notNull(),
	role: varchar().default('Viewer'),
	email: varchar(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	createdBy: integer("created_by"),
	displayName: varchar("display_name"),
	licenseCredits: integer("license_credits").default(0),
	companyName: varchar("company_name"),
	allowMonthlyKeys: boolean("allow_monthly_keys").default(false),
	allowQuarterlyKeys: boolean("allow_quarterly_keys").default(false),
	allow6MonthKeys: boolean("allow_6month_keys").default(false),
	allowYearlyKeys: boolean("allow_yearly_keys").default(false),
	allowPerpetualKeys: boolean("allow_perpetual_keys").default(false),
	// Per-platform license-generation permissions. Enforced for Employee users
	// (SuperAdmin assigns which platforms each Employee may generate keys for).
	allowWindowsKeys: boolean("allow_windows_keys").default(false),
	allowAndroidKeys: boolean("allow_android_keys").default(false),
	allowIosKeys: boolean("allow_ios_keys").default(false),
	allowMacKeys: boolean("allow_mac_keys").default(false),
}, (table) => [
	uniqueIndex("idx_users_username").using("btree", table.username.asc().nullsLast().op("text_ops")),
	check("users_role_check", sql`(role)::text = ANY ((ARRAY['SuperAdmin'::character varying, 'Employee'::character varying, 'Refurbisher'::character varying, 'Reseller'::character varying, 'Technician'::character varying, 'Enterprise'::character varying, 'OEM'::character varying, 'Insurer'::character varying, 'Client'::character varying])::text[])`),
]);

export const machineGroups = pgTable("machine_groups", {
	id: serial().primaryKey().notNull(),
	name: varchar().notNull(),
	description: text(),
	enterpriseUserId: integer("enterprise_user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const scoringVersions = pgTable("scoring_versions", {
	versionId: varchar("version_id").notNull(),
	weights: jsonb().notNull(),
	gradeBands: jsonb("grade_bands").notNull(),
	riskThresholds: jsonb("risk_thresholds").notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const licenseKeys = pgTable("license_keys", {
	id: serial().primaryKey().notNull(),
	key: varchar().notNull(),
	type: varchar().notNull(),
	maxUses: integer("max_uses").notNull(),
	currentUses: integer("current_uses").default(0),
	createdBy: integer("created_by"),
	isActive: boolean("is_active").default(true),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	customerUserId: integer("customer_user_id"),
	demoCustomerName: varchar("demo_customer_name"),
	demoRunsUsed: integer("demo_runs_used").default(0),
	demoMaxRuns: integer("demo_max_runs").default(1),
	// Platforms this key unlocks, e.g. {windows}, {windows,android}, {all}.
	productScope: text("product_scope").array().default(sql`ARRAY['windows']::text[]`),
	// Per-platform device cap, e.g. {"windows":2,"android":3}. Its keys mirror productScope;
	// the sum equals maxUses (kept in sync for credit/dashboard accounting).
	platformCaps: jsonb("platform_caps").$type<Record<string, number>>(),
	// Auto-renewal (saved-mandate). When true, a renewal job re-charges the saved
	// gateway token near expiry and extends expires_at by the renewal plan's duration.
	autoRenew: boolean("auto_renew").default(false),
	renewalPlanId: integer("renewal_plan_id"),
	gatewayCustomerRef: varchar("gateway_customer_ref"),
	gatewayTokenRef: varchar("gateway_token_ref"),
}, (table) => [
	check("license_keys_type_check", sql`(type)::text = ANY ((ARRAY['single_use'::character varying, 'bulk'::character varying, 'demo'::character varying])::text[])`),
]);

export const licenseKeyActivations = pgTable("license_key_activations", {
	id: serial().primaryKey().notNull(),
	licenseKeyId: integer("license_key_id").notNull(),
	machineSerial: varchar("machine_serial").notNull(),
	// Platform of the activated device: windows | android | ios | mac.
	platform: varchar().default('windows'),
	// Customer that made this activation (Android B2C). Null for PC/creator
	// activations. Carries per-customer entitlement for shared (bulk) keys.
	customerUserId: integer("customer_user_id"),
	activatedAt: timestamp("activated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const licenseKeyAudits = pgTable("license_key_audits", {
	id: serial().primaryKey().notNull(),
	licenseKeyId: integer("license_key_id").notNull(),
	action: varchar().notNull(),
	previousIsActive: boolean("previous_is_active").notNull(),
	newIsActive: boolean("new_is_active").notNull(),
	performedBy: integer("performed_by"),
	performedAt: timestamp("performed_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const machineHistory = pgTable("machine_history", {
	id: serial().primaryKey().notNull(),
	machineId: integer("machine_id").notNull(),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
	source: varchar().notNull(),
	componentGrades: jsonb("component_grades").notNull(),
	createdBy: integer("created_by"),
	appVersion: varchar("app_version"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const machineLifecycleEvents = pgTable("machine_lifecycle_events", {
	id: serial().primaryKey().notNull(),
	machineId: integer("machine_id").notNull(),
	eventType: varchar("event_type").notNull(),
	notes: text(),
	recordedBy: integer("recorded_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const customerUsers = pgTable("customer_users", {
	id: serial().primaryKey().notNull(),
	// email + passwordHash are NULLABLE: the Android app logs in by phone+OTP,
	// web checkout still sets them. See migration 0013.
	email: varchar(),
	passwordHash: varchar("password_hash"),
	fullName: varchar("full_name"),
	company: varchar(),
	phone: varchar(),
	firstName: varchar("first_name"),
	lastName: varchar("last_name"),
	dateOfBirth: date("date_of_birth"),
	countryCode: varchar("country_code"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_customer_users_phone").using("btree", table.phone),
]);

export const otpCodes = pgTable("otp_codes", {
	id: serial().primaryKey().notNull(),
	phone: varchar().notNull(),
	codeHash: varchar("code_hash").notNull(),
	purpose: varchar().default('login').notNull(),
	attempts: integer().default(0).notNull(),
	consumedAt: timestamp("consumed_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_otp_codes_phone").using("btree", table.phone, table.createdAt.desc()),
]);

export const mobileDevices = pgTable("mobile_devices", {
	id: serial().primaryKey().notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	deviceId: varchar("device_id").notNull(),
	productType: varchar("product_type").default('android').notNull(),
	model: varchar(),
	manufacturer: varchar(),
	brand: varchar(),
	os: varchar(),
	androidVersion: varchar("android_version"),
	apiLevel: integer("api_level"),
	processor: varchar(),
	serialNumber: varchar("serial_number"),
	ram: varchar(),
	storage: varchar(),
	infoJson: jsonb("info_json"),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_mobile_devices_user_device").using("btree", table.customerUserId, table.deviceId),
]);

export const mobileReports = pgTable("mobile_reports", {
	id: serial().primaryKey().notNull(),
	reportId: varchar("report_id").notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	deviceId: varchar("device_id").notNull(),
	productType: varchar("product_type").default('android').notNull(),
	reportType: varchar("report_type").notNull(),
	testType: varchar("test_type"),
	result: varchar(),
	score: integer(),
	grade: varchar(),
	passedCount: integer("passed_count"),
	failedCount: integer("failed_count"),
	testedAt: timestamp("tested_at", { withTimezone: true, mode: 'string' }),
	payloadJson: jsonb("payload_json").notNull(),
	deviceSnapshotJson: jsonb("device_snapshot_json"),
	submissionIp: varchar("submission_ip"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_mobile_reports_report_id").using("btree", table.reportId),
	index("idx_mobile_reports_user_time").using("btree", table.customerUserId, table.testedAt.desc()),
	index("idx_mobile_reports_device").using("btree", table.deviceId),
	index("idx_mobile_reports_type").using("btree", table.reportType),
]);

export const mobileStressSamples = pgTable("mobile_stress_samples", {
	id: serial().primaryKey().notNull(),
	mobileReportId: integer("mobile_report_id").notNull(),
	elapsedSec: integer("elapsed_sec").notNull(),
	gips: numeric(),
	phase: varchar(),
}, (table) => [
	index("idx_mobile_stress_samples_report").using("btree", table.mobileReportId),
]);

export const customerOrders = pgTable("customer_orders", {
	id: serial().primaryKey().notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	plan: varchar().notNull(),
	planId: integer("plan_id"),
	amountCents: integer("amount_cents").notNull(),
	currency: varchar().default('INR').notNull(),
	status: varchar().default('pending').notNull(),
	paymentReference: varchar("payment_reference"),
	gatewayReference: varchar("gateway_reference"),
	checkoutState: varchar("checkout_state").notNull(),
	generatedLicenseKeyId: integer("generated_license_key_id"),
	autoRenew: boolean("auto_renew").default(false),
	isRenewal: boolean("is_renewal").default(false),
	// Discount audit: price before discount, the discount applied, and the coupon used.
	// amount_cents stays the final charged amount (subtotal - discount).
	subtotalCents: integer("subtotal_cents"),
	discountCents: integer("discount_cents").default(0).notNull(),
	couponId: integer("coupon_id"),
	// Purchased quantity — multiplies the plan's per-platform device caps on the
	// minted key, and the price. Default 1.
	quantity: integer().default(1).notNull(),
	// Buyer-chosen per-platform device caps for per-platform checkout, e.g.
	// { windows: 4, android: 2 }. Null for legacy/uniform-quantity orders; when set
	// it's authoritative for the minted key (scope = its keys, maxUses = sum).
	platformCaps: jsonb("platform_caps").$type<Record<string, number>>(),
	// Transient plaintext of an auto-generated password for a brand-new customer,
	// emailed once on successful purchase then cleared. Null for existing customers.
	pendingPassword: varchar("pending_password"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const plans = pgTable("plans", {
	id: serial().primaryKey().notNull(),
	name: varchar().notNull(),
	description: text(),
	// Billing model: one_time purchase vs recurring subscription.
	billingType: varchar("billing_type").notNull(),
	// Recurring interval (month | year); null for one_time.
	interval: varchar(),
	priceCents: integer("price_cents").notNull(),
	currency: varchar().default('INR').notNull(),
	// Entitlement minted on purchase — mirrors license_keys product model.
	productScope: text("product_scope").array().notNull(),
	platformCaps: jsonb("platform_caps").$type<Record<string, number>>().notNull(),
	// License validity in days; null = perpetual.
	durationDays: integer("duration_days"),
	// Marketing feature bullets shown on the storefront plan card (ordered).
	features: jsonb().$type<string[]>().default(sql`'[]'::jsonb`),
	// Whether this (finite) plan offers the customer an auto-renew option at checkout.
	allowAutoRenew: boolean("allow_auto_renew").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	check("plans_billing_type_check", sql`(billing_type)::text = ANY ((ARRAY['one_time'::character varying, 'recurring'::character varying])::text[])`),
]);

// Discount/coupon codes applied at checkout. Independent of any single plan:
// applicable to all plans by default, optionally restricted to an allow-list.
export const coupons = pgTable("coupons", {
	id: serial().primaryKey().notNull(),
	// Stored uppercased; matched case-insensitively at checkout.
	code: varchar().notNull().unique(),
	description: text(),
	// percent → discountValue is 1..100; fixed → discountValue is an amount in cents.
	discountType: varchar("discount_type").notNull(),
	discountValue: integer("discount_value").notNull(),
	// Optional cap on the rupee/cent value of a percent discount (null = uncapped).
	maxDiscountCents: integer("max_discount_cents"),
	// For fixed coupons only: the currency the amount is denominated in (must match the plan).
	currency: varchar(),
	// Order subtotal must be at least this to qualify.
	minOrderCents: integer("min_order_cents").default(0).notNull(),
	// Global redemption cap (null = unlimited); times_redeemed counts paid redemptions.
	maxRedemptions: integer("max_redemptions"),
	timesRedeemed: integer("times_redeemed").default(0).notNull(),
	// Per-customer redemption cap (null = unlimited).
	perCustomerLimit: integer("per_customer_limit").default(1),
	// Plan allow-list; null/empty = applies to all plans.
	applicablePlanIds: integer("applicable_plan_ids").array(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }),
	validUntil: timestamp("valid_until", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	// Advertise this coupon on the public storefront checkout (apply-able chip).
	isPublic: boolean("is_public").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	check("coupons_discount_type_check", sql`(discount_type)::text = ANY ((ARRAY['percent'::character varying, 'fixed'::character varying])::text[])`),
]);

// One row per paid coupon use — enforces per-customer limits and gives an audit trail.
// Unique on order_id keeps callback retries idempotent.
export const couponRedemptions = pgTable("coupon_redemptions", {
	id: serial().primaryKey().notNull(),
	couponId: integer("coupon_id").notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	orderId: integer("order_id").notNull().unique(),
	discountCents: integer("discount_cents").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_coupon_redemptions_coupon").on(table.couponId),
	index("idx_coupon_redemptions_customer").on(table.couponId, table.customerUserId),
]);

// ── Storefront visitor analytics (first-party) ──
// A session is one visit; events are the pageviews + custom events within it.
// IPs are never stored raw — only a salted hash (for unique-visitor counting)
// plus a best-effort country derived from proxy/CDN headers.
export const visitorSessions = pgTable("visitor_sessions", {
	id: serial().primaryKey().notNull(),
	// Anonymous IDs minted client-side: session_id per visit, visitor_id persists across visits.
	sessionId: varchar("session_id").notNull().unique(),
	visitorId: varchar("visitor_id").notNull(),
	ipHash: varchar("ip_hash"),
	country: varchar(),
	// First-touch attribution captured when the session is created.
	referrer: text(),
	referrerDomain: varchar("referrer_domain"),
	utmSource: varchar("utm_source"),
	utmMedium: varchar("utm_medium"),
	utmCampaign: varchar("utm_campaign"),
	deviceType: varchar("device_type"),
	browser: varchar(),
	os: varchar(),
	landingPath: varchar("landing_path"),
	userAgent: text("user_agent"),
	isBot: boolean("is_bot").default(false).notNull(),
	// Set when the visitor is a logged-in customer (best-effort from their token).
	customerUserId: integer("customer_user_id"),
	pageviewCount: integer("pageview_count").default(0).notNull(),
	eventCount: integer("event_count").default(0).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_visitor_sessions_started").on(table.startedAt),
	index("idx_visitor_sessions_visitor").on(table.visitorId),
	index("idx_visitor_sessions_bot").on(table.isBot),
]);

export const analyticsEvents = pgTable("analytics_events", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id").notNull(),
	visitorId: varchar("visitor_id").notNull(),
	// 'pageview' | 'event'
	type: varchar().notNull(),
	// Custom event name (e.g. checkout_started); null for pageviews.
	name: varchar(),
	path: varchar(),
	referrer: text(),
	metadata: jsonb().$type<Record<string, unknown>>(),
	isBot: boolean("is_bot").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_analytics_events_created").on(table.createdAt),
	index("idx_analytics_events_session").on(table.sessionId),
	index("idx_analytics_events_type").on(table.type),
	index("idx_analytics_events_path").on(table.path),
	check("analytics_events_type_check", sql`(type)::text = ANY ((ARRAY['pageview'::character varying, 'event'::character varying])::text[])`),
]);

// Contact / partnership form submissions from the public store website.
export const contactSubmissions = pgTable("contact_submissions", {
	id: serial().primaryKey().notNull(),
	name: varchar().notNull(),
	companyName: varchar("company_name"),
	phone: varchar(),
	email: varchar().notNull(),
	service: varchar().default('PRAMAAN'),
	description: text(),
	source: varchar().default('store-website'),
	// Triage state for the admin inbox.
	status: varchar().default('new').notNull(),
	ipHash: varchar("ip_hash"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_contact_submissions_created").on(table.createdAt),
	index("idx_contact_submissions_status").on(table.status),
	check("contact_submissions_status_check", sql`(status)::text = ANY ((ARRAY['new'::character varying, 'read'::character varying, 'archived'::character varying])::text[])`),
]);

// Support tickets raised by B2C mobile customers (Android "Contact Support").
export const supportTickets = pgTable("support_tickets", {
	id: serial().primaryKey().notNull(),
	ticketId: varchar("ticket_id").notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	subject: varchar().notNull(),
	category: varchar(),
	message: text().notNull(),
	deviceId: varchar("device_id"),
	appVersion: varchar("app_version"),
	status: varchar().default('open').notNull(),
	priority: varchar().default('normal').notNull(),
	adminNote: text("admin_note"),
	submissionIp: varchar("submission_ip"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("idx_support_tickets_ticket_id").on(table.ticketId),
	index("idx_support_tickets_status").on(table.status),
	index("idx_support_tickets_created").on(table.createdAt),
	index("idx_support_tickets_customer").on(table.customerUserId, table.createdAt),
	check("support_tickets_status_check", sql`(status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[])`),
	check("support_tickets_priority_check", sql`(priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying])::text[])`),
]);

// Conversation messages on a support ticket (admin <-> mobile customer).
// ticketId is support_tickets.id (serial PK), not the public varchar ticket_id.
export const supportTicketMessages = pgTable("support_ticket_messages", {
	id: serial().primaryKey().notNull(),
	ticketId: integer("ticket_id").notNull(),
	sender: varchar().notNull(),
	senderAdminId: integer("sender_admin_id"),
	body: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_support_ticket_messages_ticket").on(table.ticketId, table.createdAt),
	check("support_ticket_messages_sender_check", sql`(sender)::text = ANY ((ARRAY['admin'::character varying, 'customer'::character varying])::text[])`),
]);

export const freeTrials = pgTable("free_trials", {
	id: serial().primaryKey().notNull(),
	email: varchar().notNull(),
	machineFingerprint: varchar("machine_fingerprint").notNull(),
	machineSerial: varchar("machine_serial").notNull(),
	macAddress: varchar("mac_address"),
	computerName: varchar("computer_name"),
	machineId: integer("machine_id"),
	trialStartUtc: timestamp("trial_start_utc", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	trialEndUtc: timestamp("trial_end_utc", { withTimezone: true, mode: 'string' }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokeReason: varchar("revoke_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const trialEmailBlocks = pgTable("trial_email_blocks", {
	id: serial().primaryKey().notNull(),
	email: varchar().notNull(),
	trialId: integer("trial_id").notNull(),
	blockedAt: timestamp("blocked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
	id: serial().primaryKey().notNull(),
	provider: varchar().notNull(),
	eventId: varchar("event_id").notNull(),
	eventType: varchar("event_type"),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	uniqueIndex("idx_payment_webhook_events_provider_event").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.eventId.asc().nullsLast().op("text_ops")),
]);

export const paymentGateways = pgTable("payment_gateways", {
	id: serial().primaryKey().notNull(),
	provider: varchar().notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	config: jsonb().$type<Record<string, any>>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	uniqueIndex("idx_payment_gateways_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
]);

// General/branding system settings, one JSONB blob per category (key='general').
export const appSettings = pgTable("app_settings", {
	key: varchar().primaryKey().notNull(),
	value: jsonb().$type<Record<string, any>>().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

// Email provider credentials (smtp | brevo | …), modelled on payment_gateways so
// more providers can be added later. Secrets live in config and are redacted on read.
export const emailProviders = pgTable("email_providers", {
	id: serial().primaryKey().notNull(),
	provider: varchar().notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	config: jsonb().$type<Record<string, any>>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	uniqueIndex("idx_email_providers_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
]);

// Pluggable SMS providers (admin-configured), mirroring email_providers.
// Exactly one is active at a time; config holds provider credentials.
export const smsProviders = pgTable("sms_providers", {
	id: serial().primaryKey().notNull(),
	provider: varchar().notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	config: jsonb().$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	uniqueIndex("idx_sms_providers_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
]);

// Admin-editable transactional email templates. A missing row means the code
// default (template registry) is used; editing creates/updates the override.
export const emailTemplates = pgTable("email_templates", {
	key: varchar().primaryKey().notNull(),
	name: varchar().notNull(),
	subject: text().notNull(),
	html: text().notNull(),
	text: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const appReleases = pgTable("app_releases", {
	id: serial().primaryKey().notNull(),
	platform: varchar().notNull(),
	channel: varchar().default('stable').notNull(),
	arch: varchar().default('universal').notNull(),
	version: varchar().notNull(),
	notes: text(),
	mandatory: boolean().default(false).notNull(),
	storeUrl: varchar("store_url"),
	fileName: varchar("file_name"),
	filePath: varchar("file_path"),
	fileSize: bigint("file_size", { mode: "number" }),
	contentType: varchar("content_type"),
	sha256: varchar(),
	isPublished: boolean("is_published").default(false).notNull(),
	downloadCount: integer("download_count").default(0).notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("idx_app_releases_platform_channel_arch_version").using("btree", table.platform, table.channel, table.arch, table.version),
	index("idx_app_releases_lookup").using("btree", table.platform, table.channel, table.isPublished),
]);
