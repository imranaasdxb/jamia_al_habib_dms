import { boolean, date, index, integer, jsonb, pgTable, text, timestamp,
  uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const PERSON_ROLES = ["ADMIN", "STAFF", "COLLECTOR"] as const;
export const PERSON_STATUSES = ["PENDING", "ACTIVE", "INACTIVE", "BLOCKED"] as const;

const auditColumns = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references((): AnyPgColumn => people.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => people.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  role: text("role", { enum: PERSON_ROLES }).notNull().default("STAFF"),
  status: text("status", { enum: PERSON_STATUSES }).notNull().default("PENDING"),
  language: text("language", { enum: ["en", "ur"] }).notNull().default("en"),
  profilePhotoKey: text("profile_photo_key"),
  age: integer("age"),
  gender: text("gender", { enum: ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"] }).notNull().default("UNSPECIFIED"),
  address: text("address").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  ...auditColumns(),
}, (table) => [index("people_role_status_idx").on(table.role, table.status)]);

export const bootstrapState = pgTable("bootstrap_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  slot: integer("slot").notNull().default(1).unique(),
  firstPersonId: uuid("first_person_id").references(() => people.id, { onDelete: "restrict" }),
  ...auditColumns(),
});

export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  slot: integer("slot").notNull().default(1).unique(),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(30),
  defaultReturnMonths: integer("default_return_months").notNull().default(11),
  ...auditColumns(),
});

export const userPermissions = pgTable("user_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  permission: text("permission").notNull(),
  allowed: boolean("allowed").notNull(),
  ...auditColumns(),
}, (table) => [uniqueIndex("user_permissions_person_key_idx").on(table.personId, table.permission)]);

export const appSessions = pgTable("app_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => [index("app_sessions_person_idx").on(table.personId)]);

export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyHash: text("key_hash").notNull().unique(),
  attempts: integer("attempts").notNull().default(1),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => people.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  recordId: text("record_id"),
  oldValues: jsonb("old_values").$type<Record<string, unknown>>(),
  newValues: jsonb("new_values").$type<Record<string, unknown>>(),
  reason: text("reason"),
  ...auditColumns(),
}, (table) => [index("activity_log_actor_date_idx").on(table.actorId, table.createdAt)]);

export type Person = typeof people.$inferSelect;

export const masterRecords = pgTable("master_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["EDITION", "BOOK_TYPE", "TOKEN_VALUE", "DONATION_CATEGORY", "DONATION_HEAD", "RESPONSIBILITY", "AREA",
    "PAYMENT_MODE", "UPI_APP", "BANK", "BANK_ACCOUNT", "RECEIPT_REASON", "FLAG_REASON"] }).notNull(),
  code: text("code").notNull(), nameEn: text("name_en").notNull(), nameUr: text("name_ur").notNull(),
  active: boolean("active").notNull().default(true), builtIn: boolean("built_in").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(1000),
  notes: text("notes").notNull().default(""), effectiveFrom: date("effective_from"),
  needsDetail: boolean("needs_detail").notNull().default(false),
  level: text("level", { enum: ["STATE", "DISTRICT", "BLOCK", "VILLAGE"] }),
  parentId: uuid("parent_id").references((): AnyPgColumn => masterRecords.id, { onDelete: "restrict" }),
  tokenValueRupees: integer("token_value_rupees"),
  accountName: text("account_name").notNull().default(""), lastFour: text("last_four").notNull().default(""),
  upiId: text("upi_id").notNull().default(""),
  ...auditColumns(),
}, (table) => [uniqueIndex("master_records_kind_code_idx").on(table.kind, table.code),
  index("master_records_kind_active_idx").on(table.kind, table.active), index("master_records_parent_idx").on(table.parentId)]);

export const collectors = pgTable("collectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().unique().references(() => people.id, { onDelete: "restrict" }),
  code: text("code").notNull().unique().default(sql`'COL-' || lpad(nextval('public.collector_number_seq')::text, 6, '0')`),
  fatherName: text("father_name").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  idProofName: text("id_proof_name").notNull().default(""),
  commissionBasisPoints: integer("commission_basis_points"),
  village: text("village").notNull(), postOffice: text("post_office").notNull(),
  block: text("block").notNull().default(""), district: text("district").notNull(),
  state: text("state").notNull().default("Odisha"), pin: text("pin").notNull(),
  ...auditColumns(),
}, (table) => [index("collectors_area_idx").on(table.district, table.village)]);

export const collectorEditRequests = pgTable("collector_edit_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectorId: uuid("collector_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by").notNull().references(() => people.id, { onDelete: "restrict" }),
  version: text("version").notNull(),
  oldValues: jsonb("old_values").$type<Record<string, unknown>>().notNull(),
  newValues: jsonb("new_values").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  photoChanged: boolean("photo_changed").notNull().default(false),
  proposedPhotoKey: text("proposed_photo_key"),
  oldHasPhoto: boolean("old_has_photo").notNull(),
  status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] }).notNull().default("PENDING"),
  reviewedBy: uuid("reviewed_by").references(() => people.id, { onDelete: "restrict" }),
  reviewNote: text("review_note").notNull().default(""),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => [index("collector_requests_status_idx").on(table.status, table.createdAt)]);

export const userVerificationFlows = pgTable("user_verification_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  actorId: uuid("actor_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  targetEmail: text("target_email").notNull(),
  purpose: text("purpose", { enum: ["ONBOARD", "EMAIL_CHANGE", "PROFILE_CHANGE"] }).notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  priorStatus: text("prior_status", { enum: PERSON_STATUSES }).notNull(),
  state: text("state", { enum: ["PREPARING", "CODE_SENT", "VERIFIED", "COMPLETE"] }).notNull().default("PREPARING"),
  attempts: integer("attempts").notNull().default(0),
  operationId: uuid("operation_id"),
  busyUntil: timestamp("busy_until", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => [index("user_verification_flows_person_idx").on(table.personId)]);
