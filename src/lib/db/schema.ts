import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp,
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

export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(), bookNumber: text("book_number").notNull().unique(),
  stockDate: date("stock_date").notNull(), editionId: uuid("edition_id").notNull().references(() => masterRecords.id, { onDelete: "restrict" }),
  editionNameEn: text("edition_name_en").notNull(), editionNameUr: text("edition_name_ur").notNull(),
  bookType: text("book_type", { enum: ["REGULAR", "TOKEN"] }).notNull(), tokenValuePaise: integer("token_value_paise"),
  receiptFrom: integer("receipt_from").notNull(), receiptTo: integer("receipt_to").notNull(),
  totalReceipts: integer("total_receipts").notNull().generatedAlwaysAs(sql`receipt_to - receipt_from + 1`),
  faceValuePaise: bigint("face_value_paise", { mode: "number" }).generatedAlwaysAs(sql`case when book_type = 'TOKEN'
    then (receipt_to::bigint - receipt_from::bigint + 1) * token_value_paise::bigint else null end`),
  status: text("status", { enum: ["IN_STOCK", "ASSIGNED", "FLAGGED", "CLOSED", "PARTLY_USED", "LEFTOVER_ASSIGNED", "LOST"] }).notNull().default("IN_STOCK"),
  remarks: text("remarks").notNull().default(""), entryByName: text("entry_by_name").notNull(),
  operationId: uuid("operation_id").notNull(), operationHash: text("operation_hash").notNull(),
  ...auditColumns(),
}, (table) => [index("books_edition_type_idx").on(table.editionId, table.bookType),
  index("books_operation_idx").on(table.operationId), index("books_stock_date_idx").on(table.stockDate)]);

export const bookAssignments = pgTable("book_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source", { enum: ["NEW", "LEFTOVER"] }).notNull().default("NEW"),
  leftoverIds: jsonb("leftover_ids").$type<string[]>().notNull().default([]),
  number: text("number").notNull().unique().default(sql`'ASN-' || extract(year from current_date)::text || '-' || lpad(nextval('public.assignment_number_seq')::text, 6, '0')`),
  assignmentDate: date("assignment_date").notNull(), expectedReturnDate: date("expected_return_date").notNull(),
  collectorId: uuid("collector_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  collectorName: text("collector_name").notNull(), collectorCode: text("collector_code").notNull(),
  phone: text("phone").notNull(), whatsapp: text("whatsapp").notNull(), address: text("address").notNull(),
  areas: jsonb("areas").$type<{ id: string; nameEn: string; nameUr: string }[]>().notNull(),
  bookIds: jsonb("book_ids").$type<string[]>().notNull(), remarks: text("remarks").notNull().default(""),
  assignedByName: text("assigned_by_name").notNull(),
  operationId: uuid("operation_id").notNull().unique(), operationHash: text("operation_hash").notNull(),
  ...auditColumns(),
}, (table) => [index("book_assignments_collector_idx").on(table.collectorId),
  index("book_assignments_return_idx").on(table.expectedReturnDate)]);

