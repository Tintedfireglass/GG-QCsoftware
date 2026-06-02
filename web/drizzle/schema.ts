import { pgTable, index, serial, varchar, timestamp, integer, uniqueIndex, text, boolean, bigint, jsonb, uuid, check } from "drizzle-orm/pg-core"
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
	pramaanScore: integer("pramaan_score"),
	pramaanGrade: varchar("pramaan_grade"),
	pramaanCategoryScores: jsonb("pramaan_category_scores"),
	pramaanRiskFlags: jsonb("pramaan_risk_flags"),
	pramaanAlgorithmVersion: varchar("pramaan_algorithm_version"),
	healthId: uuid("health_id"),
	pramaanHash: varchar("pramaan_hash"),
	appVersion: varchar("app_version"),
	submissionIp: varchar("submission_ip"),
	isDemo: boolean("is_demo").default(false),
	demoLicenseKeyId: integer("demo_license_key_id"),
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

export const pramaanScoringVersions = pgTable("pramaan_scoring_versions", {
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
}, (table) => [
	check("license_keys_type_check", sql`(type)::text = ANY ((ARRAY['single_use'::character varying, 'bulk'::character varying, 'demo'::character varying])::text[])`),
]);

export const licenseKeyActivations = pgTable("license_key_activations", {
	id: serial().primaryKey().notNull(),
	licenseKeyId: integer("license_key_id").notNull(),
	machineSerial: varchar("machine_serial").notNull(),
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
	email: varchar().notNull(),
	passwordHash: varchar("password_hash").notNull(),
	fullName: varchar("full_name"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const customerOrders = pgTable("customer_orders", {
	id: serial().primaryKey().notNull(),
	customerUserId: integer("customer_user_id").notNull(),
	plan: varchar().notNull(),
	amountCents: integer("amount_cents").notNull(),
	currency: varchar().default('INR').notNull(),
	status: varchar().default('pending').notNull(),
	paymentReference: varchar("payment_reference"),
	gatewayReference: varchar("gateway_reference"),
	checkoutState: varchar("checkout_state").notNull(),
	generatedLicenseKeyId: integer("generated_license_key_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

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