export const bookCases = pgTable("book_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => bookAssignments.id, { onDelete: "restrict" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  receiptFrom: integer("receipt_from").notNull(), receiptTo: integer("receipt_to").notNull(),
  source: text("source", { enum: ["NEW", "LEFTOVER"] }).notNull().default("NEW"), sourceCode: text("source_code").notNull(),
  leftoverId: uuid("leftover_id").unique().references((): AnyPgColumn => leftoverBooks.id, { onDelete: "restrict" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("book_cases_open_book_idx").on(table.bookId).where(sql`closed_at is null`),
  uniqueIndex("book_cases_assignment_book_idx").on(table.assignmentId, table.bookId)]);

export const bookLosses = pgTable("book_losses", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().unique().references(() => bookCases.id, { onDelete: "restrict" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  assignmentId: uuid("assignment_id").notNull().references(() => bookAssignments.id, { onDelete: "restrict" }),
  collectorId: uuid("collector_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  receiptFrom: integer("receipt_from").notNull(), receiptTo: integer("receipt_to").notNull(),
  sourceCode: text("source_code").notNull(), reason: text("reason").notNull(),
  reportedByName: text("reported_by_name").notNull(),
  ...auditColumns(),
}, (table) => [index("book_losses_book_idx").on(table.bookId), index("book_losses_collector_idx").on(table.collectorId)]);

export const bookReturns = pgTable("book_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique().default(sql`'RET-' || extract(year from current_date)::text || '-' || lpad(nextval('public.return_number_seq')::text, 6, '0')`),
  caseId: uuid("case_id").notNull().unique().references(() => bookCases.id, { onDelete: "restrict" }),
  sourceCode: text("source_code").notNull().default(""),
  submissionPending: boolean("submission_pending").notNull().default(false),
  receiptEntryVersion: integer("receipt_entry_version").notNull().default(0), finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  assignmentId: uuid("assignment_id").notNull().references(() => bookAssignments.id, { onDelete: "restrict" }),
  bookNumber: text("book_number").notNull(), collectorName: text("collector_name").notNull(), returnDate: date("return_date").notNull(),
  outcome: text("outcome", { enum: ["CLOSED", "PARTLY_USED", "FLAGGED"] }).notNull(),
  totalPaise: bigint("total_paise", { mode: "number" }).notNull(), cashPaise: bigint("cash_paise", { mode: "number" }).notNull(),
  digitalPaise: bigint("digital_paise", { mode: "number" }).notNull(), receiptSumPaise: bigint("receipt_sum_paise", { mode: "number" }).notNull(),
  receiptFrom: integer("receipt_from").notNull(), receiptTo: integer("receipt_to").notNull(), receiptsUsed: integer("receipts_used").notNull(),
  lastUsed: integer("last_used"), remainingReceipts: integer("remaining_receipts").notNull().generatedAlwaysAs(sql`case when last_used is null then receipt_to - receipt_from + 1 else receipt_to - last_used end`),
  commissionBasisPoints: integer("commission_basis_points").notNull(),
  commissionPaise: bigint("commission_paise", { mode: "number" }).notNull().generatedAlwaysAs(sql`round(total_paise::numeric * commission_basis_points / 1000000) * 100`),
  netPaise: bigint("net_paise", { mode: "number" }).notNull().generatedAlwaysAs(sql`total_paise - round(total_paise::numeric * commission_basis_points / 1000000) * 100`),
  cashHandoverPaise: bigint("cash_handover_paise", { mode: "number" }).notNull().generatedAlwaysAs(sql`cash_paise - round(total_paise::numeric * commission_basis_points / 1000000) * 100`),
  commissionGiven: boolean("commission_given").notNull().default(false),
  exceptions: jsonb("exceptions").$type<{ receiptNumber: number; status: "CANCELLED" | "TORN" | "LOST"; reasonId: string; reasonEn: string; reasonUr: string }[]>().notNull().default([]),
  flagReasonId: uuid("flag_reason_id").references(() => masterRecords.id, { onDelete: "restrict" }),
  flagReasonEn: text("flag_reason_en").notNull().default(""), flagReasonUr: text("flag_reason_ur").notNull().default(""),
  expectedPaise: bigint("expected_paise", { mode: "number" }), foundPaise: bigint("found_paise", { mode: "number" }),
  remarks: text("remarks").notNull().default(""), checkedByName: text("checked_by_name").notNull(),
  receiptEntryStatus: text("receipt_entry_status", { enum: ["PENDING", "DRAFT", "RECONCILED", "FLAGGED"] }).notNull().default("PENDING"),
  operationId: uuid("operation_id").notNull().unique(), operationHash: text("operation_hash").notNull(), ...auditColumns(),
}, (table) => [index("book_returns_book_idx").on(table.bookId), index("book_returns_queue_idx").on(table.receiptEntryStatus, table.createdAt)]);

export const bookFlags = pgTable("book_flags", {
  id: uuid("id").primaryKey().defaultRandom(), returnId: uuid("return_id").notNull().unique().references(() => bookReturns.id, { onDelete: "restrict" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  collectorId: uuid("collector_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  reasonId: uuid("reason_id").notNull().references(() => masterRecords.id, { onDelete: "restrict" }),
  reasonEn: text("reason_en").notNull(), reasonUr: text("reason_ur").notNull(),
  expectedPaise: bigint("expected_paise", { mode: "number" }).notNull(), foundPaise: bigint("found_paise", { mode: "number" }).notNull(),
  differencePaise: bigint("difference_paise", { mode: "number" }).notNull().generatedAlwaysAs(sql`expected_paise - found_paise`),
  status: text("status", { enum: ["OPEN", "UNDER_REVIEW", "RESOLVED"] }).notNull().default("OPEN"),
  remarks: text("remarks").notNull(), ...auditColumns(),
  reconciliation: jsonb("reconciliation").$type<Record<string, unknown>>().notNull().default({}),
});

export const bookReceipts = pgTable("book_receipts", {
  id: uuid("id").primaryKey().defaultRandom(), returnId: uuid("return_id").notNull().references(() => bookReturns.id, { onDelete: "restrict" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }), number: integer("receipt_number").notNull().unique(),
  checked: boolean("checked").notNull().default(false),
  data: jsonb("data").$type<import("@/modules/receipts/receipts.schema").ReceiptValues>().notNull(),
  labels: jsonb("labels").$type<Record<string, { nameEn: string; nameUr: string }>>().notNull().default({}),
  status: text("status", { enum: ["VALID", "CANCELLED", "TORN", "LOST", "BLANK"] }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }), phone: text("phone").notNull().default(""),
  reference: text("reference"), photoKey: text("photo_key"), version: integer("version").notNull().default(1), entryByName: text("entry_by_name").notNull(), ...auditColumns(),
}, (table) => [index("book_receipts_return_idx").on(table.returnId, table.number), index("book_receipts_phone_idx").on(table.phone)]);

export const paymentReferences = pgTable("payment_references", {
  reference: text("reference").primaryKey(), sourceType: text("source_type", { enum: ["RECEIPT", "DONATION"] }).notNull(),
  sourceId: uuid("source_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("payment_references_source_idx").on(table.sourceType, table.sourceId)]);

export const receiptEditRequests = pgTable("receipt_edit_requests", {
  id: uuid("id").primaryKey().defaultRandom(), returnId: uuid("return_id").notNull().references(() => bookReturns.id),
  receiptId: uuid("receipt_id").notNull().references(() => bookReceipts.id), receiptNumber: integer("receipt_number").notNull(),
  requestedBy: uuid("requested_by").notNull().references(() => people.id), requestedByName: text("requested_by_name").notNull(),
  reason: text("reason").notNull(), baseVersion: integer("base_version").notNull(),
  status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED", "USED"] }).notNull().default("PENDING"),
  reviewNote: text("review_note").notNull().default(""), reviewedBy: uuid("reviewed_by").references(() => people.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const receiptIssues = pgTable("receipt_issues", {
  id: uuid("id").primaryKey().defaultRandom(), returnId: uuid("return_id").notNull().references(() => bookReturns.id),
  receiptNumber: integer("receipt_number").notNull(), raisedBy: uuid("raised_by").notNull().references(() => people.id),
  raisedByName: text("raised_by_name").notNull(), reason: text("reason").notNull(),
  status: text("status", { enum: ["OPEN", "RESOLVED"] }).notNull().default("OPEN"), resolution: text("resolution").notNull().default(""),
  resolvedBy: uuid("resolved_by").references(() => people.id), resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leftoverBooks = pgTable("leftover_books", {
  id: uuid("id").primaryKey().defaultRandom(), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  returnId: uuid("return_id").notNull().unique().references(() => bookReturns.id, { onDelete: "restrict" }),
  returnedBy: uuid("returned_by").notNull().references(() => people.id, { onDelete: "restrict" }),
  code: text("code").notNull().unique(), ordinal: integer("ordinal").notNull(),
  receiptFrom: integer("receipt_from").notNull(), receiptTo: integer("receipt_to").notNull(),
  status: text("status", { enum: ["AVAILABLE", "ASSIGNED", "HELD"] }).notNull().default("AVAILABLE"), ...auditColumns(),
});

export const collectors = pgTable("collectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().unique().references(() => people.id, { onDelete: "restrict" }),
  code: text("code").notNull().unique().default(sql`'COL-' || lpad(nextval('public.collector_number_seq')::text, 6, '0')`),
  fatherName: text("father_name").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  idProofName: text("id_proof_name").notNull().default(""),
  commissionBasisPoints: integer("commission_basis_points"),
  leftoverEligible: boolean("leftover_eligible").notNull().default(false),
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
